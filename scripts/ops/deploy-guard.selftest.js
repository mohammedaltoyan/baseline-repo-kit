/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const script = path.join(__dirname, 'deploy-guard.js');

function runCase({ args, env }) {
  const res = spawnSync(process.execPath, [script, ...(args || [])], {
    env: { ...process.env, ...(env || {}) },
    encoding: 'utf8',
  });
  return {
    status: typeof res.status === 'number' ? res.status : 1,
    stdout: String(res.stdout || ''),
    stderr: String(res.stderr || ''),
  };
}

function run() {
  let result = runCase({
    args: ['--environment', 'staging'],
    env: {
      STAGING_DEPLOY_GUARD: 'enabled',
    },
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  result = runCase({
    args: ['--environment', 'staging'],
    env: {
      STAGING_DEPLOY_GUARD: 'disabled',
    },
  });
  assert.notStrictEqual(result.status, 0, 'expected staging guard failure');

  result = runCase({
    args: ['--environment', 'production'],
    env: {
      PRODUCTION_DEPLOY_GUARD: 'disabled',
      PRODUCTION_PROMOTION_REQUIRED: 'enabled',
    },
  });
  assert.notStrictEqual(result.status, 0, 'expected production deploy guard failure');

  result = runCase({
    args: ['--environment', 'production', '--promotion-source', 'direct'],
    env: {
      PRODUCTION_DEPLOY_GUARD: 'enabled',
      PRODUCTION_PROMOTION_REQUIRED: 'enabled',
    },
  });
  assert.notStrictEqual(result.status, 0, 'expected production promotion gate failure');

  result = runCase({
    args: ['--environment', 'production', '--promotion-source', 'approved-flow'],
    env: {
      PRODUCTION_DEPLOY_GUARD: 'enabled',
      PRODUCTION_PROMOTION_REQUIRED: 'enabled',
    },
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  result = runCase({
    args: ['--environment', 'staging', '--component', 'docs'],
    env: {
      STAGING_DEPLOY_GUARD: 'enabled',
      DOCS_PUBLISH_GUARD: 'disabled',
    },
  });
  assert.notStrictEqual(result.status, 0, 'expected docs guard failure');

  result = runCase({
    args: ['--environment', 'staging', '--component', 'docs'],
    env: {
      STAGING_DEPLOY_GUARD: 'enabled',
      DOCS_PUBLISH_GUARD: 'enabled',
    },
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  // Component normalization: underscores are accepted and normalized (api_ingress -> api-ingress).
  result = runCase({
    args: ['--environment', 'staging', '--component', 'api_ingress'],
    env: {
      STAGING_DEPLOY_GUARD: 'enabled',
      API_INGRESS_DEPLOY_GUARD: 'enabled',
    },
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  result = runCase({
    args: ['--environment', 'staging', '--component', 'admin_ui'],
    env: {
      STAGING_DEPLOY_GUARD: 'enabled',
    },
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  console.log('[deploy-guard:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
