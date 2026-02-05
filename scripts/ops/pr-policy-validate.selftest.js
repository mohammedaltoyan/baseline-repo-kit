/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function runValidateWithEvent(eventJson) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-pr-policy-'));
  const evtPath = path.join(tmpDir, 'event.json');
  fs.writeFileSync(evtPath, JSON.stringify(eventJson), 'utf8');

  const repoRoot = path.resolve(__dirname, '..', '..');
  const scriptPath = path.join(__dirname, 'pr-policy-validate.js');
  const res = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      GITHUB_EVENT_PATH: evtPath,
      GITHUB_REPOSITORY: 'acme/example',
    },
    encoding: 'utf8',
  });

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  return res;
}

function run() {
  // Human PR requires Plan/Step.
  const humanEvent = {
    pull_request: {
      number: 1,
      body: '',
      base: { ref: 'dev' },
      head: { ref: 'feat/test' },
      user: { login: 'alice', type: 'User' },
    },
  };
  const humanRes = runValidateWithEvent(humanEvent);
  assert.notStrictEqual(humanRes.status, 0, 'expected human PR without Plan/Step to fail');
  assert.match(`${humanRes.stderr || ''}${humanRes.stdout || ''}`, /Missing `Plan:/i);

  // Dependabot PR into integration branch bypasses Plan/Step requirement.
  const botEvent = {
    pull_request: {
      number: 2,
      body: '',
      base: { ref: 'dev' },
      head: { ref: 'dependabot/npm_and_yarn/dotenv-1.2.3' },
      user: { login: 'dependabot[bot]', type: 'Bot' },
    },
  };
  const botRes = runValidateWithEvent(botEvent);
  assert.strictEqual(botRes.status, 0, `expected dependency bot PR to pass (got ${botRes.status})`);
  assert.match(`${botRes.stdout || ''}`, /Plan\/Step not required/i);

  console.log('[pr-policy-validate:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };

