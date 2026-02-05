/* eslint-disable no-console */
const assert = require('assert');
const { validatePrPolicy } = require('./pr-policy');

function run() {
  const planId = 'PLAN-209901-pr-policy-selftest';
  const plan = `---
plan_id: ${planId}
title: Selftest plan
owner: @owner
status: in_progress
current_step: S10
---

Checklist
- [ ] S00 - Plan preflight
- [ ] S10 - Phase step
- [ ] S98 - Objectives Gate
- [ ] S99 - Tests Gate
`;

  assert.throws(
    () => validatePrPolicy({ prBody: 'Step: S10', planById: { [planId]: plan }, changedFiles: [] }),
    /Missing `Plan:/i
  );

  assert.throws(
    () => validatePrPolicy({ prBody: `Plan: ${planId}`, planById: { [planId]: plan }, changedFiles: [] }),
    /Missing `Step:/i
  );

  assert.throws(
    () => validatePrPolicy({ prBody: `Plan: ${planId}\nStep: S20`, planById: { [planId]: plan }, changedFiles: [] }),
    /missing checklist item/i
  );

  assert.throws(
    () => validatePrPolicy({ prBody: `Plan: ${planId}\nStep: S00`, planById: { [planId]: plan }, changedFiles: ['README.md'] }),
    /plan-only/i
  );

  validatePrPolicy({
    prBody: `Plan: ${planId}\nStep: S00`,
    planById: { [planId]: plan },
    changedFiles: ['docs/ops/plans/PLAN-209901-pr-policy-selftest.md', 'docs/ops/plans/README.md'],
  });

  validatePrPolicy({
    prBody: `Plan: ${planId}\nStep: S10`,
    planById: { [planId]: plan },
    changedFiles: ['README.md'],
  });

  console.log('[pr-policy:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };

