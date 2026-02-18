/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const { defaultConfig } = require('../../tooling/apps/baseline-engine/lib/config');
const { validateConfig } = require('../../tooling/apps/baseline-engine/lib/schema');

function run() {
  const config = defaultConfig({
    maintainersCount: 3,
    components: [{ id: 'application', name: 'application', path: 'apps', enabled: true }],
    profile: 'strict',
  });

  assert.strictEqual(validateConfig(config), true, 'default config should pass schema validation');

  const invalid = JSON.parse(JSON.stringify(config));
  invalid.unknown_key = true;
  assert.throws(
    () => validateConfig(invalid),
    /Invalid config:/,
    'schema validation should fail on unknown top-level keys'
  );

  const invalidRef = JSON.parse(JSON.stringify(config));
  invalidRef.ci.action_refs.checkout = '';
  assert.throws(
    () => validateConfig(invalidRef),
    /Invalid config:/,
    'schema validation should fail on invalid action refs'
  );

  console.log('[baseline-engine:schema-selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
