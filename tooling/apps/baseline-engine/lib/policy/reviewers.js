'use strict';

function computeAdaptiveReviewThresholds(maintainerCount) {
  const count = Number.isFinite(Number(maintainerCount)) ? Number(maintainerCount) : 0;

  const defaults = {
    maintainers_le_1: {
      required_non_author_approvals: 0,
      require_strict_ci: true,
      require_codeowners: false,
    },
    maintainers_2_to_5: {
      required_non_author_approvals: 1,
      require_strict_ci: true,
      require_codeowners: false,
    },
    maintainers_ge_6: {
      required_non_author_approvals: 2,
      require_strict_ci: true,
      require_codeowners: true,
    },
  };

  let activeBucket = 'maintainers_le_1';
  if (count >= 2 && count <= 5) activeBucket = 'maintainers_2_to_5';
  else if (count >= 6) activeBucket = 'maintainers_ge_6';

  return {
    active_bucket: activeBucket,
    defaults,
  };
}

function resolveActiveReviewPolicy({ maintainerCount, thresholds }) {
  const adaptive = computeAdaptiveReviewThresholds(maintainerCount);
  const source = thresholds && typeof thresholds === 'object' ? thresholds : adaptive.defaults;
  const bucket = adaptive.active_bucket;
  const selected = source[bucket] && typeof source[bucket] === 'object'
    ? source[bucket]
    : adaptive.defaults[bucket];

  return {
    active_bucket: bucket,
    maintainer_count: Number.isFinite(Number(maintainerCount)) ? Number(maintainerCount) : 0,
    policy: {
      required_non_author_approvals: Number(selected && selected.required_non_author_approvals || 0),
      require_strict_ci: !!(selected && selected.require_strict_ci),
      require_codeowners: !!(selected && selected.require_codeowners),
    },
  };
}

module.exports = {
  computeAdaptiveReviewThresholds,
  resolveActiveReviewPolicy,
};
