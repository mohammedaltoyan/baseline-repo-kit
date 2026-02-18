#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseFlagArgs } = require('../utils/cli-args');

function toString(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeTier(raw) {
  const v = toString(raw).toLowerCase();
  if (!v) return '';
  if (v === 'staging' || v === 'production') return v;
  return '';
}

function normalizeSurfaceId(raw) {
  const v = toString(raw).toLowerCase().replace(/_/g, '-');
  if (!v) return '';
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(v)) return '';
  return v;
}

function normalizeSha(raw) {
  const v = toString(raw).toLowerCase();
  if (!v) return '';
  if (!/^[0-9a-f]{7,40}$/.test(v)) return '';
  return v;
}

function normalizeRel(p) {
  return toString(p).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/g, '');
}

function ensureSafeRelPath(rel) {
  const parts = String(rel || '').split('/').filter(Boolean);
  if (parts.some((p) => p === '.' || p === '..')) {
    throw new Error(`refusing unsafe path: ${rel}`);
  }
  return parts.join('/');
}

function computeReceiptRelPath({ prefix, tier, sha, surface }) {
  const pref = ensureSafeRelPath(normalizeRel(prefix));
  if (!pref) throw new Error('prefix is required');

  const t = normalizeTier(tier);
  if (!t) throw new Error(`invalid tier "${toString(tier)}" (expected staging|production)`);

  const s = normalizeSurfaceId(surface);
  if (!s) throw new Error(`invalid surface "${toString(surface)}"`);

  const h = normalizeSha(sha);
  if (!h) throw new Error(`invalid sha "${toString(sha)}"`);

  return `${pref}/${t}/${h}/${s}.json`;
}

function buildReceipt({ tier, sha, surface, runUrl, actor, environmentName, timestampUtc }) {
  const t = normalizeTier(tier);
  const h = normalizeSha(sha);
  const s = normalizeSurfaceId(surface);
  if (!t) throw new Error(`invalid tier "${toString(tier)}"`);
  if (!h) throw new Error(`invalid sha "${toString(sha)}"`);
  if (!s) throw new Error(`invalid surface "${toString(surface)}"`);

  const ts = toString(timestampUtc) || new Date().toISOString();
  return {
    timestamp_utc: ts,
    tier: t,
    surface: s,
    sha: h,
    run_url: toString(runUrl),
    actor: toString(actor),
    environment: toString(environmentName),
  };
}

function runGit(cwd, args) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    ok: res.status === 0,
    code: res.status || 0,
    stdout: String(res.stdout || ''),
    stderr: String(res.stderr || ''),
  };
}

function gitEnsureUser(cwd) {
  runGit(cwd, ['config', 'user.name', 'github-actions[bot]']);
  runGit(cwd, ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveMaxAttempts(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 1) return 6;
  return Math.max(1, Math.floor(parsed));
}

async function writeReceiptToBranch({
  cwd,
  branch,
  relPath,
  receipt,
  maxAttempts,
}) {
  const b = toString(branch);
  if (!b) throw new Error('branch is required');
  const rp = ensureSafeRelPath(normalizeRel(relPath));
  if (!rp) throw new Error('relPath is required');

  const attempts = resolveMaxAttempts(maxAttempts);

  gitEnsureUser(cwd);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    runGit(cwd, ['fetch', 'origin', b]);

    const hasRemote = runGit(cwd, ['show-ref', '--verify', `refs/remotes/origin/${b}`]).ok;
    if (hasRemote) {
      const sw = runGit(cwd, ['switch', '--force-create', b, `origin/${b}`]);
      if (!sw.ok) throw new Error(`git switch ${b} failed: ${sw.stderr || sw.stdout}`);
    } else {
      const sw = runGit(cwd, ['switch', '--orphan', b]);
      if (!sw.ok) throw new Error(`git switch --orphan ${b} failed: ${sw.stderr || sw.stdout}`);
      // Clean working tree (orphan keeps files from previous branch in the index).
      runGit(cwd, ['rm', '-rf', '.']);
    }

    const absPath = path.join(cwd, ...rp.split('/'));
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

    const add = runGit(cwd, ['add', rp]);
    if (!add.ok) throw new Error(`git add failed: ${add.stderr || add.stdout}`);

    const diff = runGit(cwd, ['diff', '--cached', '--quiet']);
    const hasChanges = !diff.ok;
    if (!hasChanges && hasRemote) {
      return { ok: true, mode: 'no-change', attempt };
    }

    const msg = `chore(evidence): deploy receipt ${receipt.tier}/${receipt.surface} ${receipt.sha} [skip ci]`;
    const commit = runGit(cwd, ['commit', '-m', msg]);
    if (!commit.ok) {
      // If there were no changes, commit may fail; treat as success.
      const status = runGit(cwd, ['status', '--porcelain']).stdout.trim();
      if (!status) return { ok: true, mode: 'no-change', attempt };
      throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
    }

    const push = runGit(cwd, ['push', 'origin', b]);
    if (push.ok) return { ok: true, mode: 'pushed', attempt };

    const err = `${push.stderr || push.stdout}`.toLowerCase();
    const retryable = err.includes('non-fast-forward') || err.includes('fetch first') || err.includes('rejected');
    if (!retryable || attempt === attempts) {
      throw new Error(`git push failed: ${push.stderr || push.stdout}`);
    }

    // Backoff (jitter) and retry after refetching.
    await sleep(250 * attempt + Math.floor(Math.random() * 250));
  }

  throw new Error('unreachable');
}

