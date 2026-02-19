'use strict';

const {
  generateChangeClassifierScript,
  generateNodeRunWorkflow,
  generatePrGateWorkflow,
} = require('../../../lib/generator/workflows');
const { buildEffectiveConfig } = require('../../../lib/policy/effective-settings');

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

module.exports = {
  id: 'core-ci',
  resolve_capability_requirements({ config, module }) {
    const ci = config && config.ci && typeof config.ci === 'object' ? config.ci : {};
    const triggers = ci.full_lane_triggers && typeof ci.full_lane_triggers === 'object'
      ? ci.full_lane_triggers
      : {};
    const requires = ['rulesets'];
    if (triggers.merge_queue !== false) {
      requires.push('merge_queue');
    }
    return {
      requires,
      degrade_strategy: module && module.capability_requirements
        ? module.capability_requirements.degrade_strategy
        : 'warn',
      remediation: module && module.capability_requirements
        ? module.capability_requirements.remediation
        : {},
    };
  },
  generate({ config, capabilities, evaluation }) {
    const ci = config && config.ci && typeof config.ci === 'object' ? config.ci : {};
    const fullLaneTriggers = ci.full_lane_triggers && typeof ci.full_lane_triggers === 'object'
      ? ci.full_lane_triggers
      : {};
    const degraded = !!(evaluation && evaluation.degraded);
    const effective = buildEffectiveConfig({
      config,
      capabilities,
      moduleEvaluation: {
        modules: [evaluation],
      },
    });
    const effectiveConfig = effective.config;
    const effectiveOverride = effective.by_path['ci.full_lane_triggers.merge_queue'] || null;
    const degradedMergeQueue = !!effectiveOverride;

    return [
      {
        path: 'config/ci/baseline-change-profiles.json',
        strategy: 'replace',
        content: stableJson({
          version: 1,
          profile_source: 'settings',
          ci_mode: String(ci.mode || 'two_lane'),
          action_refs: ci.action_refs && typeof ci.action_refs === 'object' ? ci.action_refs : {},
          full_lane_triggers: {
            ...fullLaneTriggers,
            merge_queue: degradedMergeQueue ? false : fullLaneTriggers.merge_queue !== false,
          },
          degraded,
          effective_overrides: effective.overrides,
          degraded_reasons: (evaluation && Array.isArray(evaluation.missing) ? evaluation.missing : []).map((entry) => ({
            capability: entry.capability,
            reason: entry.reason,
            remediation: entry.remediation || '',
          })),
          profiles: Array.isArray(ci.change_profiles) ? ci.change_profiles : [],
        }),
      },
      {
        path: 'scripts/ops/ci/change-classifier.js',
        strategy: 'replace',
        content: generateChangeClassifierScript(),
      },
      {
        path: '.github/workflows/baseline-node-run.yml',
        strategy: 'replace',
        content: generateNodeRunWorkflow(effectiveConfig),
      },
      {
        path: '.github/workflows/baseline-pr-gate.yml',
        strategy: 'replace',
        content: generatePrGateWorkflow(effectiveConfig),
      },
    ];
  },
};
