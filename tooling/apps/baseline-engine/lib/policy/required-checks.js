'use strict';

const { workflowCheckNames } = require('../generator/workflows');

function unique(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

function deriveRequiredChecksByRole({ enabledModules, activeReviewPolicy }) {
  const enabled = new Set(Array.isArray(enabledModules) ? enabledModules : []);
  const checks = workflowCheckNames();
  const hasCi = enabled.has('core-ci');
  const hasDeployments = enabled.has('core-deployments');
  const requireStrictCi = !!(activeReviewPolicy && activeReviewPolicy.require_strict_ci);

  const fast = hasCi ? [checks.fast_lane] : [];
  const full = hasCi && requireStrictCi ? [checks.full_lane] : [];
  const deploy = hasDeployments ? [checks.deploy] : [];

  return {
    integration: unique([...fast, ...full]),
    production: unique([...fast, ...full, ...deploy]),
    release: unique([...fast, ...full, ...deploy]),
    hotfix: unique([...fast, ...full]),
    feature: unique([...fast]),
    custom: unique([...fast]),
  };
}

module.exports = {
  deriveRequiredChecksByRole,
};
