/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseDeployEnvMap, buildLegacyKey, resolveDeployEnvironment } = require('./deploy-env-resolve');

function writeJson(root, rel, obj) {
  const p = path.join(root, ...String(rel).split('/').filter(Boolean));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

async function run() {
  assert.strictEqual(parseDeployEnvMap(''), null);
  assert.strictEqual(parseDeployEnvMap('not-json'), null);
  assert.deepStrictEqual(parseDeployEnvMap('{"application":{"staging":"a-staging"}}').application.staging, 'a-staging');

  assert.strictEqual(buildLegacyKey({ component: 'api-ingress', tier: 'staging' }), 'DEPLOY_ENV_API_INGRESS_STAGING');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-kit-deploy-env-resolve-'));
  writeJson(tmp, 'config/deploy/deploy-surfaces.json', {
    version: 1,
    defaults: {
      approval_mode_by_tier: { staging: 'commit', production: 'commit' },
      approval_env_commit_by_tier: { staging: 'staging-approval', production: 'production-approval' },
      approval_env_surface_prefix_by_tier: { staging: 'staging-approval-', production: 'production-approval-' },
      deploy_env_suffix_by_tier: { staging: 'staging', production: 'production' },
      deploy_env_template: '{surface}-{suffix}',
    },
    surfaces: [{ surface_id: 'application', description: 'app', paths_include_re: ['^apps/'] }],
  });

  const fromRegistry = await resolveDeployEnvironment({
    cwd: tmp,
    tier: 'staging',
    component: 'app',
    registryPath: 'config/deploy/deploy-surfaces.json',
    deployEnvMapJson: '{"application":{"staging":"should-not-win"}}',
    token: '',
    owner: '',
    repo: '',
    apiUrl: '',
  });
  assert.deepStrictEqual(fromRegistry, {
    envName: 'application-staging',
    tier: 'staging',
    component: 'application',
    source: 'registry',
    registryPath: 'config/deploy/deploy-surfaces.json',
  });

  const fromMap = await resolveDeployEnvironment({
    cwd: tmp,
    tier: 'production',
    component: 'docs',
    registryPath: 'config/deploy/missing.json',
    deployEnvMapJson: '{"docs":{"production":"docs-production"}}',
    token: '',
    owner: '',
    repo: '',
    apiUrl: '',
  });
  assert.strictEqual(fromMap.envName, 'docs-production');
  assert.strictEqual(fromMap.source, 'map_json');

  await assert.rejects(
    () =>
      resolveDeployEnvironment({
        cwd: tmp,
        tier: 'staging',
        component: 'application',
        registryPath: 'config/deploy/missing.json',
        deployEnvMapJson: '',
        token: '',
        owner: '',
        repo: '',
        apiUrl: '',
      }),
    /Unable to resolve GitHub environment/i
  );

  console.log('[deploy-env-resolve:selftest] OK');
}

run().catch((err) => {
  console.error('[deploy-env-resolve:selftest] failed:', err && err.message ? err.message : err);
  process.exit(1);
});

