/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { lintWorkflows, normalizeBool } = require('./workflow-security-lint');

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

function run() {
  assert.strictEqual(normalizeBool(true), true);
  assert.strictEqual(normalizeBool(false), false);
  assert.strictEqual(normalizeBool('true'), true);
  assert.strictEqual(normalizeBool('false'), false);
  assert.strictEqual(normalizeBool('maybe'), null);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-security-lint-'));
  const policyFile = path.join(tmpRoot, 'config', 'policy', 'workflow-security.json');
  write(policyFile, `${JSON.stringify({
    version: 1,
    checkout: {
      enforce_explicit_persist_credentials: true,
      default_persist_credentials: false,
      allow_persist_true: [
        { workflow: '.github/workflows/write.yml', step: 'Checkout Write' },
      ],
    },
  }, null, 2)}\n`);

  write(path.join(tmpRoot, '.github', 'workflows', 'read.yml'), `
name: Read
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Read
        uses: actions/checkout@v6
        with:
          persist-credentials: false
`.trimStart());

  write(path.join(tmpRoot, '.github', 'workflows', 'write.yml'), `
name: Write
on:
  workflow_dispatch:
permissions:
  contents: write
jobs:
  write:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Write
        uses: actions/checkout@v6
        with:
          fetch-depth: 0
          persist-credentials: true
`.trimStart());

  const good = lintWorkflows({ root: tmpRoot });
  assert.strictEqual(good.ok, true, `expected lint to pass, got: ${good.errors.join('\n')}`);

  write(path.join(tmpRoot, '.github', 'workflows', 'bad.yml'), `
name: Bad
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  bad:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Missing
        uses: actions/checkout@v6
`.trimStart());
  const missing = lintWorkflows({ root: tmpRoot });
  assert.strictEqual(missing.ok, false, 'missing persist-credentials should fail lint');
  assert.ok(
    missing.errors.some((entry) => entry.includes('Checkout Missing') && entry.includes('persist-credentials')),
    'missing persist-credentials error should include step details'
  );

  write(path.join(tmpRoot, '.github', 'workflows', 'bad.yml'), `
name: Bad
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  bad:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Missing
        uses: actions/checkout@v6
        with:
          persist-credentials: true
`.trimStart());
  const mismatch = lintWorkflows({ root: tmpRoot });
  assert.strictEqual(mismatch.ok, false, 'unexpected persist-credentials=true should fail lint');
  assert.ok(
    mismatch.errors.some((entry) => entry.includes('expected false')),
    'mismatch error should include expected value'
  );

  console.log('[workflow-security-lint:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
