/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const { defaultConfig } = require('../../tooling/apps/baseline-engine/lib/config');
const { buildInsights } = require('../../tooling/apps/baseline-engine/lib/insights');

function run() {
  const config = defaultConfig({
    maintainersCount: 6,
    components: [{ id: 'application', name: 'application', path: 'apps', enabled: true }],
    profile: 'strict',
  });
  const capabilities = {
    repository: {
      owner_type: 'Organization',
      permissions: { admin: true },
    },
    auth: {
      viewer_login: 'automation-bot',
      token_scopes: ['repo', 'workflow'],
    },
    collaborators: {
      maintainer_count: 6,
    },
  };
  const moduleEvaluation = {
    github_app: {
      required_for_full_feature_set: true,
      policy_requires_app: true,
      effective_required: true,
      reason: 'missing_capabilities_for_enabled_modules',
    },
  };

  const healthy = buildInsights({
    config,
    capabilities,
    moduleEvaluation,
  });
  assert.strictEqual(healthy.reviewer.active_bucket, 'maintainers_ge_6');
  assert.strictEqual(healthy.reviewer.policy.required_non_author_approvals, 2);
  assert.strictEqual(healthy.branching.source, 'topology_preset');
  assert.strictEqual(healthy.deployments.matrix.healthy, true);
  assert.strictEqual(healthy.github_app.effective_required, true);

  const drifted = JSON.parse(JSON.stringify(config));
  drifted.deployments.approval_matrix = drifted.deployments.approval_matrix.slice(0, 1);
  const unhealthy = buildInsights({
    config: drifted,
    capabilities,
    moduleEvaluation,
  });
  assert.strictEqual(unhealthy.deployments.matrix.healthy, false);
  assert.strictEqual(unhealthy.deployments.matrix.missing_rows.length > 0, true);

  console.log('[baseline-engine:insights-selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
