/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const { defaultConfig, defaultState } = require('../../tooling/apps/baseline-engine/lib/config');
const { defaultEnvironments, buildApprovalMatrix } = require('../../tooling/apps/baseline-engine/lib/policy/deployments');
const { computeAdaptiveReviewThresholds, resolveActiveReviewPolicy } = require('../../tooling/apps/baseline-engine/lib/policy/reviewers');
const governanceGenerator = require('../../tooling/apps/baseline-engine/modules/core-governance/generators');

function findRow(rows, environment, component) {
  return (Array.isArray(rows) ? rows : []).find((entry) => (
    String(entry && entry.environment) === String(environment)
    && String(entry && entry.component) === String(component)
  ));
}

function findArtifact(artifacts, relPath) {
  return (Array.isArray(artifacts) ? artifacts : []).find((artifact) => String(artifact && artifact.path) === relPath);
}

function run() {
  const adaptive = computeAdaptiveReviewThresholds(7);
  assert.strictEqual(adaptive.defaults.maintainers_le_1.required_non_author_approvals, 0);
  assert.strictEqual(adaptive.defaults.maintainers_2_to_5.required_non_author_approvals, 1);
  assert.strictEqual(adaptive.defaults.maintainers_ge_6.required_non_author_approvals, 2);
  assert.strictEqual(adaptive.defaults.maintainers_ge_6.require_codeowners, true);

  const selectedSolo = resolveActiveReviewPolicy({
    maintainerCount: 1,
    thresholds: adaptive.defaults,
  });
  assert.strictEqual(selectedSolo.active_bucket, 'maintainers_le_1');
  assert.strictEqual(selectedSolo.policy.required_non_author_approvals, 0);
  assert.strictEqual(selectedSolo.policy.require_strict_ci, true);

  const selectedSmall = resolveActiveReviewPolicy({
    maintainerCount: 4,
    thresholds: adaptive.defaults,
  });
  assert.strictEqual(selectedSmall.active_bucket, 'maintainers_2_to_5');
  assert.strictEqual(selectedSmall.policy.required_non_author_approvals, 1);

  const environments = defaultEnvironments();
  const components = [{ id: 'api', name: 'api', path: 'apps/api', enabled: true }];

  const strictMatrix = buildApprovalMatrix({
    environments,
    components,
    policyProfile: 'strict',
  });
  assert.strictEqual(findRow(strictMatrix, 'production', 'api').min_approvers, 2);
  assert.strictEqual(findRow(strictMatrix, 'staging', 'api').min_approvers, 1);
  assert.strictEqual(findRow(strictMatrix, 'dev', 'api').min_approvers, 0);

  const advisoryMatrix = buildApprovalMatrix({
    environments,
    components,
    policyProfile: 'advisory',
  });
  assert.strictEqual(findRow(advisoryMatrix, 'production', 'api').min_approvers, 0);
  assert.strictEqual(findRow(advisoryMatrix, 'production', 'api').approval_required, false);

  const config = defaultConfig({
    maintainersCount: 7,
    components,
    profile: 'strict',
  });
  config.modules.enabled = ['core-ci', 'core-deployments', 'core-governance', 'core-planning'];
  const state = defaultState({
    capabilities: {
      collaborators: {
        maintainer_count: 7,
      },
    },
  });
  const artifacts = governanceGenerator.generate({
    config,
    state,
    capabilities: { collaborators: { maintainer_count: 7 } },
    evaluation: { degraded: false, missing: [] },
  });
  const checksArtifact = findArtifact(artifacts, 'config/policy/baseline-required-checks.json');
  assert.ok(checksArtifact, 'governance generator must emit required checks artifact');
  const checks = JSON.parse(String(checksArtifact.content || '{}'));
  const productionChecks = checks.required_checks_by_role && checks.required_checks_by_role.production || [];
  assert.strictEqual(
    productionChecks.includes('Baseline PR Gate / baseline-fast-lane'),
    true,
    'production role must require fast lane'
  );
  assert.strictEqual(
    productionChecks.includes('Baseline PR Gate / baseline-full-lane'),
    true,
    'production role must require full lane when strict CI is enabled'
  );
  assert.strictEqual(
    productionChecks.includes('Baseline Deploy / baseline-deploy'),
    true,
    'production role must require deploy gate when deployment module is enabled'
  );

  console.log('[baseline-engine:governance-selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
