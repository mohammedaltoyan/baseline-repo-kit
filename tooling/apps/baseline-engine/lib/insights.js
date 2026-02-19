'use strict';

const { deriveBranchRolePolicies } = require('./policy/branching');
const { buildEffectiveConfig } = require('./policy/effective-settings');
const { evaluateGithubEntitlements } = require('./policy/entitlements');
const { deriveRequiredChecksByRole } = require('./policy/required-checks');
const { computeAdaptiveReviewThresholds, resolveActiveReviewPolicy } = require('./policy/reviewers');

const REVIEW_BUCKETS = Object.freeze([
  {
    id: 'maintainers_le_1',
    label: '<=1 maintainer',
    min: 0,
    max: 1,
  },
  {
    id: 'maintainers_2_to_5',
    label: '2-5 maintainers',
    min: 2,
    max: 5,
  },
  {
    id: 'maintainers_ge_6',
    label: '>=6 maintainers',
    min: 6,
    max: null,
  },
]);

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of (Array.isArray(values) ? values : [])) {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function toMatrixKey(environment, component) {
  return `${String(environment || '').trim()}::${String(component || '').trim()}`;
}

function normalizeRoleCounts(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    admin: Math.max(0, Number(source.admin || 0)),
    maintain: Math.max(0, Number(source.maintain || 0)),
    write: Math.max(0, Number(source.write || 0)),
  };
}

function normalizeReviewerPolicy(value, fallback) {
  const source = value && typeof value === 'object' ? value : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {
    required_non_author_approvals: 0,
    require_strict_ci: true,
    require_codeowners: false,
  };
  return {
    required_non_author_approvals: Math.max(
      0,
      Number.isFinite(Number(source.required_non_author_approvals))
        ? Number(source.required_non_author_approvals)
        : Number(base.required_non_author_approvals || 0)
    ),
    require_strict_ci: source.require_strict_ci == null ? !!base.require_strict_ci : !!source.require_strict_ci,
    require_codeowners: source.require_codeowners == null ? !!base.require_codeowners : !!source.require_codeowners,
  };
}

function matrixCoverage(config) {
  const deployments = config && config.deployments && typeof config.deployments === 'object'
    ? config.deployments
    : {};
  const environments = Array.isArray(deployments.environments) ? deployments.environments : [];
  const components = Array.isArray(deployments.components) ? deployments.components : [];
  const rows = Array.isArray(deployments.approval_matrix) ? deployments.approval_matrix : [];

  const expectedRows = [];
  for (const env of environments) {
    const envName = String(env && env.name || '').trim();
    if (!envName) continue;
    for (const component of components) {
      const componentId = String(component && component.id || '').trim();
      if (!componentId) continue;
      expectedRows.push({
        environment: envName,
        component: componentId,
      });
    }
  }

  const expected = new Set(expectedRows.map((entry) => toMatrixKey(entry.environment, entry.component)));
  const actual = new Set();
  const duplicateKeys = new Set();

  for (const row of rows) {
    const key = toMatrixKey(row && row.environment, row && row.component);
    if (!key || key === '::') continue;
    if (actual.has(key)) duplicateKeys.add(key);
    actual.add(key);
  }

  const missingRows = expectedRows.filter((entry) => !actual.has(toMatrixKey(entry.environment, entry.component)));
  const staleRows = rows.filter((entry) => !expected.has(toMatrixKey(entry && entry.environment, entry && entry.component)));

  return {
    expected_rows: expectedRows.length,
    actual_rows: rows.length,
    missing_rows: missingRows,
    stale_rows: staleRows.map((entry) => ({
      environment: String(entry && entry.environment || ''),
      component: String(entry && entry.component || ''),
    })),
    duplicate_row_keys: Array.from(duplicateKeys).sort(),
    healthy: missingRows.length === 0 && staleRows.length === 0 && duplicateKeys.size === 0,
  };
}

function reviewerThresholdRows({ thresholds, defaults, activeBucket }) {
  return REVIEW_BUCKETS.map((bucket) => {
    const selected = normalizeReviewerPolicy(
      thresholds && thresholds[bucket.id],
      defaults && defaults[bucket.id]
    );
    return {
      bucket: bucket.id,
      label: bucket.label,
      maintainer_range: bucket.max == null ? `${bucket.min}+` : `${bucket.min}-${bucket.max}`,
      applies: bucket.id === activeBucket,
      policy: selected,
    };
  });
}

function reviewerInsights(config, capabilities) {
  const maintainerCount = Number(capabilities
    && capabilities.collaborators
    && capabilities.collaborators.maintainer_count || 0);
  const adaptive = computeAdaptiveReviewThresholds(maintainerCount);
  const thresholds = config
    && config.branching
    && config.branching.review_thresholds
    && typeof config.branching.review_thresholds === 'object'
    ? config.branching.review_thresholds
    : adaptive.defaults;

  const thresholdRows = reviewerThresholdRows({
    thresholds,
    defaults: adaptive.defaults,
    activeBucket: adaptive.active_bucket,
  });
  const normalizedThresholds = Object.fromEntries(
    thresholdRows.map((row) => [row.bucket, row.policy])
  );
  const resolved = resolveActiveReviewPolicy({
    maintainerCount,
    thresholds: normalizedThresholds,
  });

  return {
    ...resolved,
    thresholds: normalizedThresholds,
    threshold_rows: thresholdRows,
    active_reason: `Maintainer count ${resolved.maintainer_count} matched ${resolved.active_bucket}.`,
  };
}

