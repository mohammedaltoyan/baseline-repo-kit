/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const engineCli = path.resolve(__dirname, '..', '..', 'tooling', 'apps', 'baseline-engine', 'cli.js');

function runEngine(args, cwd) {
  const res = spawnSync(process.execPath, [engineCli, ...args, '--json'], {
    cwd,
    encoding: 'utf8',
  });

  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`engine command failed (${args.join(' ')}): ${res.stderr || res.stdout}`);
  }

  const out = String(res.stdout || '').trim();
  try {
    return JSON.parse(out);
  } catch (error) {
    throw new Error(`invalid JSON output for command ${args.join(' ')}: ${error.message}\n${out}`);
  }
}

function run() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-engine-selftest-'));
  const repo = path.join(tmpRoot, 'repo');
  fs.mkdirSync(repo, { recursive: true });

  const init = runEngine(['init', '--target', repo], process.cwd());
  assert.strictEqual(init.command, 'init');

  const expectedFiles = [
    '.baseline/config.yaml',
    '.baseline/state.json',
    '.baseline/managed-files.json',
    '.baseline/capabilities/github.json',
    '.github/workflows/baseline-pr-gate.yml',
    '.github/workflows/baseline-node-run.yml',
    'config/ci/baseline-change-profiles.json',
    'config/policy/baseline-branch-topology.json',
  ];
  for (const rel of expectedFiles) {
    assert.strictEqual(fs.existsSync(path.join(repo, rel)), true, `expected file to exist: ${rel}`);
  }

  const diff = runEngine(['diff', '--target', repo], process.cwd());
  assert.strictEqual(diff.command, 'diff');
  assert.strictEqual(typeof diff.change_count, 'number');

  const statePath = path.join(repo, '.baseline', 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.installed_version = '2.1.0';
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  const upgrade = runEngine(['upgrade', '--target', repo], process.cwd());
  assert.strictEqual(upgrade.command, 'upgrade');
  assert.ok(Array.isArray(upgrade.pending_migrations));

  const apply = runEngine(['apply', '--target', repo, '--direct'], process.cwd());
  assert.strictEqual(apply.command, 'apply');

  const doctor = runEngine(['doctor', '--target', repo], process.cwd());
  assert.strictEqual(doctor.command, 'doctor');
  assert.strictEqual(typeof doctor.module_count, 'number');

  const verify = runEngine(['verify', '--target', repo], process.cwd());
  assert.strictEqual(verify.command, 'verify');

  console.log('[baseline-engine:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
