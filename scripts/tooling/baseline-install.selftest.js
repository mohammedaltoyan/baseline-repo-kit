/* eslint-disable no-console */
const assert = require('assert');
const { isExcludedPath, normalizeMode } = require('./baseline-install');

function run() {
  // Plan artifacts should never be installed into target repos.
  assert.strictEqual(isExcludedPath('docs/ops/plans/PLAN-209901-example.md'), true);
  assert.strictEqual(isExcludedPath('docs/ops/plans/archive/PLAN-209901-example.md'), true);
  assert.strictEqual(isExcludedPath('docs/ops/plans/archive/README.md'), false);
  assert.strictEqual(isExcludedPath('docs/ops/plans/README.md'), false);
  assert.strictEqual(isExcludedPath('docs/ops/plans/TEMPLATE.md'), false);

  // Generated dashboards are excluded (targets generate their own).
  assert.strictEqual(isExcludedPath('docs/ops/plans/FOCUS.json'), true);
  assert.strictEqual(isExcludedPath('docs/ops/plans/INDEX.md'), true);

  // Secret env files are excluded; examples are allowed.
  assert.strictEqual(isExcludedPath('config/env/.env.local'), true);
  assert.strictEqual(isExcludedPath('config/env/.env.local.example'), false);
  assert.strictEqual(isExcludedPath('.env'), true);
  assert.strictEqual(isExcludedPath('.env.example'), false);

  // Mode normalization.
  assert.strictEqual(normalizeMode(''), 'overlay');
  assert.strictEqual(normalizeMode('overlay'), 'overlay');
  assert.strictEqual(normalizeMode('init'), 'init');
  assert.strictEqual(normalizeMode('invalid'), '');

  console.log('[baseline-install:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };

