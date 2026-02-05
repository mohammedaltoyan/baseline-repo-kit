#!/usr/bin/env node
/**
 * pr-policy-validate.js
 *
 * Enforces PR policy:
 * - PR body includes Plan + Step
 * - Plan file exists
 * - Step exists in the plan checklist
 * - Step S00 is plan-only (only docs/ops/plans/** changes)
 *
 * Supports GitHub Actions events: pull_request + merge_group.
 *
 * Usage:
 *   node scripts/ops/pr-policy-validate.js [--skip-plan-only-check]
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { validatePrPolicy } = require('./pr-policy');
const { extractPlanIds, extractStep } = require('./plans/pr-meta');

function die(msg) {
  console.error(`[pr-policy-validate] ${msg}`);
  process.exit(1);
}

function parseArgs() {
  const out = { skipPlanOnlyCheck: false };
  const argv = process.argv.slice(2);
  for (const a of argv) {
    const v = String(a || '').trim();
    if (v === '--skip-plan-only-check' || v === '--skip-plan-only') out.skipPlanOnlyCheck = true;
  }
  return out;
}

function readEventJson() {
  const evtPath = process.env.GITHUB_EVENT_PATH;
  if (evtPath && fs.existsSync(evtPath)) {
    try {
      return JSON.parse(fs.readFileSync(evtPath, 'utf8'));
    } catch {
      // ignore
    }
  }
  return null;
}

function parseRepo(full) {
  const v = String(full || '').trim();
  const m = /^([^/]+)\/([^/]+)$/.exec(v);
  return m ? { owner: m[1], repo: m[2] } : { owner: '', repo: '' };
}

function extractPrNumbersFromMergeGroup(evt) {
  const mg = evt && evt.merge_group;
  if (!mg) return [];

  const out = new Set();
  const prs = Array.isArray(mg.pull_requests) ? mg.pull_requests : [];
  for (const pr of prs) {
    const n = parseInt(String(pr && (pr.number || pr.pull_request_number || pr.pr_number) || '').trim(), 10);
    if (n) out.add(n);
  }

  const headRef = String(mg.head_ref || '').trim();
  const re = /pr-(\d+)/gi;
  let m;
  while ((m = re.exec(headRef)) !== null) {
    const n = parseInt(m[1], 10);
    if (n) out.add(n);
  }

  return Array.from(out);
}

async function ghRequestJson({ token, url, accept }) {
  const t = String(token || '').trim();
  if (!t) throw new Error('GITHUB_TOKEN is missing');
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${t}`,
      accept: accept || 'application/vnd.github+json',
      'user-agent': 'baseline-kit-pr-policy-validate',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status} for ${url}: ${text || res.statusText}`);
  }
  return res.json();
}

async function fetchPr({ owner, repo, prNumber, token }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(String(prNumber))}`;
  return ghRequestJson({ token, url });
}

async function fetchPrFiles({ owner, repo, prNumber, token }) {
  const out = [];
  const perPage = 100;
  for (let page = 1; page <= 10; page++) {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(String(prNumber))}/files?per_page=${perPage}&page=${page}`;
    // eslint-disable-next-line no-await-in-loop
    const pageData = await ghRequestJson({ token, url });
    const rows = Array.isArray(pageData) ? pageData : [];
    for (const row of rows) {
      const filename = String(row && row.filename || '').trim().replace(/\\/g, '/');
      if (filename) out.push(filename);
    }
    if (rows.length < perPage) break;
  }
  return out;
}

function findPlanFile({ plansDir, planId }) {
  const active = path.join(plansDir, `${planId}.md`);
  if (fs.existsSync(active)) return active;
  const archived = path.join(plansDir, 'archive', `${planId}.md`);
  if (fs.existsSync(archived)) return archived;
  return '';
}

function loadPlanById({ planIds }) {
  const root = process.cwd();
  const plansDir = path.join(root, 'docs', 'ops', 'plans');
  const out = {};

  for (const planId of planIds) {
    const file = findPlanFile({ plansDir, planId });
    if (!file) die(`Plan file not found in docs/ops/plans/ or docs/ops/plans/archive/: ${planId}`);
    out[planId] = fs.readFileSync(file, 'utf8');
  }
  return out;
}

async function resolvePrContexts() {
  const evt = readEventJson();
  const fromEnv = String(process.env.PR_BODY || '').trim();

  if (evt && evt.pull_request) {
    return [{
      prNumber: parseInt(String(evt.pull_request.number || '').trim(), 10) || 0,
      prBody: String(evt.pull_request.body || ''),
      changedFiles: null,
    }];
  }

  if (evt && evt.merge_group) {
    const prNumbers = extractPrNumbersFromMergeGroup(evt);
    if (prNumbers.length === 0) die('Unable to resolve PR number(s) from merge_group event.');

    const { owner, repo } = parseRepo(process.env.GITHUB_REPOSITORY);
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
    if (!owner || !repo || !token) die('Missing GITHUB_REPOSITORY or GITHUB_TOKEN for merge_group validation.');

    const contexts = [];
    for (const prNumber of prNumbers) {
      // eslint-disable-next-line no-await-in-loop
      const pr = await fetchPr({ owner, repo, prNumber, token });
      contexts.push({ prNumber, prBody: String(pr && pr.body || ''), changedFiles: null });
    }
    return contexts;
  }

  if (fromEnv) {
    return [{ prNumber: 0, prBody: fromEnv, changedFiles: null }];
  }

  die('Missing PR body. Run in GitHub Actions (pull_request/merge_group) or set PR_BODY.');
  return [];
}

async function hydrateChangedFiles(context) {
  if (!context || !context.prNumber) return context;
  const { owner, repo } = parseRepo(process.env.GITHUB_REPOSITORY);
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (!owner || !repo || !token) return context;

  try {
    const files = await fetchPrFiles({ owner, repo, prNumber: context.prNumber, token });
    return { ...context, changedFiles: files };
  } catch (e) {
    return context;
  }
}

async function main() {
  const args = parseArgs();

  const contexts = await resolvePrContexts();
  for (const ctx of contexts) {
    // eslint-disable-next-line no-await-in-loop
    const hydrated = await hydrateChangedFiles(ctx);
    const prNumber = hydrated.prNumber ? `#${hydrated.prNumber}` : '<local>';
    const body = String(hydrated.prBody || '');

    const planIds = extractPlanIds(body);
    const step = extractStep(body);
    if (planIds.length === 0) die(`PR ${prNumber}: Missing \`Plan: PLAN-YYYYMM-<slug>\` in PR body.`);
    if (!step) die(`PR ${prNumber}: Missing \`Step: Sxx\` in PR body.`);

    const planById = loadPlanById({ planIds });
    validatePrPolicy({
      prBody: body,
      planById,
      changedFiles: hydrated.changedFiles,
      enforcePlanOnlyStep: !args.skipPlanOnlyCheck,
    });

    console.log(`[pr-policy-validate] OK PR ${prNumber} (${planIds[0]} ${step})`);
  }
}

main().catch((e) => die(e && e.message ? e.message : String(e)));

