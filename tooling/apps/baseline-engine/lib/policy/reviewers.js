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

module.exports = {
  computeAdaptiveReviewThresholds,
};
