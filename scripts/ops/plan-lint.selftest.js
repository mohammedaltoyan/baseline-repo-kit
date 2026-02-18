/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const scriptPath = path.join(__dirname, 'plan-lint.js');

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function runPlanLint({ eventName = '', eventPayload = null, extraEnv = {}, withBranchPolicy = false }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-plan-lint-'));
  fs.mkdirSync(path.join(tmpDir, 'docs', 'ops', 'plans'), { recursive: true });

  let evtPath = '';
  if (eventPayload) {
    evtPath = path.join(tmpDir, 'event.json');
    writeJson(evtPath, eventPayload);
  }

  if (withBranchPolicy) {
    writeJson(path.join(tmpDir, 'config', 'policy', 'branch-policy.json'), {
      integration_branch: 'dev',
      production_branch: 'main',
    });
  }

  const res = spawnSync(process.execPath, [scriptPath], {
    cwd: tmpDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: eventName,
      GITHUB_EVENT_PATH: evtPath,
      ...extraEnv,
    },
  });

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  return res;
}

function run() {
  const localRes = runPlanLint({});
  assert.strictEqual(localRes.status, 0, `expected non-PR zero-plan context to pass (got ${localRes.status})`);
  assert.match(`${localRes.stdout || ''}${localRes.stderr || ''}`, /No canonical plans detected/i);

  const humanPrRes = runPlanLint({
    eventName: 'pull_request',
    eventPayload: {
      pull_request: {
        base: { ref: 'dev' },
        head: { ref: 'feat/x' },
        user: { login: 'alice', type: 'User' },
      },
    },
  });
  assert.notStrictEqual(humanPrRes.status, 0, 'expected human pull_request zero-plan context to fail');
  assert.match(`${humanPrRes.stdout || ''}${humanPrRes.stderr || ''}`, /No canonical plans found for PR context/i);

  const dependabotRes = runPlanLint({
    eventName: 'pull_request',
    eventPayload: {
      pull_request: {
        base: { ref: 'dev' },
        head: { ref: 'dependabot/npm_and_yarn/dotenv-17.2.4' },
        user: { login: 'dependabot[bot]', type: 'Bot' },
      },
    },
  });
  assert.strictEqual(dependabotRes.status, 0, `expected dependency automation PR to pass (got ${dependabotRes.status})`);
  assert.match(`${dependabotRes.stdout || ''}${dependabotRes.stderr || ''}`, /dependency automation/i);

  const releaseStrictRes = runPlanLint({
    eventName: 'pull_request',
    eventPayload: {
      pull_request: {
        base: { ref: 'main' },
        head: { ref: 'dev' },
        user: { login: 'github-actions[bot]', type: 'Bot' },
      },
    },
    withBranchPolicy: true,
    extraEnv: { RELEASE_PR_BYPASS_PLAN_STEP: '0' },
  });
  assert.notStrictEqual(releaseStrictRes.status, 0, 'expected release promotion PR to fail when bypass is disabled');

  const releaseBypassRes = runPlanLint({
    eventName: 'pull_request',
    eventPayload: {
      pull_request: {
        base: { ref: 'main' },
        head: { ref: 'dev' },
        user: { login: 'github-actions[bot]', type: 'Bot' },
      },
    },
    withBranchPolicy: true,
    extraEnv: { RELEASE_PR_BYPASS_PLAN_STEP: '1' },
  });
  assert.strictEqual(releaseBypassRes.status, 0, `expected release promotion bypass to pass (got ${releaseBypassRes.status})`);
  assert.match(`${releaseBypassRes.stdout || ''}${releaseBypassRes.stderr || ''}`, /release promotion/i);

  console.log('[plan-lint:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
