#!/usr/bin/env node
/**
 * plan-gate.js
 * Runs the repo's verification command(s) and checks off the Tests Gate step in a plan.
 *
 * Baseline behavior (stack-agnostic):
 * - Runs `node scripts/ops/plan-verify.js`
 * - Checks off S99 by default (or a custom `--step Sxx`)
 *
 * Usage:
 *   npm run plans:gate -- --plan PLAN-YYYYMM-<slug> [--step S99]
 *   npm run plans:gate -- PLAN-YYYYMM-<slug> S99
 *   npm run plans:gate -- --plan PLAN-YYYYMM-<slug> --no-rerun
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { isTruthy } = require('../utils/is-truthy');

function die(msg) {
  console.error(`[plan-gate] ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { positionals: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i] || '').trim();
    if (!a) continue;
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const next = argv[i + 1];
      const val = next && !String(next).startsWith('--') ? String(next) : '1';
      out.flags[key] = val;
      if (val !== '1') i++;
      continue;
    }
    out.positionals.push(a);
  }
  return out;
}

function runNode(relPath, label) {
  console.log(`[plan-gate] ${label}`);
  const res = spawnSync(process.execPath, [path.join(...relPath.split('/'))], { stdio: 'inherit' });
  if (res.error) die(`${label} error: ${res.error.message}`);
  if (res.status !== 0) die(`${label} failed (exit ${res.status})`);
}

function checkOffStep(planPath, stepId) {
  const body = fs.readFileSync(planPath, 'utf8');
  const reUnchecked = new RegExp(`^- \\[ \\] ${stepId}\\b.*$`, 'm');
  const reChecked = new RegExp(`^- \\[(x|X)\\] ${stepId}\\b.*$`, 'm');
  if (reChecked.test(body)) return { changed: false, reason: 'already checked' };
  if (!reUnchecked.test(body)) return { changed: false, reason: 'step not found' };
  const next = body.replace(reUnchecked, (s) => s.replace('[ ]', '[x]'));
  fs.writeFileSync(planPath, next, 'utf8');
  return { changed: true, reason: 'checked' };
}

function main() {
  const { flags, positionals } = parseArgs(process.argv.slice(2));

  const planId = String(flags.plan || positionals[0] || '').trim();
  if (!planId) die('Missing plan id. Usage: plans:gate -- --plan PLAN-YYYYMM-<slug>');

  const stepIdRaw = String(flags.step || positionals.find((p) => /^S\d{2}$/i.test(p)) || 'S99').trim();
  const stepId = stepIdRaw.toUpperCase();
  if (!/^S\d{2}$/.test(stepId)) die(`Invalid --step ${stepIdRaw}; expected Sxx`);

  const planPath = path.join(process.cwd(), 'docs', 'ops', 'plans', `${planId}.md`);
  if (!fs.existsSync(planPath)) die(`Plan not found: ${planPath}`);

  const noRerun =
    isTruthy(flags['no-rerun']) ||
    positionals.some((p) => /^(?:no-rerun|no_rerun|evidence)$/i.test(String(p || '').trim()));

  if (!noRerun) {
    runNode('scripts/ops/plan-verify.js', 'running verification');
  } else {
    console.log('[plan-gate] --no-rerun enabled; skipping verification run.');
  }

  const res = checkOffStep(planPath, stepId);
  if (res.reason === 'step not found') {
    die(`Step ${stepId} not found in plan checklist; add it (unchecked) then rerun gate.`);
  }

  console.log(`[plan-gate] ${res.changed ? 'Checked' : 'Already checked'} ${stepId} in ${planId}`);
}

if (require.main === module) {
  main();
}