function branchInsights(config, activeReviewPolicy) {
  const branching = config && config.branching && typeof config.branching === 'object'
    ? config.branching
    : {};
  const branches = Array.isArray(branching.branches) ? branching.branches : [];
  const roles = uniqueStrings(branches.map((entry) => String(entry && entry.role || '').trim()).filter(Boolean));
  const topology = String(branching.topology || 'two_branch').trim();
  const source = topology === 'custom' ? 'custom' : 'topology_preset';
  const enabledModules = Array.isArray(config && config.modules && config.modules.enabled)
    ? config.modules.enabled
    : [];
  const requiredChecksByRole = deriveRequiredChecksByRole({
    enabledModules,
    activeReviewPolicy,
  });
  const rolePolicies = deriveBranchRolePolicies({
    branches,
    requiredChecksByRole,
  });
  const roleCounts = {};
  let protectedCount = 0;
  for (const row of rolePolicies) {
    const role = String(row && row.role || 'custom').trim() || 'custom';
    roleCounts[role] = Number(roleCounts[role] || 0) + 1;
    if (row && row.protected) protectedCount += 1;
  }

  return {
    topology,
    source,
    branch_count: branches.length,
    protected_count: protectedCount,
    roles,
    role_counts: roleCounts,
    required_checks_by_role: requiredChecksByRole,
    branch_role_policies: rolePolicies,
  };
}

function summarizeMatrixRows(rows, keyField) {
  const map = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const key = String(row && row[keyField] || '').trim();
    if (!key) continue;
    const current = map.get(key) || {
      key,
      total_rows: 0,
      approval_required_rows: 0,
      self_approval_allowed_rows: 0,
      max_min_approvers: 0,
    };
    current.total_rows += 1;
    if (row && row.approval_required) current.approval_required_rows += 1;
    if (row && row.allow_self_approval) current.self_approval_allowed_rows += 1;
    current.max_min_approvers = Math.max(
      current.max_min_approvers,
      Math.max(0, Number(row && row.min_approvers || 0))
    );
    map.set(key, current);
  }
  return Array.from(map.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => ({
      [keyField === 'environment' ? 'environment' : 'component']: entry.key,
      total_rows: entry.total_rows,
      approval_required_rows: entry.approval_required_rows,
      self_approval_allowed_rows: entry.self_approval_allowed_rows,
      max_min_approvers: entry.max_min_approvers,
    }));
}

function deploymentInsights(config, capabilities, entitlements) {
  const deployments = config && config.deployments && typeof config.deployments === 'object'
    ? config.deployments
    : {};
  const rows = Array.isArray(deployments.approval_matrix) ? deployments.approval_matrix : [];
  const matrix = matrixCoverage(config);
  const environmentsCapability = capabilities
    && capabilities.capabilities
    && capabilities.capabilities.environments
    && typeof capabilities.capabilities.environments === 'object'
    ? capabilities.capabilities.environments
    : null;
  const enforcementMode = environmentsCapability && environmentsCapability.supported === true
    ? 'enforced'
    : 'advisory';
  const enforcementReason = environmentsCapability
    ? String(environmentsCapability.reason || environmentsCapability.state || 'unknown')
    : 'capability_unavailable';
  const entitlementRequiredReviewers = entitlements
    && entitlements.by_feature
    && entitlements.by_feature.environment_required_reviewers
    && typeof entitlements.by_feature.environment_required_reviewers === 'object'
    ? entitlements.by_feature.environment_required_reviewers
    : null;
  const approvalRequiredRows = rows.filter((row) => !!(row && row.approval_required)).length;

  return {
    matrix,
    environment_count: Number(Array.isArray(deployments.environments) ? deployments.environments.length : 0),
    component_count: Number(Array.isArray(deployments.components) ? deployments.components.length : 0),
    approval_required_rows: approvalRequiredRows,
    self_approval_allowed_rows: rows.filter((row) => !!(row && row.allow_self_approval)).length,
    advisory_rows: enforcementMode === 'advisory' ? approvalRequiredRows : 0,
    enforcement: {
      mode: enforcementMode,
      reason: enforcementReason,
      capability_state: environmentsCapability ? String(environmentsCapability.state || 'unknown') : 'unknown',
      entitlement_state: entitlementRequiredReviewers ? String(entitlementRequiredReviewers.state || 'unknown') : 'unknown',
    },
    rows_by_environment: summarizeMatrixRows(rows, 'environment'),
    rows_by_component: summarizeMatrixRows(rows, 'component'),
  };
}

