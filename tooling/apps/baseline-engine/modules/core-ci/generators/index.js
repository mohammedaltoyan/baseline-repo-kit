'use strict';

const {
  generateChangeClassifierScript,
  generateNodeRunWorkflow,
  generatePrGateWorkflow,
} = require('../../../lib/generator/workflows');

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
  generate({ config, evaluation }) {
    const ci = config && config.ci && typeof config.ci === 'object' ? config.ci : {};
    const fullLaneTriggers = ci.full_lane_triggers && typeof ci.full_lane_triggers === 'object'
      ? ci.full_lane_triggers
      : {};
    const missingCapabilities = new Set((evaluation && Array.isArray(evaluation.missing) ? evaluation.missing : [])
      .map((entry) => String(entry && entry.capability || '').trim())
      .filter(Boolean));
    const degradedMergeQueue = missingCapabilities.has('merge_queue');
    const degraded = !!(evaluation && evaluation.degraded);
    const effectiveConfig = JSON.parse(JSON.stringify(config || {}));
    effectiveConfig.ci = effectiveConfig.ci && typeof effectiveConfig.ci === 'object' ? effectiveConfig.ci : {};
    effectiveConfig.ci.full_lane_triggers = effectiveConfig.ci.full_lane_triggers && typeof effectiveConfig.ci.full_lane_triggers === 'object'
      ? effectiveConfig.ci.full_lane_triggers
      : {};
    if (degradedMergeQueue) {
      effectiveConfig.ci.full_lane_triggers.merge_queue = false;
    }

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
