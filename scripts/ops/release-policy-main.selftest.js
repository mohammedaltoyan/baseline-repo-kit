/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const {
  approvedReviewersByLatestState,
  evaluateMainApprovalGate,
  parseApproverLogins,
} = require('./release-policy-main');

function run() {
  assert.deepStrictEqual(
    parseApproverLogins('@Alice, bob  CAROL'),
    ['alice', 'bob', 'carol']
  );

  const approved = approvedReviewersByLatestState([
    { user: { login: 'alice' }, state: 'APPROVED' },
    { user: { login: 'bob' }, state: 'APPROVED' },
    { user: { login: 'alice' }, state: 'DISMISSED' },
  ]);
  assert.deepStrictEqual(Array.from(approved).sort(), ['bob']);

  assert.strictEqual(
    evaluateMainApprovalGate({
      requiredApprovers: [],
      authorLogin: 'owner',
      approvedReviewers: new Set(),
      allowSoloAuthorFallback: true,
    }).ok,
    true
  );

  assert.strictEqual(
    evaluateMainApprovalGate({
      requiredApprovers: ['reviewer'],
      authorLogin: 'owner',
      approvedReviewers: new Set(['reviewer']),
      allowSoloAuthorFallback: true,
    }).ok,
    true
  );

  assert.strictEqual(
    evaluateMainApprovalGate({
      requiredApprovers: ['owner'],
      authorLogin: 'owner',
      approvedReviewers: new Set(),
      allowSoloAuthorFallback: true,
    }).ok,
    true
  );

  assert.strictEqual(
    evaluateMainApprovalGate({
      requiredApprovers: ['owner', 'reviewer'],
      authorLogin: 'owner',
      approvedReviewers: new Set(['owner']),
      allowSoloAuthorFallback: true,
    }).ok,
    false
  );

  assert.strictEqual(
    evaluateMainApprovalGate({
      requiredApprovers: ['owner'],
      authorLogin: 'owner',
      approvedReviewers: new Set(),
      allowSoloAuthorFallback: false,
    }).ok,
    false
  );

  console.log('[release-policy-main:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
