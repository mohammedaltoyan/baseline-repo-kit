/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const { defaultConfig } = require('../../tooling/apps/baseline-engine/lib/config');
const {
  buildEffectiveConfig,
  loadEffectiveSettingRules,
} = require('../../tooling/apps/baseline-engine/lib/policy/effective-settings');

function run() {
  const rules = loadEffectiveSettingRules();
  assert.strictEqual(Number(rules.version), 1);
  assert.strictEqual(Array.isArray(rules.rules), true);
  assert.strictEqual(rules.rules.length >= 1, true);
  assert.strictEqual(
    rules.rules.some((rule) => String(rule.path) === 'ci.full_lane_triggers.merge_queue'),
    true,
    'rules SSOT should include merge queue trigger override'
  );
  assert.strictEqual(
    rules.rules.some(
      (rule) => String(rule.path) === 'ci.full_lane_triggers.merge_queue'
        && rule.when
        && String(rule.when.operator) === 'equals'
    ),
    true,
    'merge queue trigger rule should use predicate condition format'
  );

  const config = defaultConfig({
    maintainersCount: 2,
    components: [{ id: 'application', name: 'application', path: 'apps', enabled: true }],
    profile: 'strict',
  });

  const unsupportedCapabilities = {
    capabilities: {
      merge_queue: {
        supported: false,
        state: 'unsupported',
        reason: 'not_available',
      },
    },
  };

  const degraded = buildEffectiveConfig({
    config,
    capabilities: unsupportedCapabilities,
    moduleEvaluation: {
      modules: [
        {
          id: 'core-ci',
          missing: [
            {
              capability: 'merge_queue',
              reason: 'not_available',
              remediation: 'Enable merge queue in repository rulesets.',
            },
          ],
        },
      ],
    },
  });
  assert.strictEqual(degraded.config.ci.full_lane_triggers.merge_queue, false);
  assert.strictEqual(degraded.rules_version, 1);
  assert.strictEqual(degraded.override_count, 1);
  assert.strictEqual(degraded.by_path['ci.full_lane_triggers.merge_queue'].source, 'core-ci');
  assert.strictEqual(
    degraded.by_path['ci.full_lane_triggers.merge_queue'].remediation,
    'Enable merge queue in repository rulesets.'
  );

  const configuredOff = JSON.parse(JSON.stringify(config));
  configuredOff.ci.full_lane_triggers.merge_queue = false;
  const alreadyOff = buildEffectiveConfig({
    config: configuredOff,
    capabilities: unsupportedCapabilities,
    moduleEvaluation: { modules: [{ id: 'core-ci', missing: [] }] },
  });
  assert.strictEqual(alreadyOff.config.ci.full_lane_triggers.merge_queue, false);
  assert.strictEqual(alreadyOff.override_count, 0);

  const supportedCapabilities = {
    capabilities: {
      merge_queue: {
        supported: true,
        state: 'supported',
        reason: 'api_success',
      },
    },
  };
  const supported = buildEffectiveConfig({
    config,
    capabilities: supportedCapabilities,
    moduleEvaluation: { modules: [{ id: 'core-ci', missing: [] }] },
  });
  assert.strictEqual(supported.config.ci.full_lane_triggers.merge_queue, true);
  assert.strictEqual(supported.override_count, 0);

  console.log('[baseline-engine:effective-settings-selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