function buildCapabilityMatrix(capabilities, moduleEvaluation) {
  const capMap = capabilities && capabilities.capabilities && typeof capabilities.capabilities === 'object'
    ? capabilities.capabilities
    : {};
  const remediation = new Map();
  const modules = Array.isArray(moduleEvaluation && moduleEvaluation.modules) ? moduleEvaluation.modules : [];
  for (const entry of modules) {
    for (const missing of (Array.isArray(entry && entry.missing) ? entry.missing : [])) {
      const capability = String(missing && missing.capability || '').trim();
      if (!capability || remediation.has(capability)) continue;
      remediation.set(capability, String(missing && missing.remediation || '').trim());
    }
  }

  return Object.entries(capMap)
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([capability, value]) => {
      const cap = value && typeof value === 'object' ? value : {};
      return {
        capability: String(capability),
        supported: cap.supported === true,
        state: String(cap.state || 'unknown'),
        reason: String(cap.reason || 'unknown'),
        remediation: remediation.get(String(capability)) || '',
        source: 'runtime_probe',
      };
    });
}

function mergeCapabilityMatrixWithEntitlements(capabilityMatrix, entitlements) {
  const rows = Array.isArray(capabilityMatrix) ? capabilityMatrix.map((entry) => ({ ...entry })) : [];
  const map = new Map(rows.map((entry) => [String(entry && entry.capability || ''), entry]));
  const features = entitlements && Array.isArray(entitlements.features) ? entitlements.features : [];

  for (const feature of features) {
    const capability = String(feature && feature.feature || '').trim();
    if (!capability) continue;
    const existing = map.get(capability);
    if (existing) {
      existing.entitlement_state = String(feature.state || 'unknown');
      existing.entitlement_reason = String(feature.reason || 'unknown');
      existing.docs_url = String(feature.docs_url || '');
      if (!existing.remediation) existing.remediation = String(feature.remediation || '');
      continue;
    }
    rows.push({
      capability,
      supported: null,
      state: String(feature.state || 'unknown'),
      reason: String(feature.reason || 'unknown'),
      remediation: String(feature.remediation || ''),
      source: 'entitlement_advisory',
      docs_url: String(feature.docs_url || ''),
      entitlement_state: String(feature.state || 'unknown'),
      entitlement_reason: String(feature.reason || 'unknown'),
    });
  }

  rows.sort((a, b) => String(a && a.capability || '').localeCompare(String(b && b.capability || '')));
  return rows;
}

function githubAppInsights(moduleEvaluation) {
  const source = moduleEvaluation && moduleEvaluation.github_app && typeof moduleEvaluation.github_app === 'object'
    ? moduleEvaluation.github_app
    : {
      required_for_full_feature_set: false,
      policy_requires_app: false,
      effective_required: false,
      reason: 'unknown',
    };
  let status = 'not_required';
  if (source.required_for_full_feature_set) status = 'recommended_for_full_feature_set';
  if (source.effective_required) status = 'required';

  return {
    ...source,
    status,
  };
}

function capabilitySummary(capabilities) {
  const repo = capabilities && capabilities.repository && typeof capabilities.repository === 'object'
    ? capabilities.repository
    : {};
  const auth = capabilities && capabilities.auth && typeof capabilities.auth === 'object'
    ? capabilities.auth
    : {};
  const collaborators = capabilities && capabilities.collaborators && typeof capabilities.collaborators === 'object'
    ? capabilities.collaborators
    : {};

  return {
    owner_type: String(repo.owner_type || 'unknown'),
    repository_private: !!repo.private,
    repository_visibility: repo.private === true ? 'private' : 'public_or_unknown',
    repo_admin: !!(repo.permissions && repo.permissions.admin),
    token_present: !!auth.token_present,
    token_source: String(auth.token_source || 'unknown'),
    token_scope_count: Array.isArray(auth.token_scopes) ? auth.token_scopes.length : 0,
    viewer_login: String(auth.viewer_login || ''),
    maintainer_count: Math.max(0, Number(collaborators.maintainer_count || 0)),
    maintainer_logins: uniqueStrings(collaborators.maintainers),
    role_counts: normalizeRoleCounts(collaborators.role_counts),
  };
}

function buildInsights({ config, capabilities, moduleEvaluation }) {
  const effectiveSettings = buildEffectiveConfig({
    config,
    capabilities,
    moduleEvaluation,
  });
  const capability = capabilitySummary(capabilities);
  const entitlements = evaluateGithubEntitlements({
    ownerType: capability.owner_type,
    repositoryPrivate: capability.repository_private,
  });
  const reviewer = reviewerInsights(config, capabilities);
  const branch = branchInsights(config, reviewer.policy);
  const deployments = deploymentInsights(config, capabilities, entitlements);
  const githubApp = githubAppInsights(moduleEvaluation);
  const capabilityMatrix = mergeCapabilityMatrixWithEntitlements(
    buildCapabilityMatrix(capabilities, moduleEvaluation),
    entitlements
  );

  return {
    capability,
    effective_settings: effectiveSettings,
    entitlements,
    capability_matrix: capabilityMatrix,
    reviewer,
    branching: branch,
    deployments,
    github_app: githubApp,
  };
}

module.exports = {
  buildInsights,
};
