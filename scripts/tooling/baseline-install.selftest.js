/* eslint-disable no-console */
const assert = require('assert');
const { isExcludedPath, allowedByMode, normalizeMode } = require('./baseline-install');

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

  // Toolchain SSOT should be installed in overlay mode.
  assert.strictEqual(allowedByMode('.nvmrc', 'overlay'), true);
  assert.strictEqual(allowedByMode('.nvmrc', 'init'), true);
  assert.strictEqual(allowedByMode('.editorconfig', 'overlay'), true);
  assert.strictEqual(allowedByMode('CONTRIBUTING.md', 'overlay'), true);
  assert.strictEqual(allowedByMode('SECURITY.md', 'overlay'), true);

  // Monorepo scaffolding should be installable in overlay mode.
  assert.strictEqual(allowedByMode('apps/README.md', 'overlay'), true);
  assert.strictEqual(allowedByMode('apps/backend/index.js', 'overlay'), true);
  assert.strictEqual(allowedByMode('apps/frontend/index.html', 'overlay'), true);
  assert.strictEqual(allowedByMode('packages/README.md', 'overlay'), true);
  assert.strictEqual(allowedByMode('packages/shared/app-stack-contract.js', 'overlay'), true);

  // Overlay safety: avoid overwriting project identity by default.
  assert.strictEqual(allowedByMode('README.md', 'overlay'), false);

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
