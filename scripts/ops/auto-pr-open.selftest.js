/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const {
  looksLikeActionsPrCreationPermissionError,
  looksLikeExistingPrValidationError,
  selectAuthToken,
} = require('./auto-pr-open');

function run() {
  assert.strictEqual(
    selectAuthToken({ AUTOPR_TOKEN: 'bot-pat', GITHUB_TOKEN: 'gh-token', GH_TOKEN: 'gh-cli-token' }),
    'bot-pat',
    'expected AUTOPR_TOKEN to have highest precedence'
  );
  assert.strictEqual(
    selectAuthToken({ GITHUB_TOKEN: 'gh-token', GH_TOKEN: 'gh-cli-token' }),
    'gh-token',
    'expected GITHUB_TOKEN to be used when AUTOPR_TOKEN is missing'
  );
  assert.strictEqual(
    selectAuthToken({ GH_TOKEN: 'gh-cli-token' }),
    'gh-cli-token',
    'expected GH_TOKEN fallback when AUTOPR_TOKEN/GITHUB_TOKEN are missing'
  );

  assert.strictEqual(
    looksLikeActionsPrCreationPermissionError('GitHub API 403 POST /repos/acme/repo/pulls: {"message":"GitHub Actions is not permitted to create or approve pull requests."}'),
    true,
    'expected blocked-actions error shape to be detected'
  );
  assert.strictEqual(
    looksLikeActionsPrCreationPermissionError('GitHub API 422 POST /repos/acme/repo/pulls: {"message":"Validation Failed"}'),
    false,
    'expected non-permission API errors to not match blocked-actions classifier'
  );
  assert.strictEqual(
    looksLikeExistingPrValidationError('GitHub API 422 POST /repos/acme/repo/pulls: {"message":"Validation Failed","errors":[{"resource":"PullRequest","code":"custom","message":"A pull request already exists for acme:feat/branch."}]}'),
    true,
    'expected duplicate PR validation error shape to be detected'
  );
  assert.strictEqual(
    looksLikeExistingPrValidationError('GitHub API 422 POST /repos/acme/repo/pulls: {"message":"Validation Failed","errors":[{"resource":"PullRequest","code":"invalid","message":"head invalid"}]}'),
    false,
    'expected unrelated 422 validation errors to remain fatal'
  );

  console.log('[auto-pr-open:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
