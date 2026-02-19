/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');

const { runInit } = require('../../tooling/apps/baseline-engine/lib/commands/init');
const { startUiServer } = require('../../tooling/apps/baseline-engine/lib/commands/ui');

async function requestJson(baseUrl, method, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = {};
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error(`invalid JSON response for ${method} ${pathname}: ${error.message}\n${text}`);
    }
  }
  return {
    status: response.status,
    payload,
  };
}

async function requestRaw(baseUrl, method, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  });
  const text = await response.text();
  let payload = {};
  if (text.trim()) {
    payload = JSON.parse(text);
  }
  return {
    status: response.status,
    payload,
  };
}

function operationIds(list) {
  return (Array.isArray(list) ? list : [])
    .map((entry) => String(entry && entry.id || '').trim())
    .filter(Boolean)
    .sort();
}

async function run() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-engine-ui-api-selftest-'));
  const repoA = path.join(tmpRoot, 'repo-a');
  const repoB = path.join(tmpRoot, 'repo-b');
  fs.mkdirSync(repoA, { recursive: true });
  fs.mkdirSync(repoB, { recursive: true });

  await runInit({
    target: repoA,
    json: '1',
    silent: '1',
  });

  const ui = await startUiServer({
    // objectives:allow LOCALHOST Justification: Hermetic selftest binds loopback interface for local HTTP assertions only.
    host: '127.0.0.1',
    port: 0,
  });

  // objectives:allow LOCALHOST Justification: Hermetic selftest connects to local loopback server only.
  const baseUrl = `http://127.0.0.1:${ui.port}`;

  try {
    const operations = await requestJson(baseUrl, 'GET', '/api/operations');
    assert.strictEqual(operations.status, 200);
    assert.deepStrictEqual(
      operationIds(operations.payload.operations),
      [
        'apply',
        'diff',
        'doctor',
        'init',
        'refresh_capabilities',
        'save_config',
        'session',
        'upgrade',
        'verify',
      ],
      'UI operations catalog should expose full lifecycle API'
    );

    const sessionA = await requestJson(baseUrl, 'GET', '/api/session');
    assert.strictEqual(sessionA.status, 200);
    assert.strictEqual(String(sessionA.payload.session.target || ''), '', 'UI session should allow unbound startup without target');
    assert.strictEqual(String(sessionA.payload.target_status.reason || ''), 'target_not_set');

    const stateA = await requestJson(baseUrl, 'GET', '/api/state');
    assert.strictEqual(stateA.status, 200);
    assert.strictEqual(stateA.payload.target, '');
    assert.strictEqual(stateA.payload.target_required, true, 'state endpoint should mark target as required when not selected');
    assert.strictEqual(typeof stateA.payload.engine_version, 'string');
    assert.strictEqual(typeof stateA.payload.schema, 'object');
    assert.strictEqual(typeof stateA.payload.ui_metadata, 'object');
    assert.deepStrictEqual(stateA.payload.changes, []);

    const doctorWithoutTarget = await requestJson(baseUrl, 'POST', '/api/doctor', {});
    assert.strictEqual(doctorWithoutTarget.status, 400, 'target-bound actions should fail fast when no target is selected');
    assert.strictEqual(doctorWithoutTarget.payload.error, 'target_not_set');

    const sessionB = await requestJson(baseUrl, 'POST', '/api/session', {
      target: repoB,
      profile: 'strict',
    });
    assert.strictEqual(sessionB.status, 200);
    assert.strictEqual(path.resolve(sessionB.payload.session.target), path.resolve(repoB));
    assert.strictEqual(sessionB.payload.session.profile, 'strict');

    const stateBBeforeInit = await requestJson(baseUrl, 'GET', '/api/state');
    assert.strictEqual(stateBBeforeInit.status, 200);
    assert.strictEqual(stateBBeforeInit.payload.target, path.resolve(repoB));

    const init = await requestJson(baseUrl, 'POST', '/api/init', {
      dry_run: false,
    });
    assert.strictEqual(init.status, 200);
    assert.strictEqual(init.payload.command, 'init');
    assert.strictEqual(init.payload.target, path.resolve(repoB));
    assert.strictEqual(fs.existsSync(path.join(repoB, '.baseline', 'config.yaml')), true);

    const diff = await requestJson(baseUrl, 'POST', '/api/diff', {});
    assert.strictEqual(diff.status, 200);
    assert.strictEqual(diff.payload.command, 'diff');
    assert.strictEqual(diff.payload.target, path.resolve(repoB));

    const doctor = await requestJson(baseUrl, 'POST', '/api/doctor', {});
    assert.strictEqual(doctor.status, 200);
    assert.strictEqual(doctor.payload.command, 'doctor');
    assert.strictEqual(doctor.payload.target, path.resolve(repoB));

    const verify = await requestJson(baseUrl, 'POST', '/api/verify', {});
    assert.strictEqual(verify.status, 200);
    assert.strictEqual(verify.payload.command, 'verify');
    assert.strictEqual(verify.payload.target, path.resolve(repoB));

    const apply = await requestJson(baseUrl, 'POST', '/api/apply', {
      dry_run: true,
      direct: true,
    });
    assert.strictEqual(apply.status, 200);
    assert.strictEqual(apply.payload.command, 'apply');
    assert.strictEqual(apply.payload.dry_run, true);
    assert.strictEqual(apply.payload.apply_mode, 'direct');
    assert.strictEqual(apply.payload.target, path.resolve(repoB));

    const upgrade = await requestJson(baseUrl, 'POST', '/api/upgrade', {
      dry_run: true,
      target_version: '2.2.0',
    });
    assert.strictEqual(upgrade.status, 200);
    assert.strictEqual(upgrade.payload.command, 'upgrade');
    assert.strictEqual(upgrade.payload.target, path.resolve(repoB));
    assert.strictEqual(upgrade.payload.dry_run, true);
    assert.strictEqual(upgrade.payload.target_version, '2.2.0');

    const refreshed = await requestJson(baseUrl, 'POST', '/api/refresh-capabilities', {});
    assert.strictEqual(refreshed.status, 200);
    assert.strictEqual(refreshed.payload.target, path.resolve(repoB));

    const stateBeforeConfigSave = await requestJson(baseUrl, 'GET', '/api/state');
    assert.strictEqual(stateBeforeConfigSave.status, 200);
    const nextConfig = JSON.parse(JSON.stringify(stateBeforeConfigSave.payload.config));
    nextConfig.updates = nextConfig.updates && typeof nextConfig.updates === 'object' ? nextConfig.updates : {};
    nextConfig.updates.auto_pr = false;

    const saveConfig = await requestJson(baseUrl, 'POST', '/api/config', {
      config: nextConfig,
    });
    assert.strictEqual(saveConfig.status, 200);
    assert.strictEqual(saveConfig.payload.ok, true);
    const savedConfig = yaml.parse(fs.readFileSync(path.join(repoB, '.baseline', 'config.yaml'), 'utf8'));
    assert.strictEqual(savedConfig.updates.auto_pr, false, 'config write should persist UI edits');

    const clearTarget = await requestJson(baseUrl, 'POST', '/api/session', {
      target: '',
    });
    assert.strictEqual(clearTarget.status, 200);
    assert.strictEqual(String(clearTarget.payload.session.target || ''), '');
    assert.strictEqual(String(clearTarget.payload.target_status.reason || ''), 'target_not_set');

    const stateAfterClear = await requestJson(baseUrl, 'GET', '/api/state');
    assert.strictEqual(stateAfterClear.status, 200);
    assert.strictEqual(stateAfterClear.payload.target_required, true);
    assert.strictEqual(String(stateAfterClear.payload.target || ''), '');

    const nonDirectoryTarget = path.join(tmpRoot, 'not-a-directory.txt');
    fs.writeFileSync(nonDirectoryTarget, 'not-a-directory');
    const invalidTargetSession = await requestJson(baseUrl, 'POST', '/api/session', {
      target: nonDirectoryTarget,
    });
    assert.strictEqual(invalidTargetSession.status, 200);
    assert.strictEqual(
      String(invalidTargetSession.payload.target_status.reason || ''),
      'target_exists_but_not_directory',
      'session target status should detect non-directory path'
    );

    const stateInvalidTarget = await requestJson(baseUrl, 'GET', '/api/state');
    assert.strictEqual(stateInvalidTarget.status, 200);
    assert.strictEqual(stateInvalidTarget.payload.target_invalid, true);
    assert.strictEqual(String(stateInvalidTarget.payload.status || ''), 'target_exists_but_not_directory');

    const doctorInvalidTarget = await requestJson(baseUrl, 'POST', '/api/doctor', {});
    assert.strictEqual(doctorInvalidTarget.status, 400, 'target-bound actions should fail fast for invalid target path');
    assert.strictEqual(doctorInvalidTarget.payload.error, 'target_exists_but_not_directory');

    const restoreTarget = await requestJson(baseUrl, 'POST', '/api/session', {
      target: repoB,
    });
    assert.strictEqual(restoreTarget.status, 200);
    assert.strictEqual(String(restoreTarget.payload.target_status.reason || ''), 'ok');

    const badJson = await requestRaw(baseUrl, 'POST', '/api/session', '{');
    assert.strictEqual(badJson.status, 400, 'invalid JSON body should return HTTP 400');
    assert.strictEqual(badJson.payload.error, 'invalid_json_body');

    const oversized = await requestJson(baseUrl, 'POST', '/api/session', {
      target: 'x'.repeat((1024 * 1024) + 64),
    });
    assert.strictEqual(oversized.status, 413, 'oversized request body should return HTTP 413');
    assert.strictEqual(oversized.payload.error, 'request_body_too_large');

    const unknown = await requestJson(baseUrl, 'GET', '/api/not-a-real-endpoint');
    assert.strictEqual(unknown.status, 404, 'unknown API endpoint should return 404');
    assert.strictEqual(unknown.payload.error, 'unknown_endpoint');
  } finally {
    await ui.close();
  }

  console.log('[baseline-engine:ui-api-selftest] OK');
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  run,
};
