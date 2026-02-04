#!/usr/bin/env node
/**
 * pr-ready.js
 * Local helper to run the baseline gates before opening a PR.
 *
 * Usage:
 *   npm run pr:ready -- --plan PLAN-YYYYMM-<slug> [--require-clean]
 *   npm run pr:ready -- PLAN-YYYYMM-<slug> require-clean
 *
 * Notes:
 * - This repo is designed to be copy/paste friendly; in non-git folders we
 *   skip the clean-worktree check instead of failing.
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { isTruthy } = require('../utils/is-truthy');
const { readJsonSafe } = require('../utils/json');

function die(msg) {
  console.error(`[pr-ready] ${msg}`);
  process.exit(1);
}

function parseArgs(argvIn) {
  const argv = Array.isArray(argvIn) ? argvIn : process.argv.slice(2);
  const out = { positionals: [], plan: '', requireClean: false, requireUpToDate: false, fetch: false };
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i] || '').trim();
    if (!a) continue;
    if (a === '--plan') out.plan = String(argv[++i] || '').trim();
    else if (a.startsWith('--plan=')) out.plan = a.split('=').slice(1).join('=').trim();
    else if (a === '--require-clean') out.requireClean = true;
    else if (a === '--require-up-to-date') out.requireUpToDate = true;
    else if (a === '--fetch') out.fetch = true;
    else if (a.startsWith('--')) {
      // ignore unknown flags to stay resilient across shells/npm versions
    } else {
      out.positionals.push(a);
    }
  }

  // Positional fallback for npm@11+ flag forwarding oddities:
  //   npm run pr:ready -- PLAN-... require-clean
  if (!out.plan && out.positionals.length) {
    out.plan = String(out.positionals[0] || '').trim();
  }
  if (!out.requireClean) {
    out.requireClean = out.positionals.some((p) => /^(?:require-clean|require_clean)$/i.test(String(p || '').trim()));
  }
  if (!out.requireUpToDate) {
    out.requireUpToDate = out.positionals.some((p) => /^(?:require-up-to-date|require_up_to_date|up-to-date)$/i.test(String(p || '').trim()));
  }
  if (!out.fetch) {
    out.fetch = out.positionals.some((p) => /^(?:fetch|fetch-origin|fetch_origin)$/i.test(String(p || '').trim()));
  }
  return out;
}

function resolvePlanFromFocus() {
  const focusPath = path.join(process.cwd(), 'docs', 'ops', 'plans', 'FOCUS.json');
  const focus = readJsonSafe(focusPath);
  const owners = Array.isArray(focus && focus.owners) ? focus.owners : [];
  if (owners.length === 1) return String(owners[0].plan_id || '').trim();
  return '';
}

function gitStatusPorcelain() {
  const res = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
  if (res.status !== 0) return null;
  return String(res.stdout || '').trim();
}

function git(args, opts = {}) {
  const res = spawnSync('git', args, { encoding: 'utf8', ...opts });
  if (res.error) return { status: 1, stdout: '', stderr: res.error.message };
  return { status: typeof res.status === 'number' ? res.status : 1, stdout: String(res.stdout || ''), stderr: String(res.stderr || '') };
}

function isGitWorkTree() {
  return git(['rev-parse', '--is-inside-work-tree']).status === 0;
}

function refExists(ref) {
  return git(['rev-parse', '--verify', '--quiet', String(ref || '').trim()]).status === 0;
}

function defaultRemoteHeadRef() {
  // Prefer origin/HEAD -> origin/<default>
  const r = git(['symbolic-ref', '-q', 'refs/remotes/origin/HEAD']);
  if (r.status === 0) {
    const full = String(r.stdout || '').trim(); // refs/remotes/origin/main
    const m = full.match(/^refs\/remotes\/(origin\/.+)$/);
    if (m) return m[1];
  }
  if (refExists('origin/main')) return 'origin/main';
  if (refExists('origin/master')) return 'origin/master';
  return '';
}

function fetchOrigin() {
  const res = spawnSync('git', ['fetch', 'origin', '--prune'], { stdio: 'inherit' });
  return typeof res.status === 'number' ? res.status : 1;
}

function isUpToDateWith(baseRef) {
  const ref = String(baseRef || '').trim();
  if (!ref) return null;
  const res = spawnSync('git', ['merge-base', '--is-ancestor', ref, 'HEAD'], { stdio: 'ignore' });
  if (typeof res.status !== 'number') return false;
  return res.status === 0;
}

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function run(cmd, args, label) {
  console.log(`[pr-ready] ${label}`);
  const needsShell = process.platform === 'win32' && (cmd === 'npm' || /\.cmd$/i.test(cmd));
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: needsShell });
  if (res.error) die(`${label} error: ${res.error.message}`);
  if (res.status !== 0) die(`${label} failed (exit ${res.status})`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const planId = String(args.plan || '').trim() || resolvePlanFromFocus();
  if (!planId) {
    die('Unable to resolve plan id. Pass --plan PLAN-YYYYMM-<slug> or set a single focus entry in docs/ops/plans/FOCUS.json.');
  }

  const dirty = gitStatusPorcelain();
  if (dirty) {
    const msg = 'Working tree has uncommitted changes.';
    if (isTruthy(args.requireClean)) die(msg);
    console.warn(`[pr-ready] Warning: ${msg}`);
  } else if (dirty === null && isTruthy(args.requireClean)) {
    console.warn('[pr-ready] Warning: not a git repo; skipping --require-clean enforcement.');
  }

  if (isTruthy(args.requireUpToDate)) {
    if (!isGitWorkTree()) {
      console.warn('[pr-ready] Warning: not a git repo; skipping --require-up-to-date enforcement.');
    } else {
      if (isTruthy(args.fetch)) {
        console.log('[pr-ready] Fetching origin');
        const code = fetchOrigin();
        if (code !== 0) die(`git fetch origin failed (exit ${code})`);
      }
      const base = defaultRemoteHeadRef();
      if (!base) {
        console.warn('[pr-ready] Warning: unable to detect origin/<default-branch>; skipping up-to-date check.');
      } else {
        const ok = isUpToDateWith(base);
        if (!ok) {
          die(`Branch is not up to date with ${base}. Run: git fetch origin && git merge ${base}`);
        }
      }
    }
  }

  run(npmCmd(), ['test'], 'baseline gates (npm test)');
  console.log(`[pr-ready] OK (${planId})`);
}

if (require.main === module) {
  main();
}
