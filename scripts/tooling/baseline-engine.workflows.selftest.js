/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const YAML = require('yaml');
const { defaultConfig } = require('../../tooling/apps/baseline-engine/lib/config');
const { generateDeployWorkflow } = require('../../tooling/apps/baseline-engine/lib/generator/workflows');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function run() {
  const config = defaultConfig({
    maintainersCount: 3,
    components: [{ id: 'application', name: 'application', path: 'apps', enabled: true }],
    profile: 'strict',
  });

  const withoutOidc = YAML.parse(generateDeployWorkflow(config));
  assert.deepStrictEqual(
    withoutOidc.permissions,
    { contents: 'read' },
    'workflow permissions should stay least-privilege when OIDC is disabled'
  );
  assert.deepStrictEqual(
    withoutOidc.jobs.deploy.permissions,
    { contents: 'read' },
    'deploy job permissions should stay least-privilege when OIDC is disabled'
  );
  assert.strictEqual(
    withoutOidc.jobs.deploy.steps.some((step) => step && step.name === 'OIDC token check'),
    false,
    'OIDC verification step should not be emitted when OIDC is disabled'
  );

  const withOidcConfig = clone(config);
  withOidcConfig.deployments.oidc.enabled = true;
  withOidcConfig.deployments.oidc.audience = 'sts://example';
  const withOidc = YAML.parse(generateDeployWorkflow(withOidcConfig));
  assert.deepStrictEqual(
    withOidc.permissions,
    { contents: 'read', 'id-token': 'write' },
    'workflow permissions should include id-token when OIDC is enabled'
  );
  assert.deepStrictEqual(
    withOidc.jobs.deploy.permissions,
    { contents: 'read', 'id-token': 'write' },
    'deploy job permissions should include id-token when OIDC is enabled'
  );
  const oidcCheckStep = withOidc.jobs.deploy.steps.find((step) => step && step.name === 'OIDC token check');
  assert.ok(oidcCheckStep, 'OIDC verification step should be emitted when OIDC is enabled');
  assert.ok(
    String(oidcCheckStep.run || '').includes('audience=sts://example'),
    'OIDC verification step should include the configured audience'
  );

  const malformedOidcConfig = clone(config);
  malformedOidcConfig.deployments.oidc = true;
  const malformedOidc = YAML.parse(generateDeployWorkflow(malformedOidcConfig));
  assert.deepStrictEqual(
    malformedOidc.permissions,
    { contents: 'read' },
    'malformed OIDC config should degrade safely to least-privilege permissions'
  );
  assert.deepStrictEqual(
    malformedOidc.jobs.deploy.permissions,
    { contents: 'read' },
    'malformed OIDC config should not leak id-token permission into deploy job'
  );

  console.log('[baseline-engine:workflows-selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
