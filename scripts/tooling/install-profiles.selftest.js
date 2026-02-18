/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  compileProfileFilters,
  normalizeProfileName,
  profileAllowsPath,
  readBaselineLock,
  resolveInstallProfile,
  writeBaselineLock,
} = require('./install-profiles');

function run() {
  // Profile normalization: lowercase + safe token.
  assert.strictEqual(normalizeProfileName('Enterprise'), 'enterprise');
  assert.strictEqual(normalizeProfileName(''), '');
  assert.strictEqual(normalizeProfileName('..'), '');
  assert.strictEqual(normalizeProfileName('a'.repeat(64)), 'a'.repeat(64));
  assert.strictEqual(normalizeProfileName('a'.repeat(65)), '');

  const policy = {
    version: 1,
    default_profile: 'standard',
    lock_path: 'config/baseline/baseline.lock.json',
    profiles: {
      standard: { description: 'default', file_filters: { deny: [] } },
      enterprise: { description: 'enterprise', file_filters: { deny: ['^apps/'] } },
    },
  };

  // Profile resolution precedence: arg > lock > default.
  assert.strictEqual(resolveInstallProfile({ policy, profileArg: 'enterprise', targetLock: { profile: 'standard' } }).name, 'enterprise');
  assert.strictEqual(resolveInstallProfile({ policy, profileArg: '', targetLock: { profile: 'enterprise' } }).name, 'enterprise');
  assert.strictEqual(resolveInstallProfile({ policy, profileArg: '', targetLock: { profile: 'missing' } }).name, 'standard');

  // Deny filters.
  const filters = compileProfileFilters(policy.profiles.enterprise);
  assert.strictEqual(profileAllowsPath('apps/frontend/README.md', filters), false);
  assert.strictEqual(profileAllowsPath('docs/README.md', filters), true);

  // Invalid regex rules are ignored (installer must remain resilient).
  const invalidFilters = compileProfileFilters({ file_filters: { deny: ['['] } });
  assert.strictEqual(profileAllowsPath('anything.txt', invalidFilters), true);

  // Lock file read/write.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-lock-'));
  try {
    const lockRelPath = 'config/baseline/baseline.lock.json';
    const writeRes = writeBaselineLock({
      targetRoot: tmp,
      lockRelPath,
      profileName: 'enterprise',
      policyRelPath: 'config/policy/install-profiles.json',
      dryRun: false,
    });
    assert.strictEqual(writeRes.wrote, true);

    const lock = readBaselineLock({ targetRoot: tmp, lockRelPath });
    assert.ok(lock && lock.data, 'expected lock to be readable after write');
    assert.strictEqual(lock.data.profile, 'enterprise');
    assert.strictEqual(lock.data.policy_rel_path, 'config/policy/install-profiles.json');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('[install-profiles:selftest] OK');
}

if (require.main === module) run();

module.exports = { run };

