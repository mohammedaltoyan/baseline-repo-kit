'use strict';

const { resolveTopology } = require('./branching');
const { buildApprovalMatrix, defaultEnvironments } = require('./deployments');

const BRANCH_ROLES = new Set(['integration', 'production', 'hotfix', 'release', 'feature', 'custom']);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

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

function normalizeTopology(value) {
  const topology = String(value || '').trim().toLowerCase();
  if (['two_branch', 'three_branch', 'trunk', 'custom'].includes(topology)) return topology;
  return 'two_branch';
}

function sanitizeBranchDefinition(value) {
  const source = value && typeof value === 'object' ? value : {};
  const name = String(source.name || '').trim();
  if (!name) return null;

  const roleRaw = String(source.role || 'custom').trim().toLowerCase();
  const role = BRANCH_ROLES.has(roleRaw) ? roleRaw : 'custom';
  const allowedSources = uniqueStrings(source.allowed_sources);

  return {
    name,
    role,
    protected: !!source.protected,
    allowed_sources: allowedSources,
  };
}

function normalizeBranchingSection(branching) {
  const source = branching && typeof branching === 'object' ? branching : {};
  const topology = normalizeTopology(source.topology);
  const rawBranches = Array.isArray(source.branches) ? source.branches : [];
  let branchSource = 'custom';
  let branches = [];

  if (topology === 'custom') {
    branches = rawBranches.map(sanitizeBranchDefinition).filter(Boolean);
    if (branches.length === 0) {
      branches = resolveTopology('two_branch');
      branchSource = 'custom_fallback_two_branch';
    } else {
      branchSource = 'custom';
    }
  } else {
    branches = resolveTopology(topology);
    branchSource = 'topology_preset';
  }

  return {
    branching: {
      ...source,
      topology,
      branches,
    },
    decision: {
      topology,
      branch_source: branchSource,
      branch_count: branches.length,
      branch_names: branches.map((entry) => entry.name),
    },
  };
}

function sanitizeEnvironment(value) {
  const source = value && typeof value === 'object' ? value : {};
  const name = String(source.name || '').trim();
  if (!name) return null;
  return {
    name,
    branch_roles: uniqueStrings(source.branch_roles),
    default: !!source.default,
  };
}

function sanitizeComponent(value) {
  const source = value && typeof value === 'object' ? value : {};
  const id = String(source.id || '').trim();
  if (!id) return null;
  return {
    id,
    name: String(source.name || id).trim() || id,
    path: String(source.path || '.').trim() || '.',
    enabled: source.enabled !== false,
  };
}

function uniqueByKey(values, keySelector) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const key = String(keySelector(value) || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function toMatrixKey(environment, component) {
  return `${String(environment || '').trim()}::${String(component || '').trim()}`;
}

function sanitizeApprovalRule(value, fallback) {
  const source = value && typeof value === 'object' ? value : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  let approvalRequired = typeof source.approval_required === 'boolean'
    ? source.approval_required
    : !!base.approval_required;
  let minApprovers = Number.isFinite(Number(source.min_approvers))
    ? Math.max(0, Number(source.min_approvers))
    : Math.max(0, Number(base.min_approvers || 0));

  if (approvalRequired === false) {
    minApprovers = 0;
  }
  if (minApprovers > 0) {
    approvalRequired = true;
  }

  const allowedRoles = uniqueStrings(Array.isArray(source.allowed_roles) ? source.allowed_roles : base.allowed_roles);
  const hasExplicitSelfApproval = typeof source.allow_self_approval === 'boolean';
  const allowSelfApproval = hasExplicitSelfApproval
    ? source.allow_self_approval
    : !!base.allow_self_approval;

  return {
    ...base,
    approval_required: approvalRequired,
    min_approvers: minApprovers,
    allow_self_approval: !!allowSelfApproval,
    allowed_roles: allowedRoles.length > 0 ? allowedRoles : uniqueStrings(base.allowed_roles),
  };
}

function normalizeApprovalMatrix({ environments, components, approvalMatrix, policyProfile }) {
  const defaults = buildApprovalMatrix({
    environments,
    components,
    policyProfile,
  });

  const expectedKeys = new Set(defaults.map((entry) => toMatrixKey(entry.environment, entry.component)));
  const providedRows = Array.isArray(approvalMatrix) ? approvalMatrix : [];
  const reusable = new Map();
  let duplicateRows = 0;

  for (const row of providedRows) {
    const envName = String(row && row.environment || '').trim();
    const componentId = String(row && row.component || '').trim();
    const key = toMatrixKey(envName, componentId);
    if (!expectedKeys.has(key)) continue;
    if (reusable.has(key)) {
      duplicateRows += 1;
      continue;
    }
    reusable.set(key, row);
  }

  const normalized = defaults.map((baseRow) => {
    const key = toMatrixKey(baseRow.environment, baseRow.component);
    const selected = reusable.get(key);
    return sanitizeApprovalRule(selected, baseRow);
  });

  const reusedRows = normalized.filter((row) => reusable.has(toMatrixKey(row.environment, row.component))).length;
  const droppedRows = providedRows.length - reusedRows - duplicateRows;

  return {
    approval_matrix: normalized,
    decision: {
      expected_rows: defaults.length,
      provided_rows: providedRows.length,
      applied_rows: normalized.length,
      reused_rows: reusedRows,
      added_rows: Math.max(0, defaults.length - reusedRows),
      dropped_rows: Math.max(0, droppedRows),
      duplicate_rows: duplicateRows,
    },
  };
}

function normalizeDeploymentsSection(deployments, policyProfile) {
  const source = deployments && typeof deployments === 'object' ? deployments : {};
  const sanitizedEnvironments = uniqueByKey(
    (Array.isArray(source.environments) ? source.environments : []).map(sanitizeEnvironment).filter(Boolean),
    (entry) => entry.name
  );
  const environments = sanitizedEnvironments.length > 0 ? sanitizedEnvironments : defaultEnvironments();

  const components = uniqueByKey(
    (Array.isArray(source.components) ? source.components : []).map(sanitizeComponent).filter(Boolean),
    (entry) => entry.id
  );
  if (components.length === 0) {
    components.push({
      id: 'application',
      name: 'application',
      path: 'apps',
      enabled: true,
    });
  }

  const matrix = normalizeApprovalMatrix({
    environments,
    components,
    approvalMatrix: source.approval_matrix,
    policyProfile,
  });

  return {
    deployments: {
      ...source,
      environments,
      components,
      approval_matrix: matrix.approval_matrix,
    },
    decision: {
      environment_count: environments.length,
      component_count: components.length,
      matrix: matrix.decision,
    },
  };
}

function normalizeDynamicConfig(config) {
  const source = config && typeof config === 'object' ? config : {};
  const next = cloneJson(source);

  const branching = normalizeBranchingSection(next.branching);
  next.branching = branching.branching;

  const policyProfile = String(next && next.policy && next.policy.profile || 'strict').trim().toLowerCase() || 'strict';
  const deployments = normalizeDeploymentsSection(next.deployments, policyProfile);
  next.deployments = deployments.deployments;

  return {
    config: next,
    decisions: {
      branching: branching.decision,
      deployments: deployments.decision,
    },
  };
}

module.exports = {
  normalizeBranchingSection,
  normalizeDeploymentsSection,
  normalizeDynamicConfig,
  normalizeApprovalMatrix,
};
