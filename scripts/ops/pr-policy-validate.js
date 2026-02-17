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
const { loadBranchPolicyConfig, validateBranchPolicy } = require('./branch-policy');
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

function toBool(value, fallback = false) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return !!fallback;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(raw)) return false;
  return !!fallback;
}

function parseCsvTokens(raw) {
  return String(raw || '')
    .split(/[,\s]+/g)
    .map((v) => String(v || '').trim())
    .filter(Boolean);
}

function parseAuthorLogins(raw, fallback) {
  const source = String(raw || '').trim() || String(fallback || '').trim();
  const out = [];
  const seen = new Set();
  for (const token of parseCsvTokens(source)) {
    const login = token.replace(/^@/, '').toLowerCase();
    if (!login || seen.has(login)) continue;
    seen.add(login);
    out.push(login);
  }
  return out;
}

function parseHeadPrefixPolicy(raw, fallback) {
  const source = String(raw || '').trim() || String(fallback || '').trim();
  const tokens = parseCsvTokens(source).map((v) => v.toLowerCase());
  const all = tokens.includes('*') || tokens.includes('all');
  const prefixes = [];
  const seen = new Set();
  for (const token of tokens) {
    if (token === '*' || token === 'all') continue;
    if (!token || seen.has(token)) continue;
    seen.add(token);
    prefixes.push(token);
  }
  return { all, prefixes };
}

function headMatchesPolicy(headRef, policy) {
  const head = String(headRef || '').trim().toLowerCase();
  const cfg = policy && typeof policy === 'object' ? policy : { all: false, prefixes: [] };
  if (!head) return false;
  if (cfg.all) return true;
  const prefixes = Array.isArray(cfg.prefixes) ? cfg.prefixes : [];
  if (prefixes.length === 0) return true;
  return prefixes.some((prefix) => head.startsWith(prefix));
}

function isDependencyAutomationPr({ authorLogin, authorType, headRef }) {
  const login = String(authorLogin || '').trim().toLowerCase();
  const type = String(authorType || '').trim().toLowerCase();
  const head = String(headRef || '').trim().toLowerCase();

  const isBot = type === 'bot' || login.endsWith('[bot]') || login.startsWith('app/');
  if (!isBot) return false;

  const looksLikeDependencyBot =
    login.includes('dependabot') ||
    login.includes('renovate') ||
    head.startsWith('dependabot/') ||
    head.startsWith('renovate/');

  return looksLikeDependencyBot;
}

function shouldBypassPlanStep({ baseRef, integrationBranch, authorLogin, authorType, headRef }) {
  const base = String(baseRef || '').trim();
  const integration = String(integrationBranch || '').trim();
  if (!base || !integration || base !== integration) return false;
  return isDependencyAutomationPr({ authorLogin, authorType, headRef });
}

function isReleasePromotionPr({ baseRef, headRef, integrationBranch, productionBranch }) {
  const base = String(baseRef || '').trim();
  const head = String(headRef || '').trim();
  const integration = String(integrationBranch || '').trim();
  const production = String(productionBranch || '').trim();
  if (!base || !head || !integration || !production) return false;
  return base === production && head === integration;
}

