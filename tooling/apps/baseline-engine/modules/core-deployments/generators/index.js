'use strict';

const { generateDeployWorkflow } = require('../../../lib/generator/workflows');

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

module.exports = {
  id: 'core-deployments',
  resolve_capability_requirements({ module }) {
    return {
      requires: ['environments'],
      degrade_strategy: module && module.capability_requirements
        ? module.capability_requirements.degrade_strategy
        : 'warn',
      remediation: module && module.capability_requirements
        ? module.capability_requirements.remediation
        : {},
    };
  },
  generate({ config, evaluation }) {
    const deployments = config && config.deployments && typeof config.deployments === 'object'
      ? config.deployments
      : {};
    const degradedReasons = (evaluation && Array.isArray(evaluation.missing) ? evaluation.missing : []).map((entry) => ({
      capability: entry.capability,
      reason: entry.reason,
      remediation: entry.remediation || '',
    }));

    return [
      {
        path: 'config/policy/baseline-deployment-approval-matrix.json',
        strategy: 'replace',
        content: stableJson({
          version: 1,
          degraded: !!(evaluation && evaluation.degraded),
          degraded_reasons: degradedReasons,
          environments: Array.isArray(deployments.environments) ? deployments.environments : [],
          components: Array.isArray(deployments.components) ? deployments.components : [],
          approval_matrix: Array.isArray(deployments.approval_matrix) ? deployments.approval_matrix : [],
        }),
      },
      {
        path: '.github/workflows/baseline-deploy.yml',
        strategy: 'replace',
        content: generateDeployWorkflow(config),
      },
    ];
  },
};
