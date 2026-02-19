'use strict';

const { deriveBranchRolePolicies } = require('../../../lib/policy/branching');
const { deriveRequiredChecksByRole } = require('../../../lib/policy/required-checks');
const { resolveActiveReviewPolicy } = require('../../../lib/policy/reviewers');

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

module.exports = {
  id: 'core-governance',
  resolve_capability_requirements({ module }) {
    return {
      requires: ['rulesets'],
      degrade_strategy: module && module.capability_requirements
        ? module.capability_requirements.degrade_strategy
        : 'warn',
      remediation: module && module.capability_requirements
        ? module.capability_requirements.remediation
        : {},
    };
  },
  generate({ config, capabilities, state, evaluation }) {
    const branching = config && config.branching && typeof config.branching === 'object' ? config.branching : {};
    const thresholds = branching.review_thresholds && typeof branching.review_thresholds === 'object'
      ? branching.review_thresholds
      : {};
    const branches = Array.isArray(branching.branches) ? branching.branches : [];
    const maintainerCount = Number(capabilities
      && capabilities.collaborators
      && capabilities.collaborators.maintainer_count || 0);
    const enabledModules = config && config.modules && Array.isArray(config.modules.enabled)
      ? config.modules.enabled
      : [];

    const reviewSelection = resolveActiveReviewPolicy({
      maintainerCount,
      thresholds,
    });

    const requiredChecksByRole = deriveRequiredChecksByRole({
      enabledModules,
      activeReviewPolicy: reviewSelection.policy,
    });

    const rolePolicies = deriveBranchRolePolicies({
      branches,
      requiredChecksByRole,
    });

    return [
      {
        path: 'config/policy/baseline-branch-topology.json',
        strategy: 'replace',
        content: stableJson({
          version: 1,
          generated_at: String(state && (state.last_applied_at || state.installed_at) || ''),
          degraded: !!(evaluation && evaluation.degraded),
          degraded_reasons: (evaluation && Array.isArray(evaluation.missing) ? evaluation.missing : []),
          topology: String(branching.topology || 'two_branch'),
          branches,
          branch_role_policies: rolePolicies,
        }),
      },
      {
        path: 'config/policy/baseline-review-thresholds.json',
        strategy: 'replace',
        content: stableJson({
          version: 1,
          maintainer_count: maintainerCount,
          active_bucket: reviewSelection.active_bucket,
          active_policy: reviewSelection.policy,
          thresholds,
        }),
      },
      {
        path: 'config/policy/baseline-required-checks.json',
        strategy: 'replace',
        content: stableJson({
          version: 1,
          required_checks_by_role: requiredChecksByRole,
          branch_policies: rolePolicies,
        }),
      },
    ];
  },
};
