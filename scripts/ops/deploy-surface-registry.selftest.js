/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const {
  validateAndNormalizeRegistry,
  resolveDeployEnvName,
  resolveApprovalEnvName,
  resolveApprovalMode,
  matchSurfacesForPaths,
} = require('./deploy-surface-registry');

function run() {
  const raw = {
    version: 1,
    defaults: {
      approval_mode_by_tier: { staging: 'commit', production: 'surface' },
      approval_env_commit_by_tier: { staging: 'staging-approval', production: 'production-approval' },
      approval_env_surface_prefix_by_tier: { staging: 'staging-approval-', production: 'production-approval-' },
      deploy_env_suffix_by_tier: { staging: 'staging', production: 'production' },
      deploy_env_template: '{surface}-{suffix}',
    },
    surfaces: [
      {
        surface_id: 'application',
        description: 'app',
        paths_include_re: ['^apps/', '^packages/'],
        paths_exclude_re: ['^apps/api-ingress/'],
      },
      {
        surface_id: 'api-ingress',
        description: 'ingress',
        paths_include_re: ['^apps/api-ingress/'],
        deploy_env_by_tier: { staging: 'edge-staging', production: 'edge-prod' },
      },
      {
        surface_id: 'docs',
        description: 'docs',
        paths_include_re: ['^docs/'],
      },
    ],
  };

  const reg = validateAndNormalizeRegistry(raw);
  assert.strictEqual(resolveDeployEnvName({ registry: reg, surfaceId: 'application', tier: 'staging' }), 'application-staging');
  assert.strictEqual(resolveDeployEnvName({ registry: reg, surfaceId: 'application', tier: 'production' }), 'application-production');
  assert.strictEqual(resolveDeployEnvName({ registry: reg, surfaceId: 'api-ingress', tier: 'staging' }), 'edge-staging');
  assert.strictEqual(resolveDeployEnvName({ registry: reg, surfaceId: 'api_ingress', tier: 'production' }), 'edge-prod');

  assert.strictEqual(resolveApprovalEnvName({ registry: reg, tier: 'staging', approvalMode: 'commit' }), 'staging-approval');
  assert.strictEqual(
    resolveApprovalEnvName({ registry: reg, tier: 'production', approvalMode: 'surface', surfaceId: 'docs' }),
    'production-approval-docs'
  );

  assert.strictEqual(resolveApprovalMode({ tier: 'staging', inputApprovalMode: '', repoVarApprovalMode: '', registry: reg }), 'commit');
  assert.strictEqual(resolveApprovalMode({ tier: 'production', inputApprovalMode: '', repoVarApprovalMode: '', registry: reg }), 'surface');
  assert.strictEqual(resolveApprovalMode({ tier: 'production', inputApprovalMode: 'commit', repoVarApprovalMode: 'surface', registry: reg }), 'commit');
  assert.strictEqual(resolveApprovalMode({ tier: 'production', inputApprovalMode: '', repoVarApprovalMode: 'commit', registry: reg }), 'commit');

  assert.deepStrictEqual(
    matchSurfacesForPaths({ registry: reg, paths: ['apps/web/a.ts', 'packages/x/index.ts'] }),
    ['application']
  );
  assert.deepStrictEqual(
    matchSurfacesForPaths({ registry: reg, paths: ['docs/ops/runbooks/DEPLOYMENT.md'] }),
    ['docs']
  );
  assert.deepStrictEqual(
    matchSurfacesForPaths({ registry: reg, paths: ['apps/api-ingress/src/index.ts'] }),
    ['api-ingress']
  );
  assert.deepStrictEqual(
    matchSurfacesForPaths({ registry: reg, paths: ['apps/api-ingress/src/index.ts', 'apps/web/a.ts'] }),
    ['application', 'api-ingress']
  );

  assert.throws(
    () => validateAndNormalizeRegistry({ version: 1, defaults: {}, surfaces: [{ surface_id: 'bad_id!', paths_include_re: ['^apps/'] }] }),
    /Invalid surface_id/i
  );
  assert.throws(
    () => validateAndNormalizeRegistry({ version: 1, defaults: {}, surfaces: [{ surface_id: 'application', paths_include_re: [] }] }),
    /paths_include_re/i
  );
  assert.throws(
    () =>
      validateAndNormalizeRegistry({
        version: 1,
        defaults: {},
        surfaces: [{ surface_id: 'application', paths_include_re: ['[invalid'] }],
      }),
    /invalid paths_include_re/i
  );
  assert.throws(
    () =>
      validateAndNormalizeRegistry({
        version: 1,
        defaults: {},
        surfaces: [
          { surface_id: 'application', paths_include_re: ['^apps/'] },
          { surface_id: 'application', paths_include_re: ['^docs/'] },
        ],
      }),
    /Duplicate surface_id/i
  );

  console.log('[deploy-surface-registry:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };

