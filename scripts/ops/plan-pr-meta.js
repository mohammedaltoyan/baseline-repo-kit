#!/usr/bin/env node
/**
 * plan-pr-meta.js
 *
 * Parse `Plan: PLAN-YYYYMM-<slug>` and `Step: Sxx` from a GitHub PR body.
 * Intended for GitHub Actions workflows.
 *
 * Usage:
 *   node scripts/ops/plan-pr-meta.js --require-plan --require-step --format github-output
 */
/* eslint-disable no-console */
const fs = require('fs');
const { extractPlanIds, extractStep } = require('./plans/pr-meta');

function die(msg) {
  console.error(`[plan-pr-meta] ${msg}`);
  process.exit(1);
}

function parseArgs() {
  const out = { requirePlan: false, requireStep: false, format: 'json' };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i] || '');
    if (!a) continue;
    if (a === '--require-plan') out.requirePlan = true;
    else if (a === '--require-step') out.requireStep = true;
    else if (a === '--format') out.format = String(argv[++i] || '').trim();
    else if (a.startsWith('--format=')) out.format = a.split('=').slice(1).join('=').trim();
  }
  return out;
}

function readEventBody() {
  const evtPath = process.env.GITHUB_EVENT_PATH;
  if (evtPath && fs.existsSync(evtPath)) {
    try {
      const evt = JSON.parse(fs.readFileSync(evtPath, 'utf8'));
      const prBody = evt?.pull_request?.body;
      if (typeof prBody === 'string') return prBody;
      const issueBody = evt?.issue?.body;
      if (typeof issueBody === 'string') return issueBody;
    } catch {
      // ignore
    }
  }
  if (typeof process.env.PR_BODY === 'string' && process.env.PR_BODY.trim()) return process.env.PR_BODY;
  return '';
}

function writeGithubOutput(kv) {
  const outPath = process.env.GITHUB_OUTPUT;
  if (!outPath) die('GITHUB_OUTPUT not set; use --format json locally.');
  const lines = [];
  for (const [k, v] of Object.entries(kv)) lines.push(`${k}=${String(v == null ? '' : v)}`);
  fs.appendFileSync(outPath, lines.join('\n') + '\n', 'utf8');
}

function main() {
  const { requirePlan, requireStep, format } = parseArgs();
  const body = readEventBody();
  const plans = extractPlanIds(body);
  const step = extractStep(body);

  if (requirePlan && plans.length === 0) die('Missing `Plan: PLAN-YYYYMM-<slug>` in PR body.');
  if (requireStep && !step) die('Missing `Step: Sxx` in PR body.');

  const out = {
    primary_plan_id: plans[0] || '',
    plan_step: step || '',
    plan_ids_csv: plans.join(','),
  };

  const fmt = String(format || '').trim().toLowerCase();
  if (fmt === 'github-output') {
    writeGithubOutput(out);
    return;
  }
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

main();
