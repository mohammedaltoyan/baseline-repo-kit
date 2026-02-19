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
  return JSON.parse(String(res.stdout || '{}'));
}

function runEngineRaw(args, cwd) {
  return spawnSync(process.execPath, [engineCli, ...args, '--json'], {
    cwd,
    encoding: 'utf8',
  });
}

function run() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-engine-capability-selftest-'));
  const repo = path.join(tmpRoot, 'repo');
  fs.mkdirSync(repo, { recursive: true });

  runEngine(['init', '--target', repo], process.cwd());

  const capabilityPath = path.join(repo, '.baseline', 'capabilities', 'github.json');
  const capability = JSON.parse(fs.readFileSync(capabilityPath, 'utf8'));
  capability.capabilities = {
    rulesets: { supported: false, state: 'unsupported', reason: 'test' },
    merge_queue: { supported: false, state: 'unsupported', reason: 'test' },
    environments: { supported: false, state: 'unsupported', reason: 'test' },
    code_scanning: { supported: false, state: 'unsupported', reason: 'test' },
    dependency_review: { supported: false, state: 'unsupported', reason: 'test' },
    repo_variables: { supported: false, state: 'unsupported', reason: 'test' },
    github_app_required: { supported: false, state: 'unsupported', reason: 'test' },
  };
  capability.warnings = [];
  fs.writeFileSync(capabilityPath, `${JSON.stringify(capability, null, 2)}\n`, 'utf8');

  const doctor = runEngine(['doctor', '--target', repo], process.cwd());
  assert.ok(Array.isArray(doctor.capability_degraded_modules), 'doctor should return module degradation summary');
  assert.ok(doctor.capability_degraded_modules.length >= 1, 'at least one module should degrade when capabilities are unsupported');
  assert.strictEqual(doctor.github_app.required_for_full_feature_set, true);
  assert.strictEqual(doctor.github_app.effective_required, false);

  const configPath = path.join(repo, '.baseline', 'config.yaml');
  const configRaw = fs.readFileSync(configPath, 'utf8');
  fs.writeFileSync(
    configPath,
    configRaw.replace('merge_queue: true', 'merge_queue: false'),
    'utf8'
  );

  const capability2 = JSON.parse(fs.readFileSync(capabilityPath, 'utf8'));
  capability2.capabilities.rulesets = { supported: true, state: 'supported', reason: 'test' };
  capability2.capabilities.environments = { supported: true, state: 'supported', reason: 'test' };
  capability2.capabilities.merge_queue = { supported: false, state: 'unsupported', reason: 'test' };
  fs.writeFileSync(capabilityPath, `${JSON.stringify(capability2, null, 2)}\n`, 'utf8');

  const doctor2 = runEngine(['doctor', '--target', repo], process.cwd());
  assert.strictEqual(
    doctor2.capability_degraded_modules.some((entry) => String(entry.module) === 'core-ci'),
    false,
    'core-ci should not degrade when merge_queue trigger is disabled by settings'
  );

  const configRawPolicy = fs.readFileSync(configPath, 'utf8');
  fs.writeFileSync(
    configPath,
    configRawPolicy.replace('require_github_app: false', 'require_github_app: true'),
    'utf8'
  );
  const capabilityRequireApp = JSON.parse(fs.readFileSync(capabilityPath, 'utf8'));
  capabilityRequireApp.capabilities.rulesets = { supported: false, state: 'unsupported', reason: 'test' };
  fs.writeFileSync(capabilityPath, `${JSON.stringify(capabilityRequireApp, null, 2)}\n`, 'utf8');
  const doctorRequireApp = runEngineRaw(['doctor', '--target', repo], process.cwd());
  assert.notStrictEqual(
    doctorRequireApp.status,
    0,
    'doctor should fail when policy.require_github_app=true and required capabilities are missing'
  );
  fs.writeFileSync(
    configPath,
    configRawPolicy,
    'utf8'
  );

  const configRawDisable = fs.readFileSync(configPath, 'utf8');
  fs.writeFileSync(
    configPath,
    configRawDisable.replace(/^\s*-\s*core-deployments\s*$/m, ''),
    'utf8'
  );
  const capability3 = JSON.parse(fs.readFileSync(capabilityPath, 'utf8'));
  capability3.capabilities.environments = { supported: false, state: 'unsupported', reason: 'test' };
  fs.writeFileSync(capabilityPath, `${JSON.stringify(capability3, null, 2)}\n`, 'utf8');
  const doctor3 = runEngine(['doctor', '--target', repo], process.cwd());
  assert.strictEqual(
    doctor3.missing_required_capabilities.includes('environments'),
    false,
    'disabled modules must not contribute required capabilities'
  );

  const apply = runEngine(['apply', '--target', repo, '--direct'], process.cwd());
  assert.strictEqual(apply.command, 'apply');
  assert.ok(Array.isArray(apply.warnings));
  const ciProfile = JSON.parse(fs.readFileSync(path.join(repo, 'config', 'ci', 'baseline-change-profiles.json'), 'utf8'));
  const doctorAfterApply = runEngine(['doctor', '--target', repo], process.cwd());
  assert.strictEqual(
    ciProfile.full_lane_triggers.merge_queue,
    false,
    'effective settings should auto-disable merge queue trigger when unsupported'
  );
  assert.deepStrictEqual(
    ciProfile.full_lane_triggers,
    doctorAfterApply.insights.effective_settings.config.ci.full_lane_triggers,
    'generated CI profile triggers must match effective config SSOT'
  );
  assert.strictEqual(
    Array.isArray(ciProfile.effective_overrides),
    true,
    'generated CI profile should record effective override decisions'
  );

  const configRaw2 = fs.readFileSync(configPath, 'utf8');
  fs.writeFileSync(
    configPath,
    configRaw2.replace('require_pinned_action_refs: false', 'require_pinned_action_refs: true'),
    'utf8'
  );
  const doctorPinned = runEngineRaw(['doctor', '--target', repo], process.cwd());
  assert.notStrictEqual(doctorPinned.status, 0, 'doctor should fail when pinned refs are required but not configured');

  console.log('[baseline-engine:capability-selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
