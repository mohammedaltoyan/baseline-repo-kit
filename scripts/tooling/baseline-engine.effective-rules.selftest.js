/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const { CAPABILITY_KEYS } = require('../../tooling/apps/baseline-engine/lib/capabilities/github');
const { defaultConfig } = require('../../tooling/apps/baseline-engine/lib/config');
const { loadModules } = require('../../tooling/apps/baseline-engine/lib/modules');
const {
  deriveModuleCapabilityRequirements,
  getPath,
  loadEffectiveSettingRules,
} = require('../../tooling/apps/baseline-engine/lib/policy/effective-settings');

function run() {
  const capabilitySet = new Set(CAPABILITY_KEYS);
  const config = defaultConfig({
    maintainersCount: 3,
    components: [{ id: 'application', name: 'application', path: 'apps', enabled: true }],
    profile: 'strict',
  });
  const moduleSet = new Set(loadModules().map((mod) => String(mod && mod.id || '').trim()));
  const rules = loadEffectiveSettingRules();

  assert.strictEqual(Number(rules.version), 1);
  assert.strictEqual(Array.isArray(rules.rules), true);
  assert.strictEqual(rules.rules.length > 0, true);

  for (const rule of rules.rules) {
    const id = String(rule && rule.id || '').trim();
    const path = String(rule && rule.path || '').trim();
    const capability = String(rule && rule.capability || '').trim();
    const moduleId = String(rule && rule.module || '').trim();
    assert.strictEqual(Boolean(id), true, 'rule id is required');
    assert.strictEqual(typeof getPath(config, path) !== 'undefined', true, `rule path must exist in config: ${path}`);
    assert.strictEqual(capabilitySet.has(capability), true, `rule capability must be known: ${capability}`);
    assert.strictEqual(moduleSet.has(moduleId), true, `rule module must exist: ${moduleId}`);
  }

  const requiresWhenEnabled = deriveModuleCapabilityRequirements({
    moduleId: 'core-ci',
    config,
    baseRequires: ['rulesets'],
  });
  assert.deepStrictEqual(
    requiresWhenEnabled,
    ['rulesets', 'merge_queue'],
    'core-ci capability requirements should include merge_queue when trigger is enabled'
  );

  const configMergeQueueDisabled = JSON.parse(JSON.stringify(config));
  configMergeQueueDisabled.ci.full_lane_triggers.merge_queue = false;
  const requiresWhenDisabled = deriveModuleCapabilityRequirements({
    moduleId: 'core-ci',
    config: configMergeQueueDisabled,
    baseRequires: ['rulesets'],
  });
  assert.deepStrictEqual(
    requiresWhenDisabled,
    ['rulesets'],
    'core-ci capability requirements should drop merge_queue when trigger is disabled'
  );

  console.log('[baseline-engine:effective-rules-selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
