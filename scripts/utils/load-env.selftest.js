/* eslint-disable no-console */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadEnv } = require('./load-env');

function write(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, 'utf8');
}

function unsetEnvKeys(keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      delete process.env[key];
    }
  }
}

function withTempRepo(fn) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-kit-envtest-'));
  try {
    return fn(tmpRoot);
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  }
}

function run() {
  const keys = [
    'BASELINE_KIT_TEST_ORDER',
    'BASELINE_KIT_TEST_BASE_ONLY',
    'BASELINE_KIT_TEST_LOCAL_ONLY',
    'BASELINE_KIT_TEST_CLOUD_ONLY',
    'BASELINE_KIT_TEST_ROOT_ONLY',
    'BASELINE_KIT_TEST_EXPLICIT_ONLY',
    'ENV_FILE',
    'ENV_FILE_APPEND',
  ];

  const saved = {};
  for (const k of keys) saved[k] = process.env[k];

  const restore = () => {
    unsetEnvKeys(keys);
    for (const [k, v] of Object.entries(saved)) {
      if (v !== undefined) process.env[k] = v;
    }
  };

  const cwd = process.cwd();
  try {
    withTempRepo((repoRoot) => {
      const envDir = path.join(repoRoot, 'config', 'env');

      // Baseline files
      write(path.join(envDir, '.env'), 'BASELINE_KIT_TEST_ORDER=base\nBASELINE_KIT_TEST_BASE_ONLY=1\n');
      write(path.join(envDir, '.env.local'), 'BASELINE_KIT_TEST_ORDER=local\nBASELINE_KIT_TEST_LOCAL_ONLY=1\n');
      write(path.join(envDir, '.env.cloud'), 'BASELINE_KIT_TEST_ORDER=cloud\nBASELINE_KIT_TEST_CLOUD_ONLY=1\n');
      write(path.join(repoRoot, '.env'), 'BASELINE_KIT_TEST_ORDER=root\nBASELINE_KIT_TEST_ROOT_ONLY=1\n');

      // Case 1: default precedence
      restore();
      process.chdir(repoRoot);
      loadEnv();
      assert.strictEqual(process.env.BASELINE_KIT_TEST_ORDER, 'cloud');
      assert.strictEqual(process.env.BASELINE_KIT_TEST_CLOUD_ONLY, '1');
      assert.strictEqual(process.env.BASELINE_KIT_TEST_LOCAL_ONLY, '1');
      assert.strictEqual(process.env.BASELINE_KIT_TEST_BASE_ONLY, '1');
      assert.strictEqual(process.env.BASELINE_KIT_TEST_ROOT_ONLY, '1');

      // Case 2: explicit ENV_FILE is authoritative by default (no append)
      restore();
      process.chdir(repoRoot);
      write(path.join(envDir, '.env.explicit'), 'BASELINE_KIT_TEST_ORDER=explicit\nBASELINE_KIT_TEST_EXPLICIT_ONLY=1\n');
      process.env.ENV_FILE = 'config/env/.env.explicit';
      loadEnv();
      assert.strictEqual(process.env.BASELINE_KIT_TEST_ORDER, 'explicit');
      assert.strictEqual(process.env.BASELINE_KIT_TEST_EXPLICIT_ONLY, '1');
      assert.strictEqual(process.env.BASELINE_KIT_TEST_CLOUD_ONLY, undefined);

      // Case 3: explicit ENV_FILE with append merges defaults (but never overrides explicit values)
      restore();
      process.chdir(repoRoot);
      process.env.ENV_FILE = 'config/env/.env.explicit';
      process.env.ENV_FILE_APPEND = '1';
      loadEnv();
      assert.strictEqual(process.env.BASELINE_KIT_TEST_ORDER, 'explicit');
      assert.strictEqual(process.env.BASELINE_KIT_TEST_EXPLICIT_ONLY, '1');
      assert.strictEqual(process.env.BASELINE_KIT_TEST_CLOUD_ONLY, '1');
      assert.strictEqual(process.env.BASELINE_KIT_TEST_LOCAL_ONLY, '1');
      assert.strictEqual(process.env.BASELINE_KIT_TEST_BASE_ONLY, '1');
      assert.strictEqual(process.env.BASELINE_KIT_TEST_ROOT_ONLY, '1');
    });

    console.log('[load-env:selftest] OK');
  } finally {
    process.chdir(cwd);
    restore();
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };

