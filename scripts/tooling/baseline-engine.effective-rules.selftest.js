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
  matchesRuleCondition,
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
    assert.strictEqual(rule.when && typeof rule.when === 'object', true, `rule when predicate required: ${id}`);
    assert.strictEqual(Boolean(String(rule.when.operator || '').trim()), true, `rule when.operator required: ${id}`);
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

  assert.strictEqual(
    matchesRuleCondition({ operator: 'equals', value: true }, true),
    true,
    'equals condition should match strict value equality'
  );
  assert.strictEqual(
    matchesRuleCondition({ operator: 'not_equals', value: true }, false),
    true,
    'not_equals condition should invert strict value equality'
  );
  assert.strictEqual(
    matchesRuleCondition({ operator: 'in', values: ['dev', 'staging'] }, 'dev'),
    true,
    'in condition should match any listed value'
  );
  assert.strictEqual(
    matchesRuleCondition({ operator: 'not_in', values: ['prod', 'qa'] }, 'dev'),
    true,
    'not_in condition should exclude listed values'
  );

  console.log('[baseline-engine:effective-rules-selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
