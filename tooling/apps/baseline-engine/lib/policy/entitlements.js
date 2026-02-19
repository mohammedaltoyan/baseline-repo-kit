'use strict';

const FEATURE_DOCS = Object.freeze({
  rulesets: 'https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets',
  merge_queue: 'https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue',
  environment_required_reviewers: 'https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#required-reviewers',
  custom_deployment_protection_rules: 'https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-protection-rules',
});

function normalizeOwnerType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'organization') return 'Organization';
  if (raw === 'user') return 'User';
  return 'unknown';
}

function normalizeVisibility(isPrivate) {
  return isPrivate === true ? 'private' : 'public_or_unknown';
}

function featureRow({ id, state, reason, remediation }) {
  return {
    feature: String(id || '').trim(),
    state: String(state || 'unknown').trim(),
    reason: String(reason || 'unknown').trim(),
    remediation: String(remediation || '').trim(),
    docs_url: FEATURE_DOCS[id] || '',
  };
}

function rulesetsAdvisory(visibility) {
  if (visibility === 'public_or_unknown') {
    return featureRow({
      id: 'rulesets',
      state: 'likely_supported',
      reason: 'public_repository',
      remediation: '',
    });
  }
  return featureRow({
    id: 'rulesets',
    state: 'plan_dependent',
    reason: 'private_repository',
    remediation: 'Private repository ruleset enforcement may require paid GitHub plans. Verify plan entitlement and repo admin access.',
  });
}

function mergeQueueAdvisory({ ownerType, visibility }) {
  if (ownerType !== 'Organization') {
    return featureRow({
      id: 'merge_queue',
      state: 'unlikely_supported',
      reason: 'organization_repo_expected',
      remediation: 'Merge queue is typically available for organization-owned repositories. Use organization ownership or disable merge-queue triggers.',
    });
  }
  if (visibility === 'public_or_unknown') {
    return featureRow({
      id: 'merge_queue',
      state: 'likely_supported',
      reason: 'public_organization_repository',
      remediation: '',
    });
  }
  return featureRow({
    id: 'merge_queue',
    state: 'plan_dependent',
    reason: 'private_organization_repository',
    remediation: 'Private organization repositories may require Enterprise plan support for merge queue. If unavailable, disable merge-queue triggers.',
  });
}

function requiredReviewersAdvisory(visibility) {
  if (visibility === 'public_or_unknown') {
    return featureRow({
      id: 'environment_required_reviewers',
      state: 'likely_supported',
      reason: 'public_repository',
      remediation: '',
    });
  }
  return featureRow({
    id: 'environment_required_reviewers',
    state: 'plan_dependent',
    reason: 'private_repository',
    remediation: 'Required reviewers for private environments can be plan-dependent. If unsupported, keep matrix rules documented and enforce via policy checks.',
  });
}

function deploymentProtectionRulesAdvisory(visibility) {
  if (visibility === 'public_or_unknown') {
    return featureRow({
      id: 'custom_deployment_protection_rules',
      state: 'likely_supported',
      reason: 'public_repository',
      remediation: '',
    });
  }
  return featureRow({
    id: 'custom_deployment_protection_rules',
    state: 'plan_dependent',
    reason: 'private_repository',
    remediation: 'Custom deployment protection rules for private repositories can require higher-tier plans. Use advisory mode and explicit approvals if unavailable.',
  });
}

function evaluateGithubEntitlements({ ownerType, repositoryPrivate } = {}) {
  const owner = normalizeOwnerType(ownerType);
  const visibility = normalizeVisibility(repositoryPrivate === true);
  const features = [
    rulesetsAdvisory(visibility),
    mergeQueueAdvisory({ ownerType: owner, visibility }),
    requiredReviewersAdvisory(visibility),
    deploymentProtectionRulesAdvisory(visibility),
  ];

  return {
    owner_type: owner,
    repository_visibility: visibility,
    feature_count: features.length,
    features,
    by_feature: Object.fromEntries(features.map((entry) => [entry.feature, entry])),
  };
}

module.exports = {
  evaluateGithubEntitlements,
};