function verifyReceiptsInRef({ cwd, gitRef, paths }) {
  const ref = toString(gitRef);
  if (!ref) throw new Error('gitRef is required');
  const list = Array.isArray(paths) ? paths.map((p) => ensureSafeRelPath(normalizeRel(p))).filter(Boolean) : [];
  if (list.length < 1) throw new Error('paths is required');

  const missing = [];
  for (const rel of list) {
    const res = runGit(cwd, ['cat-file', '-e', `${ref}:${rel}`]);
    if (!res.ok) missing.push(rel);
  }
  return { ok: missing.length === 0, missing };
}

async function verifyReceiptsInBranch({ cwd, branch, paths }) {
  const b = toString(branch);
  if (!b) throw new Error('branch is required');
  const fetch = runGit(cwd, ['fetch', 'origin', b]);
  if (!fetch.ok) throw new Error(`git fetch origin ${b} failed: ${fetch.stderr || fetch.stdout}`);
  return verifyReceiptsInRef({ cwd, gitRef: `origin/${b}`, paths });
}

async function main() {
  const args = parseFlagArgs(process.argv.slice(2));
  const cmd = toString((args._ && args._[0]) || '');

  if (!cmd || args.h || args.help) {
    console.log(
      'Usage:\n' +
      '  node scripts/ops/deploy-receipts.js write --tier <staging|production> --sha <sha> --surface <id> [--branch <name>] [--prefix <path>]\n' +
      '  node scripts/ops/deploy-receipts.js verify --tier <staging|production> --sha <sha> --surfaces <csv> [--branch <name>] [--prefix <path>]\n' +
      '\n' +
      'Env:\n' +
      '  DEPLOY_RECEIPTS_BRANCH (default: ops/evidence)\n' +
      '  DEPLOY_RECEIPTS_PREFIX (default: docs/ops/evidence/deploy)\n'
    );
    process.exit(cmd ? 0 : 1);
  }

  const cwd = process.cwd();
  const branch = toString(args.branch) || toString(process.env.DEPLOY_RECEIPTS_BRANCH) || 'ops/evidence';
  const prefix = toString(args.prefix) || toString(process.env.DEPLOY_RECEIPTS_PREFIX) || 'docs/ops/evidence/deploy';

  if (cmd === 'write') {
    const tier = normalizeTier(args.tier);
    const sha = normalizeSha(args.sha);
    const surface = normalizeSurfaceId(args.surface);
    if (!tier) throw new Error('Missing/invalid --tier');
    if (!sha) throw new Error('Missing/invalid --sha');
    if (!surface) throw new Error('Missing/invalid --surface');

    const relPath = computeReceiptRelPath({ prefix, tier, sha, surface });
    const receipt = buildReceipt({
      tier,
      sha,
      surface,
      runUrl: toString(args['run-url'] || args.runUrl || process.env.GITHUB_RUN_URL),
      actor: toString(args.actor || process.env.GITHUB_ACTOR),
      environmentName: toString(args.environment || process.env.GITHUB_ENVIRONMENT || ''),
      timestampUtc: new Date().toISOString(),
    });

    const result = await writeReceiptToBranch({
      cwd,
      branch,
      relPath,
      receipt,
      maxAttempts: args.attempts || args['max-attempts'] || '',
    });
    console.log(`[deploy-receipts] write ok mode=${result.mode} attempt=${result.attempt} path=${relPath} branch=${branch}`);
    return;
  }

  if (cmd === 'verify') {
    const tier = normalizeTier(args.tier);
    const sha = normalizeSha(args.sha);
    if (!tier) throw new Error('Missing/invalid --tier');
    if (!sha) throw new Error('Missing/invalid --sha');

    const csv = toString(args.surfaces);
    const surfaces = csv.split(',').map((s) => normalizeSurfaceId(s)).filter(Boolean);
    if (surfaces.length < 1) throw new Error('Missing/invalid --surfaces (csv)');

    const receiptPaths = surfaces.map((surface) => computeReceiptRelPath({ prefix, tier, sha, surface }));
    const result = await verifyReceiptsInBranch({ cwd, branch, paths: receiptPaths });
    if (!result.ok) {
      console.error(`[deploy-receipts] missing ${result.missing.length} receipt(s) on ${branch}`);
      for (const p of result.missing) console.error(`[deploy-receipts] missing: ${p}`);
      process.exit(1);
    }
    console.log(`[deploy-receipts] OK receipts present: ${surfaces.join(', ')}`);
    return;
  }

  throw new Error(`Unknown command "${cmd}" (expected write|verify)`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[deploy-receipts] failed: ${err && err.message ? err.message : err}`);
    process.exit(1);
  });
}

module.exports = {
  computeReceiptRelPath,
  buildReceipt,
  verifyReceiptsInRef,
  verifyReceiptsInBranch,
  resolveMaxAttempts,
};
