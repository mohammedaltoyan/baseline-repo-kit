#!/usr/bin/env node
/**
 * auto-pr-open.js
 *
 * Opens a pull request using GitHub Actions' `GITHUB_TOKEN` (PR author: github-actions[bot]).
 *
 * Goals:
 * - Remove self-approval deadlocks (PR author != human code owner).
 * - Stay compliant with baseline PR policy (PR body must include Plan + Step).
 * - Keep it generic: derive base branch from config/policy/branch-policy.json.
 *
 * Inputs (via env; optional unless noted):
 * - GITHUB_TOKEN (optional) - token to call GitHub API
 * - AUTOPR_TOKEN (optional; preferred when present) - dedicated bot PAT
 * - GITHUB_REPOSITORY (required) - owner/repo
 * - GITHUB_API_URL (optional; defaults to https://api.github.com)
 * - GITHUB_REF_NAME (optional; defaults to AUTOPR_HEAD or current ref name)
 *
 * Optional overrides:
 * - AUTOPR_HEAD - head branch name
 * - AUTOPR_BASE - base branch (defaults to integration branch from policy)
 * - AUTOPR_PLAN - explicit plan id (PLAN-YYYYMM-<slug>)
 * - AUTOPR_STEP - explicit step (Sxx)
 * - AUTOPR_TITLE - PR title (defaults to plan title or branch name)
 * - AUTOPR_DRAFT - "1" to open as draft
 *
 * Inference:
 * - Plan: prefer plan file(s) changed vs base branch; choose an in-progress plan when multiple.
 * - Step: prefer plan frontmatter current_step when it is not S00. If S00 and non-plan files changed, fail with guidance.
 */
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { readFrontmatterTopLevel } = require('./plans/frontmatter');

function die(msg) {
  console.error(`[auto-pr] ${msg}`);
  process.exit(1);
}

function info(msg) {
  console.log(`[auto-pr] ${msg}`);
}

function warn(msg) {
  console.warn(`[auto-pr] WARN: ${msg}`);
}

function toString(value) {
  return String(value == null ? '' : value).trim();
}

function toBool(value) {
  const v = toString(value).toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function exec(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (res.error) die(`${cmd} error: ${res.error.message}`);
  const code = typeof res.status === 'number' ? res.status : 1;
  return { code, stdout: toString(res.stdout), stderr: toString(res.stderr) };
}

function git(args) {
  return exec('git', args);
}

function parseRepoSlug(value) {
  const full = toString(value);
  const m = /^([^/]+)\/([^/]+)$/.exec(full);
  return m ? { owner: m[1], repo: m[2] } : { owner: '', repo: '' };
}

function looksLikeActionsPrCreationPermissionError(raw) {
  const msg = toString(raw).toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('github actions is not permitted to create or approve pull requests') ||
    (msg.includes('api 403') && msg.includes('/pulls'))
  );
}