function shouldBypassPlanStepForReleasePromotion({ baseRef, headRef, integrationBranch, productionBranch }) {
  // Release promotion PRs are mechanical (integration -> production). By default, these do not require a plan/step,
  // since every underlying change already carried its own plan.
  if (!toBool(process.env.RELEASE_PR_BYPASS_PLAN_STEP, false)) return false;
  return isReleasePromotionPr({ baseRef, headRef, integrationBranch, productionBranch });
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
      baseRef: String(evt.pull_request.base && evt.pull_request.base.ref || ''),
      headRef: String(evt.pull_request.head && evt.pull_request.head.ref || ''),
      authorLogin: String(evt.pull_request.user && evt.pull_request.user.login || ''),
      authorType: String(evt.pull_request.user && evt.pull_request.user.type || ''),
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
      contexts.push({
        prNumber,
        prBody: String(pr && pr.body || ''),
        baseRef: String(pr && pr.base && pr.base.ref || ''),
        headRef: String(pr && pr.head && pr.head.ref || ''),
        authorLogin: String(pr && pr.user && pr.user.login || ''),
        authorType: String(pr && pr.user && pr.user.type || ''),
        changedFiles: null,
      });
    }
    return contexts;
  }

  if (fromEnv) {
    return [{
      prNumber: 0,
      prBody: fromEnv,
      baseRef: '',
      headRef: '',
      authorLogin: '',
      authorType: '',
      changedFiles: null,
    }];
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
  const branchPolicy = loadBranchPolicyConfig(process.cwd());
  const botAuthorEnforce = toBool(process.env.AUTOPR_ENFORCE_BOT_AUTHOR, true);
  const allowedAuthorLogins = parseAuthorLogins(
    process.env.AUTOPR_ALLOWED_AUTHORS,
    'github-actions[bot],app/github-actions'
  );
  const headPrefixPolicy = parseHeadPrefixPolicy(
    process.env.AUTOPR_ENFORCE_HEAD_PREFIXES,
    'codex/'
  );

  const contexts = await resolvePrContexts();
  for (const ctx of contexts) {
    // eslint-disable-next-line no-await-in-loop
    const hydrated = await hydrateChangedFiles(ctx);
    const prNumber = hydrated.prNumber ? `#${hydrated.prNumber}` : '<local>';
    const body = String(hydrated.prBody || '');

    const planIds = extractPlanIds(body);
    const step = extractStep(body);
    const bypassPlan = shouldBypassPlanStep({
      baseRef: hydrated.baseRef,
      integrationBranch: branchPolicy.config.integration_branch,
      authorLogin: hydrated.authorLogin,
      authorType: hydrated.authorType,
      headRef: hydrated.headRef,
    });
    const bypassRelease = shouldBypassPlanStepForReleasePromotion({
      baseRef: hydrated.baseRef,
      headRef: hydrated.headRef,
      integrationBranch: branchPolicy.config.integration_branch,
      productionBranch: branchPolicy.config.production_branch,
    });
    if ((planIds.length === 0 || !step) && (bypassPlan || bypassRelease)) {
      validateBranchPolicy({
        baseRef: hydrated.baseRef,
        headRef: hydrated.headRef,
        prBody: body,
        config: branchPolicy.config,
      });
      const reason = bypassPlan ? 'dependency automation' : 'release promotion';
      console.log(`[pr-policy-validate] OK PR ${prNumber} (${reason}: Plan/Step not required)`);
      continue;
    }

    if (botAuthorEnforce && headMatchesPolicy(hydrated.headRef, headPrefixPolicy)) {
      if (allowedAuthorLogins.length === 0) {
        die('AUTOPR_ALLOWED_AUTHORS resolved empty while AUTOPR_ENFORCE_BOT_AUTHOR=1.');
      }
      const authorLogin = String(hydrated.authorLogin || '').trim().toLowerCase();
      if (!authorLogin) {
        die(`PR ${prNumber}: missing author login; cannot enforce bot-author policy.`);
      }
      if (!allowedAuthorLogins.includes(authorLogin)) {
        die(
          `PR ${prNumber}: head=${hydrated.headRef} requires bot-authored PR. ` +
          `Allowed author(s): ${allowedAuthorLogins.join(', ')}; found: ${authorLogin}. ` +
          'Close this PR and push the branch without opening a manual PR so Auto-PR can create it.'
        );
      }
    }

    if (planIds.length === 0) die(`PR ${prNumber}: Missing \`Plan: PLAN-YYYYMM-<slug>\` in PR body.`);
    if (!step) die(`PR ${prNumber}: Missing \`Step: Sxx\` in PR body.`);

    const planById = loadPlanById({ planIds });
    validatePrPolicy({
      prBody: body,
      planById,
      changedFiles: hydrated.changedFiles,
      enforcePlanOnlyStep: !args.skipPlanOnlyCheck,
    });

    validateBranchPolicy({
      baseRef: hydrated.baseRef,
      headRef: hydrated.headRef,
      prBody: body,
      config: branchPolicy.config,
    });

    console.log(`[pr-policy-validate] OK PR ${prNumber} (${planIds[0]} ${step})`);
  }
}

if (require.main === module) {
  main().catch((e) => die(e && e.message ? e.message : String(e)));
}

module.exports = {
  headMatchesPolicy,
  isDependencyAutomationPr,
  parseAuthorLogins,
  parseHeadPrefixPolicy,
  shouldBypassPlanStep,
  toBool,
};
