/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const { validateAndNormalizeRegistry } = require('./deploy-surface-registry');
const { buildApprovalMatrix } = require('./approval-matrix');

function run() {
  const reg = validateAndNormalizeRegistry({
    version: 1,
    defaults: {
      approval_mode_by_tier: { staging: 'commit', production: 'surface' },
      approval_env_commit_by_tier: { staging: 'staging-approval', production: 'prod-approval' },
      approval_env_surface_prefix_by_tier: { staging: 'staging-approval-', production: 'prod-approval-' },
      deploy_env_suffix_by_tier: { staging: 'staging', production: 'production' },
      deploy_env_template: '{surface}-{suffix}',
    },
    surfaces: [{ surface_id: 'application', description: 'app', paths_include_re: ['^apps/'] }],
  });

  const surfaces = ['application', 'docs'];

  let m = buildApprovalMatrix({ tier: 'staging', surfaces, inputApprovalMode: '', repoVarApprovalMode: '', registry: reg });
  assert.strictEqual(m.approvalMode, 'commit');
  assert.strictEqual(m.approvalEnvCommit, 'staging-approval');
  assert.deepStrictEqual(m.surfaceApprovalMatrix[0], { surface: 'application', approval_env: 'staging-approval-application' });

  m = buildApprovalMatrix({ tier: 'production', surfaces, inputApprovalMode: '', repoVarApprovalMode: '', registry: reg });
  assert.strictEqual(m.approvalMode, 'surface');
  assert.strictEqual(m.approvalEnvCommit, 'prod-approval');
  assert.deepStrictEqual(m.surfaceApprovalMatrix[1], { surface: 'docs', approval_env: 'prod-approval-docs' });

  m = buildApprovalMatrix({ tier: 'production', surfaces, inputApprovalMode: 'commit', repoVarApprovalMode: 'surface', registry: reg });
  assert.strictEqual(m.approvalMode, 'commit');

  console.log('[approval-matrix:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };

