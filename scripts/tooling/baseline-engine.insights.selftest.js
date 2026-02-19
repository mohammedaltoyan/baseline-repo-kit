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
      private: true,
      permissions: { admin: true },
    },
    auth: {
      token_present: true,
      token_source: 'env',
      viewer_login: 'automation-bot',
      token_scopes: ['repo', 'workflow'],
    },
    collaborators: {
      maintainer_count: 6,
      maintainers: ['alice', 'bob', 'carol', 'dora', 'erin', 'frank'],
      role_counts: { admin: 2, maintain: 2, write: 2 },
    },
    capabilities: {
      environments: { supported: true, state: 'supported', reason: 'api_success' },
      rulesets: { supported: true, state: 'supported', reason: 'api_success' },
      merge_queue: { supported: true, state: 'supported', reason: 'api_success' },
    },
  };
  const moduleEvaluation = {
    modules: [
      {
        id: 'core-governance',
        enabled: true,
        degraded: true,
        missing: [
          {
            capability: 'rulesets',
            remediation: 'Enable rulesets in repo settings.',
          },
        ],
      },
    ],
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
  assert.strictEqual(Array.isArray(healthy.reviewer.threshold_rows), true);
  assert.strictEqual(healthy.reviewer.threshold_rows.length, 3);
  assert.strictEqual(healthy.reviewer.threshold_rows.some((row) => row.applies), true);
  assert.strictEqual(healthy.capability.owner_type, 'Organization');
  assert.strictEqual(healthy.capability.repository_visibility, 'private');
  assert.strictEqual(healthy.capability.maintainer_count, 6);
  assert.strictEqual(healthy.capability.role_counts.admin, 2);
  assert.strictEqual(Array.isArray(healthy.capability_matrix), true);
  assert.strictEqual(
    healthy.capability_matrix.some((row) => row.capability === 'rulesets' && row.remediation.includes('Enable rulesets')),
    true
  );
  assert.strictEqual(healthy.entitlements.owner_type, 'Organization');
  assert.strictEqual(healthy.entitlements.repository_visibility, 'private');
  assert.strictEqual(
    healthy.entitlements.by_feature.custom_deployment_protection_rules.state,
    'plan_dependent'
  );
  assert.strictEqual(
    healthy.capability_matrix.some((row) => row.capability === 'custom_deployment_protection_rules'),
    true
  );
  assert.strictEqual(healthy.branching.source, 'topology_preset');
  assert.strictEqual(healthy.branching.protected_count > 0, true);
  assert.strictEqual(Array.isArray(healthy.branching.branch_role_policies), true);
  assert.strictEqual(healthy.deployments.matrix.healthy, true);
  assert.strictEqual(healthy.deployments.enforcement.mode, 'enforced');
  assert.strictEqual(healthy.deployments.approval_required_rows > 0, true);
  assert.strictEqual(Array.isArray(healthy.deployments.rows_by_environment), true);
  assert.strictEqual(healthy.github_app.effective_required, true);
  assert.strictEqual(healthy.github_app.status, 'required');

  const drifted = JSON.parse(JSON.stringify(config));
  drifted.deployments.approval_matrix = drifted.deployments.approval_matrix.slice(0, 1);
  const limitedCapabilities = JSON.parse(JSON.stringify(capabilities));
  limitedCapabilities.capabilities.environments = { supported: false, state: 'unsupported', reason: 'not_available' };
  const unhealthy = buildInsights({
    config: drifted,
    capabilities: limitedCapabilities,
    moduleEvaluation,
  });
  assert.strictEqual(unhealthy.deployments.matrix.healthy, false);
  assert.strictEqual(unhealthy.deployments.matrix.missing_rows.length > 0, true);
  assert.strictEqual(unhealthy.deployments.enforcement.mode, 'advisory');
  assert.strictEqual(
    unhealthy.deployments.advisory_rows,
    unhealthy.deployments.approval_required_rows
  );
  assert.strictEqual(unhealthy.deployments.enforcement.entitlement_state, 'plan_dependent');

  console.log('[baseline-engine:insights-selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
