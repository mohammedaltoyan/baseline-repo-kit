/* eslint-disable no-console */
const assert = require('assert');
const { validateBranchPolicy } = require('./branch-policy');

function run() {
  const cfg = {
    integration_branch: 'dev',
    production_branch: 'main',
    hotfix_branch_prefixes: ['hotfix/'],
    require_hotfix_backport_note: true,
    hotfix_backport_markers: ['Backport:', 'Dev PR:'],
  };

  // Feature PRs must target dev.
  assert.deepStrictEqual(
    validateBranchPolicy({ baseRef: 'dev', headRef: 'feat/x', prBody: 'Plan: PLAN-209901-x\nStep: S10', config: cfg }).ok,
    true
  );

  // Disallow main -> dev PRs (use backport/* instead).
  assert.throws(
    () => validateBranchPolicy({ baseRef: 'dev', headRef: 'main', prBody: 'Plan: PLAN-209901-x\nStep: S10', config: cfg }),
    /must not come from main/i
  );

  // Release PR: dev -> main is allowed.
  assert.deepStrictEqual(
    validateBranchPolicy({ baseRef: 'main', headRef: 'dev', prBody: 'Plan: PLAN-209901-x\nStep: S10', config: cfg }).ok,
    true
  );

  // Hotfix PR to main requires a backport marker.
  assert.throws(
    () => validateBranchPolicy({ baseRef: 'main', headRef: 'hotfix/urgent', prBody: 'Plan: PLAN-209901-x\nStep: S10', config: cfg }),
    /backport note/i
  );

  validateBranchPolicy({
    baseRef: 'main',
    headRef: 'hotfix/urgent',
    prBody: 'Plan: PLAN-209901-x\nStep: S10\nBackport: PR-123',
    config: cfg,
  });

  // Explicitly disabling hotfix prefixes should make production dev-only.
  assert.throws(
    () => validateBranchPolicy({
      baseRef: 'main',
      headRef: 'hotfix/urgent',
      prBody: 'Plan: PLAN-209901-x\nStep: S10\nBackport: PR-123',
      config: {
        ...cfg,
        hotfix_branch_prefixes: [],
        require_hotfix_backport_note: false,
        hotfix_backport_markers: [],
      },
    }),
    /must come from dev/i
  );

  // Any other base branch is rejected.
  assert.throws(
    () => validateBranchPolicy({ baseRef: 'release', headRef: 'feat/x', prBody: 'Plan: PLAN-209901-x\nStep: S10', config: cfg }),
    /integration branch/i
  );

  console.log('[branch-policy:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
