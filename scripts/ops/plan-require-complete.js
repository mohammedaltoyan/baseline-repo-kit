#!/usr/bin/env node
/**
 * plan-require-complete.js
 *
 * Fails unless every referenced plan has ALL checklist items checked.
 * Intended for PR CI. Plan IDs are discovered in priority:
 *   1) --plan PLAN-YYYYMM-<slug>[,PLAN-...]
 *   2) PR body from GITHUB_EVENT_PATH (pull_request event)
 *   3) PR body from env PR_BODY
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { extractPlanIds } = require('./plans/pr-meta');

function die(msg) { console.error(`[plan-require-complete] ${msg}`); process.exit(1); }

function parseArgs() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.replace(/^--/, '');
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1';
      out[k] = v;
    }
  }
  return out;
}

function readEventJson() {
  const evtPath = process.env.GITHUB_EVENT_PATH;
  if (evtPath && fs.existsSync(evtPath)) {
    try {
      return JSON.parse(fs.readFileSync(evtPath, 'utf8'));
    } catch { /* ignore */ }
  }
  return null;
}

function parseRepo(full) {
  const v = String(full || '').trim();
  const m = /^([^/]+)\/([^/]+)$/.exec(v);
  return m ? { owner: m[1], repo: m[2] } : { owner: '', repo: '' };
}

function extractPrNumberFromMergeGroupHeadRef(headRef) {
  const s = String(headRef || '').trim();
  if (!s) return 0;
  const m = s.match(/pr-(\d+)-/i) || s.match(/pr-(\d+)\b/i);
  return m ? (parseInt(m[1], 10) || 0) : 0;
}

async function ghRequestJson({ token, url, accept }) {
  const t = String(token || '').trim();
  if (!t) throw new Error('GITHUB_TOKEN is missing');
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${t}`,
      accept: accept || 'application/vnd.github+json',
      'user-agent': 'baseline-kit-plan-require-complete',
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

async function readEventBody() {
  const evt = readEventJson();
  const prBody = String(process.env.PR_BODY || '');

  const bodyFromEvent = evt && evt.pull_request && evt.pull_request.body;
  if (bodyFromEvent) return String(bodyFromEvent);
  if (prBody) return prBody;

  // Merge Queue compatibility: merge_group events do not include pull_request.body.
  // Resolve the PR body via API by parsing PR number from merge_group.head_ref.
  const mg = evt && evt.merge_group;
  if (!mg) return '';

  const { owner, repo } = parseRepo(process.env.GITHUB_REPOSITORY);
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (!owner || !repo || !token) return '';

  const prNumber = extractPrNumberFromMergeGroupHeadRef(mg && mg.head_ref);
  if (!prNumber) return '';

  const pr = await fetchPr({ owner, repo, prNumber, token });
  return String(pr && pr.body || '');
}

function parseFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== '---') return {};
  const data = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '---') break;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (m) data[m[1].trim()] = m[2].trim();
  }
  return data;
}

function ensureAllChecked(planId, content) {
  if (/- \[ \] /m.test(content)) {
    die(`Plan ${planId} has unchecked checklist items. Check all steps before merge.`);
  }
  const must = ['S98', 'S99'];
  for (const step of must) {
    const re = new RegExp(`^- \\[(?:x|X)\\] ${step}\\b`, 'm');
    if (!re.test(content)) die(`Plan ${planId} is missing checked ${step}.`);
  }
}

function requirePlanLintDone(planId) {
  const script = path.join('scripts', 'ops', 'plan-lint.js');
  const res = spawnSync(process.execPath, [script, '--only', planId], {
    stdio: 'inherit',
    env: process.env,
  });
  const code = typeof res.status === 'number' ? res.status : 1;
  if (code !== 0) {
    die(`Plan ${planId} failed strict plan lint (expected done-plan evidence: objectives + CI evidence).`);
  }
}

function findPlanFile({ plansDir, planId }) {
  const active = path.join(plansDir, `${planId}.md`);
  if (fs.existsSync(active)) return active;
  const archived = path.join(plansDir, 'archive', `${planId}.md`);
  if (fs.existsSync(archived)) return archived;
  return '';
}

async function main() {
  const args = parseArgs();
  const explicit = args.plan || args.plans || '';
  let planIds = [];
  if (explicit) {
    planIds = explicit.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    // eslint-disable-next-line no-await-in-loop
    planIds = extractPlanIds(await readEventBody());
  }
  if (!planIds.length) die('No plan ids found. Provide --plan or include Plan: <id> in the PR body.');

  const root = process.cwd();
  const plansDir = path.join(root, 'docs', 'ops', 'plans');

  for (const planId of planIds) {
    const file = findPlanFile({ plansDir, planId });
    if (!file) {
      die(`Plan file not found in docs/ops/plans/ or docs/ops/plans/archive/: ${planId}`);
    }
    const body = fs.readFileSync(file, 'utf8');
    const fm = parseFrontmatter(body);
    const status = (fm.status || '').split('#')[0].trim();
    if (status !== 'done') {
      die(`Plan ${planId} status is not done (status=${fm.status || ''}). Mark done after completing steps.`);
    }
    ensureAllChecked(planId, body);
    requirePlanLintDone(planId);
    console.log(`[plan-require-complete] OK ${planId}`);
  }
  console.log(`[plan-require-complete] All referenced plans complete: ${planIds.join(', ')}`);
}

main().catch((e) => die(e && e.message ? e.message : String(e)));
