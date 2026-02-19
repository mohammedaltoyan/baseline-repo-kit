/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const path = require('path');
const {
  lintContract,
  loadContract,
} = require('./baseline-v22-contract-lint');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function run() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const contract = loadContract(repoRoot);
  assert.strictEqual(contract.version, 1, 'contract version should be 1');

  const ok = lintContract({ repoRoot, contract });
  assert.strictEqual(ok.errors.length, 0, `expected no contract lint errors, got: ${ok.errors.join(' | ')}`);

  const badScript = clone(contract);
  badScript.required_cli_commands.push('baseline:not-real');
  const badScriptResult = lintContract({ repoRoot, contract: badScript });
  assert.strictEqual(
    badScriptResult.errors.some((entry) => entry.includes('baseline:not-real')),
    true,
    'expected missing script violation when contract requires non-existent command'
  );

  const badDefaults = clone(contract);
  badDefaults.required_default_values['policy.profile'] = 'advisory';
  const badDefaultsResult = lintContract({ repoRoot, contract: badDefaults });
  assert.strictEqual(
    badDefaultsResult.errors.some((entry) => entry.includes('policy.profile')),
    true,
    'expected default mismatch violation when contract default is incorrect'
  );

  console.log('[baseline-v22-contract-lint:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
