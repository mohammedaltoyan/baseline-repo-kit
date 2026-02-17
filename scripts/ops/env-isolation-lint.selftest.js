/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const { isEnabled, diffKeys } = require('./env-isolation-lint');

function run() {
  assert.strictEqual(isEnabled('1'), true);
  assert.strictEqual(isEnabled('enabled'), true);
  assert.strictEqual(isEnabled('true'), true);
  assert.strictEqual(isEnabled('0'), false);
  assert.strictEqual(isEnabled(''), false);

  assert.deepStrictEqual(diffKeys(['A', 'B'], ['A']), ['B']);
  assert.deepStrictEqual(diffKeys(['A'], ['A', 'B']), []);
  assert.deepStrictEqual(diffKeys([], ['A']), []);

  console.log('[env-isolation-lint:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };

