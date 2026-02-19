'use strict';

const {
  generateChangeClassifierScript,
  generateNodeRunWorkflow,
  generatePrGateWorkflow,
} = require('../../../lib/generator/workflows');
const {
  buildEffectiveConfig,
  deriveModuleCapabilityRequirements,
} = require('../../../lib/policy/effective-settings');

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

module.exports = {
  id: 'core-ci',
  resolve_capability_requirements({ config, module }) {
    const capabilityRequirements = module && module.capability_requirements
      && typeof module.capability_requirements === 'object'
      ? module.capability_requirements
      : {};
    const requires = deriveModuleCapabilityRequirements({
      moduleId: 'core-ci',
      config,
      baseRequires: capabilityRequirements.requires,
    });
    return {
      requires,
      degrade_strategy: String(capabilityRequirements.degrade_strategy || '').trim() || 'warn',
      remediation: capabilityRequirements.remediation && typeof capabilityRequirements.remediation === 'object'
        ? capabilityRequirements.remediation
        : {},
    };
  },
  generate({ config, capabilities, evaluation }) {
    const degraded = !!(evaluation && evaluation.degraded);
    const effective = buildEffectiveConfig({
      config,
      capabilities,
      moduleEvaluation: {
        modules: [evaluation],
      },
    });
    const effectiveConfig = effective.config && typeof effective.config === 'object' ? effective.config : {};
    const effectiveCi = effectiveConfig.ci && typeof effectiveConfig.ci === 'object' ? effectiveConfig.ci : {};
    const effectiveFullLaneTriggers = effectiveCi.full_lane_triggers
      && typeof effectiveCi.full_lane_triggers === 'object'
      ? effectiveCi.full_lane_triggers
      : {};

    return [
      {
        path: 'config/ci/baseline-change-profiles.json',
        strategy: 'replace',
        content: stableJson({
          version: 1,
          profile_source: 'settings',
          ci_mode: String(effectiveCi.mode || 'two_lane'),
          action_refs: effectiveCi.action_refs && typeof effectiveCi.action_refs === 'object'
            ? effectiveCi.action_refs
            : {},
          full_lane_triggers: effectiveFullLaneTriggers,
          degraded,
          effective_overrides: effective.overrides,
          degraded_reasons: (evaluation && Array.isArray(evaluation.missing) ? evaluation.missing : []).map((entry) => ({
            capability: entry.capability,
            reason: entry.reason,
            remediation: entry.remediation || '',
          })),
          profiles: Array.isArray(effectiveCi.change_profiles) ? effectiveCi.change_profiles : [],
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
