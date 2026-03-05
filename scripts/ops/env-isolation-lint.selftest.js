/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const {
  isEnabled,
  diffKeys,
  buildTokenCandidates,
  isAuthzDeniedResponse,
  resolveAuthzMode,
} = require('./env-isolation-lint');

function run() {
  assert.strictEqual(isEnabled('1'), true);
  assert.strictEqual(isEnabled('enabled'), true);
  assert.strictEqual(isEnabled('true'), true);
  assert.strictEqual(isEnabled('0'), false);
  assert.strictEqual(isEnabled(''), false);

  assert.deepStrictEqual(diffKeys(['A', 'B'], ['A']), ['B']);
  assert.deepStrictEqual(diffKeys(['A'], ['A', 'B']), []);
  assert.deepStrictEqual(diffKeys([], ['A']), []);
  assert.deepStrictEqual(buildTokenCandidates('', null, 'abc', 'abc', 'def'), ['abc', 'def']);
  assert.deepStrictEqual(buildTokenCandidates('  ', undefined), []);

  const prevAuthzMode = process.env.ENV_ISOLATION_LINT_AUTHZ_MODE;
  delete process.env.ENV_ISOLATION_LINT_AUTHZ_MODE;
  assert.strictEqual(resolveAuthzMode({}), 'warn');
  process.env.ENV_ISOLATION_LINT_AUTHZ_MODE = 'strict';
  assert.strictEqual(resolveAuthzMode({}), 'strict');
  assert.strictEqual(resolveAuthzMode({ authzMode: 'warn' }), 'warn');
  assert.throws(() => resolveAuthzMode({ authzMode: 'unsupported' }), /Invalid authz mode/);
  if (prevAuthzMode === undefined) delete process.env.ENV_ISOLATION_LINT_AUTHZ_MODE;
  else process.env.ENV_ISOLATION_LINT_AUTHZ_MODE = prevAuthzMode;

  assert.strictEqual(
    isAuthzDeniedResponse({ status: 403, text: '{"message":"Resource not accessible by integration"}' }),
    true
  );
  assert.strictEqual(
    isAuthzDeniedResponse({ status: 403, text: '{"message":"API rate limit exceeded"}' }),
    false
  );
  assert.strictEqual(isAuthzDeniedResponse({ status: 401, text: '{"message":"Bad credentials"}' }), false);
  assert.strictEqual(isAuthzDeniedResponse({ status: 404, text: '{"message":"Not Found"}' }), false);

  console.log('[env-isolation-lint:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
