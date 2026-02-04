#!/usr/bin/env node
/**
 * plan-verify.js
 * Baseline verification runner for this kit.
 *
 * Goal: provide a single, repo-local entrypoint that can be used by CI and
 * plan gates without assuming any specific product, schema, or cloud provider.
 *
 * Default behavior:
 * - Runs `npm test` (baseline lint gates).
 * - Optionally runs the change guard when `VERIFY_CHANGE_GUARD=1`.
 * - Optionally runs deep verification when `VERIFY_DEEP=1`.
 */
/* eslint-disable no-console */
const path = require('path');
const { spawnSync } = require('child_process');

function die(msg) {
  console.error(`[plan-verify] ${msg}`);
  process.exit(1);
}

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function run(cmd, args, label) {
  console.log(`[plan-verify] ${label}`);
  const needsShell = process.platform === 'win32' && (cmd === 'npm' || /\.cmd$/i.test(cmd));
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: needsShell });
  if (res.error) die(`${label} error: ${res.error.message}`);
  if (res.status !== 0) die(`${label} failed (exit ${res.status})`);
}

function isTruthy(value) {
  return /^(1|true|yes)$/i.test(String(value || '').trim());
}

function isGitWorkTree() {
  const res = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  return res.status === 0 && String(res.stdout || '').trim() === 'true';
}

function main() {
  run(npmCmd(), ['test'], 'baseline gates (npm test)');

  if (isTruthy(process.env.VERIFY_CHANGE_GUARD)) {
    if (!isGitWorkTree()) {
      console.warn('[plan-verify] Skipping change guard (not a git worktree).');
    } else {
      run(process.execPath, [path.join('scripts', 'ops', 'change-requires-docs-tests.js')], 'change guard');
    }
  }

  if (isTruthy(process.env.VERIFY_DEEP)) {
    run(npmCmd(), ['run', 'test:deep'], 'deep verification (npm run test:deep)');
  }

  console.log('[plan-verify] OK');
}

if (require.main === module) {
  main();
}
