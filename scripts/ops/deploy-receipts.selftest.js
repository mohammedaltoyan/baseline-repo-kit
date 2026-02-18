/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  computeReceiptRelPath,
  buildReceipt,
  verifyReceiptsInBranch,
  resolveMaxAttempts,
} = require('./deploy-receipts');

function runCmd(cwd, cmd, args) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${(res.stderr || res.stdout || '').trim()}`);
  }
  return String(res.stdout || '').trim();
}

function writeFile(root, rel, content) {
  const p = path.join(root, ...String(rel).split('/').filter(Boolean));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

async function run() {
  assert.strictEqual(resolveMaxAttempts(undefined), 6);
  assert.strictEqual(resolveMaxAttempts(''), 6);
  assert.strictEqual(resolveMaxAttempts('0'), 6);
  assert.strictEqual(resolveMaxAttempts('-1'), 6);
  assert.strictEqual(resolveMaxAttempts('2.9'), 2);
  assert.strictEqual(resolveMaxAttempts('7'), 7);

  assert.strictEqual(
    computeReceiptRelPath({
      prefix: 'docs/ops/evidence/deploy',
      tier: 'staging',
      sha: 'abcdef123',
      surface: 'application',
    }),
    'docs/ops/evidence/deploy/staging/abcdef123/application.json'
  );

  assert.throws(
    () => computeReceiptRelPath({ prefix: 'x', tier: 'staging', sha: 'notsha', surface: 'application' }),
    /invalid sha/i
  );
  assert.throws(
    () => computeReceiptRelPath({ prefix: '../x', tier: 'staging', sha: 'abcdef123', surface: 'application' }),
    /unsafe path/i
  );

  const receipt = buildReceipt({
    tier: 'production',
    sha: 'ABCDEF123',
    surface: 'api_ingress',
    runUrl: 'https://example.invalid/run',
    actor: 'someone',
    environmentName: 'api-ingress-production',
    timestampUtc: '2026-02-17T00:00:00.000Z',
  });
  assert.deepStrictEqual(receipt.tier, 'production');
  assert.deepStrictEqual(receipt.sha, 'abcdef123');
  assert.deepStrictEqual(receipt.surface, 'api-ingress');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-kit-deploy-receipts-'));
  const remoteBare = path.join(root, 'remote.git');
  const local = path.join(root, 'local');
  fs.mkdirSync(remoteBare, { recursive: true });
  fs.mkdirSync(local, { recursive: true });

  runCmd(remoteBare, 'git', ['init', '--bare']);
  runCmd(local, 'git', ['init']);
  runCmd(local, 'git', ['config', 'user.email', 'test@example.com']);
  runCmd(local, 'git', ['config', 'user.name', 'test']);
  runCmd(local, 'git', ['remote', 'add', 'origin', remoteBare]);

  writeFile(local, 'README.md', 'x\n');
  runCmd(local, 'git', ['add', '-A']);
  runCmd(local, 'git', ['commit', '-m', 'init']);
  runCmd(local, 'git', ['push', '-u', 'origin', 'HEAD:dev']);

  const evidenceBranch = 'ops/evidence';
  runCmd(local, 'git', ['switch', '-c', evidenceBranch]);

  const prefix = 'docs/ops/evidence/deploy';
  const rel = computeReceiptRelPath({ prefix, tier: 'staging', sha: 'abcdef123', surface: 'application' });
  writeFile(local, rel, JSON.stringify({ ok: true }, null, 2) + '\n');
  runCmd(local, 'git', ['add', '-A']);
  runCmd(local, 'git', ['commit', '-m', 'receipt']);
  runCmd(local, 'git', ['push', '-u', 'origin', evidenceBranch]);

  runCmd(local, 'git', ['switch', 'dev']);

  const ok = await verifyReceiptsInBranch({ cwd: local, branch: evidenceBranch, paths: [rel] });
  assert.strictEqual(ok.ok, true);

  const missing = await verifyReceiptsInBranch({
    cwd: local,
    branch: evidenceBranch,
    paths: [rel, computeReceiptRelPath({ prefix, tier: 'staging', sha: 'abcdef123', surface: 'docs' })],
  });
  assert.strictEqual(missing.ok, false);
  assert.strictEqual(missing.missing.length, 1);

  console.log('[deploy-receipts:selftest] OK');
}

run().catch((err) => {
  console.error('[deploy-receipts:selftest] failed:', err && err.message ? err.message : err);
  process.exit(1);
});
