'use strict';

const { resolveActiveReviewPolicy } = require('./policy/reviewers');

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

function branchInsights(config) {
  const branching = config && config.branching && typeof config.branching === 'object'
    ? config.branching
    : {};
  const branches = Array.isArray(branching.branches) ? branching.branches : [];
  const roles = uniqueStrings(branches.map((entry) => String(entry && entry.role || '').trim()).filter(Boolean));
  const topology = String(branching.topology || 'two_branch').trim();
  const source = topology === 'custom' ? 'custom' : 'topology_preset';
  return {
    topology,
    source,
    branch_count: branches.length,
    roles,
  };
}

function reviewerInsights(config, capabilities) {
  const maintainerCount = Number(capabilities
    && capabilities.collaborators
    && capabilities.collaborators.maintainer_count || 0);
  const thresholds = config
    && config.branching
    && config.branching.review_thresholds
    && typeof config.branching.review_thresholds === 'object'
    ? config.branching.review_thresholds
    : {};

  return resolveActiveReviewPolicy({
    maintainerCount,
    thresholds,
  });
}

function capabilitySummary(capabilities) {
  const repo = capabilities && capabilities.repository && typeof capabilities.repository === 'object'
    ? capabilities.repository
    : {};
  const auth = capabilities && capabilities.auth && typeof capabilities.auth === 'object'
    ? capabilities.auth
    : {};
  return {
    owner_type: String(repo.owner_type || 'unknown'),
    repo_admin: !!(repo.permissions && repo.permissions.admin),
    token_scope_count: Array.isArray(auth.token_scopes) ? auth.token_scopes.length : 0,
    viewer_login: String(auth.viewer_login || ''),
  };
}

function buildInsights({ config, capabilities, moduleEvaluation }) {
  const matrix = matrixCoverage(config);
  const reviewer = reviewerInsights(config, capabilities);
  const branch = branchInsights(config);
  const capability = capabilitySummary(capabilities);
  const githubApp = moduleEvaluation && moduleEvaluation.github_app && typeof moduleEvaluation.github_app === 'object'
    ? moduleEvaluation.github_app
    : {
      required_for_full_feature_set: false,
      policy_requires_app: false,
      effective_required: false,
      reason: 'unknown',
    };

  return {
    capability,
    reviewer,
    branching: branch,
    deployments: {
      matrix,
      environment_count: Number(config && config.deployments && Array.isArray(config.deployments.environments)
        ? config.deployments.environments.length
        : 0),
      component_count: Number(config && config.deployments && Array.isArray(config.deployments.components)
        ? config.deployments.components.length
        : 0),
    },
    github_app: githubApp,
  };
}

module.exports = {
  buildInsights,
};
