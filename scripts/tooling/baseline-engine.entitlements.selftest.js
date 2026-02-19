/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const { evaluateGithubEntitlements } = require('../../tooling/apps/baseline-engine/lib/policy/entitlements');

function stateFor(entitlements, feature) {
  const map = entitlements && entitlements.by_feature && typeof entitlements.by_feature === 'object'
    ? entitlements.by_feature
    : {};
  const entry = map[feature] && typeof map[feature] === 'object' ? map[feature] : {};
  return String(entry.state || 'unknown');
}

function run() {
  const publicOrg = evaluateGithubEntitlements({
    ownerType: 'Organization',
    repositoryPrivate: false,
  });
  assert.strictEqual(publicOrg.owner_type, 'Organization');
  assert.strictEqual(publicOrg.repository_visibility, 'public_or_unknown');
  assert.strictEqual(stateFor(publicOrg, 'merge_queue'), 'likely_supported');

  const privateOrg = evaluateGithubEntitlements({
    ownerType: 'Organization',
    repositoryPrivate: true,
  });
  assert.strictEqual(privateOrg.repository_visibility, 'private');
  assert.strictEqual(stateFor(privateOrg, 'merge_queue'), 'plan_dependent');
  assert.strictEqual(stateFor(privateOrg, 'environment_required_reviewers'), 'plan_dependent');

  const userRepo = evaluateGithubEntitlements({
    ownerType: 'User',
    repositoryPrivate: false,
  });
  assert.strictEqual(userRepo.owner_type, 'User');
  assert.strictEqual(stateFor(userRepo, 'merge_queue'), 'unlikely_supported');

  console.log('[baseline-engine:entitlements-selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
