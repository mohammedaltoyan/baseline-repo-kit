'use strict';

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

module.exports = {
  id: 'core-planning',
  resolve_capability_requirements({ module }) {
    return {
      requires: [],
      degrade_strategy: module && module.capability_requirements
        ? module.capability_requirements.degrade_strategy
        : 'warn',
      remediation: module && module.capability_requirements
        ? module.capability_requirements.remediation
        : {},
    };
  },
  generate({ config, evaluation }) {
    const planning = config && config.planning && typeof config.planning === 'object'
      ? config.planning
      : {};
    return [
      {
        path: 'config/policy/baseline-planning-policy.json',
        strategy: 'replace',
        content: stableJson({
          version: 1,
          required: !!planning.required,
          automation_allowlist: Array.isArray(planning.automation_allowlist) ? planning.automation_allowlist : [],
          degraded: !!(evaluation && evaluation.degraded),
          degraded_reasons: (evaluation && Array.isArray(evaluation.missing) ? evaluation.missing : []),
        }),
      },
    ];
  },
};