function selectAuthToken(env = process.env) {
  const source = env && typeof env === 'object' ? env : {};
  return toString(source.AUTOPR_TOKEN) || toString(source.GITHUB_TOKEN) || toString(source.GH_TOKEN);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function loadIntegrationBranch() {
  const policyPath = path.join(process.cwd(), 'config', 'policy', 'branch-policy.json');
  const cfg = readJson(policyPath);
  const branch = cfg && typeof cfg === 'object' ? toString(cfg.integration_branch) : '';
  return branch || 'dev';
}

function isPlanFile(relPosix) {
  const rel = toString(relPosix).replace(/\\/g, '/');
  return /^docs\/ops\/plans\/PLAN-\d{6}-[A-Za-z0-9_.-]+\.md$/.test(rel);
}

function listChangedFiles({ baseRef }) {
  const base = toString(baseRef);
  if (!base) return [];

  // Ensure base exists locally.
  const fetch = git(['fetch', '--no-tags', '--depth=1', 'origin', base]);
  if (fetch.code !== 0) {
    warn(`Unable to fetch base branch "${base}". ${fetch.stderr || fetch.stdout}`);
    return [];
  }

  const diff = git(['diff', '--name-only', 'FETCH_HEAD...HEAD']);
  if (diff.code !== 0) return [];

  return diff.stdout
    .split(/\r?\n/g)
    .map((v) => toString(v).replace(/\\/g, '/'))
    .filter(Boolean);
}

function normalizePlanStatus(statusRaw) {
  const v = toString(statusRaw).split('#')[0].trim().toLowerCase();
  if (!v) return '';
  return v;
}

function pickPrimaryPlan({ planFiles }) {
  const files = Array.isArray(planFiles) ? planFiles : [];
  const parsed = [];

  for (const rel of files) {
    const abs = path.join(process.cwd(), ...toString(rel).split('/'));
    if (!fs.existsSync(abs)) continue;
    const body = fs.readFileSync(abs, 'utf8');
    const fm = readFrontmatterTopLevel(body);
    const planId = toString(fm.plan_id) || path.basename(rel, '.md');
    const status = normalizePlanStatus(fm.status);
    const updated = toString(fm.updated);
    const currentStep = toString(fm.current_step).toUpperCase();
    const title = toString(fm.title);
    parsed.push({ rel, abs, planId, status, updated, currentStep, title, body });
  }

  const statusRank = (s) => {
    if (s === 'in_progress') return 0;
    if (s === 'queued') return 1;
    if (s === 'draft') return 2;
    if (s === 'blocked') return 3;
    if (s === 'on_hold') return 4;
    if (s === 'done') return 10;
    return 20;
  };

  parsed.sort((a, b) => {
    const r = statusRank(a.status) - statusRank(b.status);
    if (r) return r;
    const ud = String(b.updated || '').localeCompare(String(a.updated || '')); // newest first
    if (ud) return ud;
    return String(a.planId).localeCompare(String(b.planId));
  });

  return parsed[0] || null;
}

function stepIsPlanOnly(step) {
  return toString(step).toUpperCase() === 'S00';
}

function changedFilesArePlanOnly(files) {
  const list = Array.isArray(files) ? files : [];
  return list.every((p) => toString(p).replace(/\\/g, '/').startsWith('docs/ops/plans/'));
}

function inferStep({ plan, changedFiles }) {
  if (!plan) return '';
  const step = toString(plan.currentStep).toUpperCase();
  if (!step) return '';

  if (stepIsPlanOnly(step) && !changedFilesArePlanOnly(changedFiles)) {
    return '';
  }

  return step;
}

async function ghJson({ token, apiBase, method, path: apiPath, body }) {
  const t = toString(token);
  if (!t) throw new Error('Missing API token (AUTOPR_TOKEN or GITHUB_TOKEN).');
  const base = toString(apiBase) || 'https://api.github.com';
  const url = `${base.replace(/\/$/, '')}${apiPath.startsWith('/') ? '' : '/'}${apiPath}`;

  const res = await fetch(url, {
    method: method || 'GET',
    headers: {
      authorization: `Bearer ${t}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'baseline-kit-auto-pr-open',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} ${method || 'GET'} ${apiPath}: ${text || res.statusText}`);
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function findExistingPr({ token, apiBase, owner, repo, head, base }) {
  const o = toString(owner);
  const r = toString(repo);
  const h = toString(head);
  if (!o || !r || !h) return null;

  const params = new URLSearchParams({
    state: 'open',
    head: `${o}:${h}`,
    ...(toString(base) ? { base: String(base) } : {}),
    per_page: '100',
  });
  const rows = await ghJson({ token, apiBase, method: 'GET', path: `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls?${params}` });
  const list = Array.isArray(rows) ? rows : [];
  return list[0] || null;
}

function buildPrBody({ planId, step, head, base }) {
  const pid = toString(planId);
  const s = toString(step).toUpperCase();
  return [
    `Plan: ${pid}`,
    `Step: ${s}`,
    '',
    '## Summary',
    `- Auto-opened by GitHub Actions for \`${head}\` -> \`${base}\``,
    '- Update this summary and verification as needed.',
    '',
    '## Verification',
    '- [ ] npm test',
    '',
  ].join('\n');
}

async function main() {
  const token = selectAuthToken(process.env);
  const { owner, repo } = parseRepoSlug(process.env.GITHUB_REPOSITORY);
  if (!owner || !repo) die('Missing/invalid GITHUB_REPOSITORY (expected owner/repo).');

  const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';
  const head = toString(process.env.AUTOPR_HEAD) || toString(process.env.GITHUB_REF_NAME);
  if (!head) die('Missing head branch (AUTOPR_HEAD or GITHUB_REF_NAME).');

  const base = toString(process.env.AUTOPR_BASE) || loadIntegrationBranch();
  if (!base) die('Missing base branch (AUTOPR_BASE or branch policy integration_branch).');

  if (head === base) {
    info(`Skip: head branch equals base (${head}).`);
    return;
  }

  const existing = await findExistingPr({ token, apiBase, owner, repo, head, base });
  if (existing && existing.html_url) {
    info(`Skip: PR already exists (${existing.html_url}).`);
    return;
  }

  const changedFiles = listChangedFiles({ baseRef: base });
  const planOverride = toString(process.env.AUTOPR_PLAN);
  const stepOverride = toString(process.env.AUTOPR_STEP).toUpperCase();

  let planId = planOverride;
  let step = stepOverride;
  let title = toString(process.env.AUTOPR_TITLE);

  if (!planId || !step || !title) {
    const planFiles = changedFiles.filter(isPlanFile);
    const primary = pickPrimaryPlan({ planFiles });
    if (primary) {
      if (!planId) planId = primary.planId;
      if (!step) step = inferStep({ plan: primary, changedFiles });
      if (!title) title = primary.title ? `chore: ${primary.title}` : '';
    }
  }

  if (!planId) {
    die(
      'Unable to infer Plan id. Fix:\n' +
      '- Update a plan file under docs/ops/plans/ in this branch, or\n' +
      '- Set AUTOPR_PLAN=PLAN-YYYYMM-<slug> via workflow input/env.'
    );
  }
  if (!step) {
    die(
      'Unable to infer Step. Fix:\n' +
      '- Ensure the plan current_step is not S00 when non-plan files changed, or\n' +
      '- Set AUTOPR_STEP=Sxx via workflow input/env, and ensure the step exists in the plan checklist.'
    );
  }
  if (!title) {
    title = `chore: ${head}`;
  }

  const draft = toBool(process.env.AUTOPR_DRAFT);
  const prBody = buildPrBody({ planId, step, head, base });

  const created = await ghJson({
    token,
    apiBase,
    method: 'POST',
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    body: {
      title,
      head,
      base,
      body: prBody,
      draft,
    },
  });

  const url = created && (created.html_url || created.url);
  info(`PR created: ${url || '<unknown>'}`);
}

if (require.main === module) {
  main().catch((e) => {
    const message = e && e.message ? e.message : String(e);
    if (looksLikeActionsPrCreationPermissionError(message)) {
      const repoSlug = toString(process.env.GITHUB_REPOSITORY);
      const settingsUrl = repoSlug ? `https://github.com/${repoSlug}/settings/actions` : '<repo>/settings/actions';
      die(
        'GitHub blocked PR creation for Actions token.\n' +
        'Fix one of:\n' +
        `- Enable "Allow GitHub Actions to create and approve pull requests" at ${settingsUrl}, or\n` +
        '- Configure repo secret AUTOPR_TOKEN with a bot PAT (workflow uses AUTOPR_TOKEN when present).'
      );
    }
    die(message);
  });
}

module.exports = {
  looksLikeActionsPrCreationPermissionError,
  selectAuthToken,
};
