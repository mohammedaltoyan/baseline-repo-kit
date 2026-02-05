#!/usr/bin/env node
/**
 * baseline-bootstrap.js
 *
 * One-button bootstrap for new projects:
 * - Installs/updates this baseline into a target repo (non-destructive).
 * - Initializes git + branches from SSOT policy.
 * - Optionally provisions/configures GitHub (repo, repo settings, rulesets/branch protection, repo variables).
 *   - Merge Queue is configured via rulesets when supported; otherwise bootstrap prints manual steps.
 * - Optionally scaffolds local env files from templates.
 *
 * Usage:
 *   npm run baseline:bootstrap -- --to <path> [--mode init|overlay] [--overwrite] [--dry-run] [--github]
 */
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');

const { parseFlagArgs } = require('../utils/cli-args');
const { isTruthy } = require('../utils/is-truthy');
const { readJsonSafe, writeJson } = require('../utils/json');
const { run, runCapture } = require('../utils/exec');
const { loadBranchPolicyConfig } = require('../ops/branch-policy');

let ACTIVE_RUN_SUMMARY = null;

function die(msg) {
  console.error(`[baseline-bootstrap] ${msg}`);
  process.exit(1);
}

function recordRunWarning(message) {
  if (!ACTIVE_RUN_SUMMARY) return;
  const msg = toString(message);
  if (!msg) return;

  const stack = Array.isArray(ACTIVE_RUN_SUMMARY.stepStack) ? ACTIVE_RUN_SUMMARY.stepStack : [];
  const step = stack.length ? stack[stack.length - 1] : null;
  const entry = { message: msg, step: step ? step.name : '' };

  ACTIVE_RUN_SUMMARY.warnings.push(entry);
  if (step && Array.isArray(step.warnings)) step.warnings.push(msg);
}

function warn(msg) {
  const m = toString(msg);
  console.warn(`[baseline-bootstrap] WARN: ${m}`);
  recordRunWarning(m);
}

function info(msg) {
  console.log(`[baseline-bootstrap] ${msg}`);
}

function toString(value) {
  return String(value == null ? '' : value).trim();
}

function createRunSummary({ dryRun, verbose }) {
  return {
    startedAt: new Date().toISOString(),
    dryRun: !!dryRun,
    verbose: !!verbose,
    steps: [],
    warnings: [],
    stepStack: [],
  };
}

function summarySkipStep(summary, name, reason) {
  if (!summary) return;
  summary.steps.push({
    name: toString(name) || 'step',
    status: 'SKIP',
    note: toString(reason),
    durationMs: 0,
    warnings: [],
  });
}

async function summaryStep(summary, name, fn) {
  if (!summary) return fn(null);

  const step = {
    name: toString(name) || 'step',
    status: 'OK',
    note: '',
    startedAt: Date.now(),
    durationMs: 0,
    warnings: [],
  };

  summary.steps.push(step);
  summary.stepStack.push(step);

  try {
    return await fn(step);
  } catch (e) {
    step.status = 'FAIL';
    step.note = toString(e && e.message ? e.message : e);
    throw e;
  } finally {
    step.durationMs = Date.now() - step.startedAt;
    summary.stepStack.pop();

    if (step.status === 'OK' && step.warnings.length > 0) step.status = 'WARN';
  }
}

function uniqueWarnings(warnings) {
  const list = Array.isArray(warnings) ? warnings : [];
  const out = [];
  const seen = new Set();
  for (const w of list) {
    const step = toString(w && w.step);
    const msg = toString(w && w.message);
    if (!msg) continue;
    const key = `${step}::${msg}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ step, message: msg });
  }
  return out;
}

function printRunSummary(summary) {
  if (!summary) return;
  const verbose = !!summary.verbose;
  const steps = Array.isArray(summary.steps) ? summary.steps : [];
  const warns = uniqueWarnings(summary.warnings);

  info('Summary:');
  for (const s of steps) {
    const name = toString(s && s.name) || 'step';
    const status = toString(s && s.status) || 'OK';
    const note = toString(s && s.note);
    const dur = Number(s && s.durationMs);
    const durText = verbose && Number.isFinite(dur) && dur > 0 ? ` (${dur}ms)` : '';
    const noteText = note ? ` - ${note}` : '';
    info(`- ${name}: ${status}${durText}${noteText}`);
  }

  if (warns.length) {
    const limit = 25;
    info(`Warnings (${warns.length}):`);
    for (const w of warns.slice(0, limit)) {
      const prefix = w.step ? `${w.step}: ` : '';
      info(`- ${prefix}${w.message}`);
    }
    if (warns.length > limit) info(`- … truncated (+${warns.length - limit} more)`);
  }
}

function normalizeMode(raw) {
  const v = toString(raw).toLowerCase();
  if (!v) return '';
  if (v === 'init' || v === 'overlay') return v;
  return '';
}

function normalizeVisibility(raw) {
  const v = toString(raw).toLowerCase();
  if (!v) return '';
  if (v === 'private' || v === 'public') return v;
  return '';
}

function stripQuotes(value) {
  const v = toString(value);
  if (!v) return '';
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

function ensureDir(dirPath, dryRun) {
  if (dryRun) return;
  fs.mkdirSync(dirPath, { recursive: true });
}

function isDirectory(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function isEmptyDir(dirPath) {
  if (!isDirectory(dirPath)) return true;
  return fs.readdirSync(dirPath, { withFileTypes: true }).length === 0;
}

function defaultBootstrapPolicy() {
  return {
    version: 1,
    github: {
      host: 'github.com',
      default_visibility: 'private',
      set_default_branch_to_integration: true,
      enable_backport_default: true,
      enable_security_default: false,
      enable_deploy_default: false,
      recommend_merge_queue_integration: true,
      recommend_merge_queue_production: false,
      required_check_workflows: [
        '.github/workflows/ci.yml',
        '.github/workflows/pr-policy.yml',
        '.github/workflows/release-policy-main.yml',
      ],
      rulesets: {
        integration: { name: 'baseline: integration', enforcement: 'active' },
        production: { name: 'baseline: production', enforcement: 'active' },
      },
      rules: {
        pull_request: {
          allowed_merge_methods: ['squash'],
          dismiss_stale_reviews_on_push: true,
          require_code_owner_review: true,
          require_last_push_approval: false,
          required_approving_review_count: 1,
          required_review_thread_resolution: true,
        },
        pull_request_overrides: {
          production: {
            allowed_merge_methods: ['merge'],
          },
        },
        merge_queue: {
          parameters: {
            check_response_timeout_minutes: 60,
            grouping_strategy: 'HEADGREEN',
            max_entries_to_build: 5,
            max_entries_to_merge: 5,
            merge_method: 'SQUASH',
            min_entries_to_merge: 1,
            min_entries_to_merge_wait_minutes: 5,
          },
        },
        required_status_checks: {
          do_not_enforce_on_create: true,
          strict_required_status_checks_policy: true,
        },
      },
      repo_settings: {
        delete_branch_on_merge: true,
      },
      repo_variables: {
        MAIN_REQUIRED_APPROVER_LOGINS: '$repo_owner_user',
        MAIN_APPROVER_ALLOW_AUTHOR_FALLBACK: '1',
        PRODUCTION_PROMOTION_REQUIRED: 'enabled',
        STAGING_DEPLOY_GUARD: 'enabled',
        PRODUCTION_DEPLOY_GUARD: 'disabled',
        DOCS_PUBLISH_GUARD: 'disabled',
        API_INGRESS_DEPLOY_GUARD: 'disabled',
      },
      labels: {
        enabled: true,
        update_existing: false,
        policy_path: 'config/policy/github-labels.json',
      },
      security: {
        enabled: true,
        enable_vulnerability_alerts: true,
        enable_automated_security_fixes: true,
        security_and_analysis: {
          secret_scanning: 'enabled',
          secret_scanning_push_protection: 'enabled',
        },
      },
      environments: {
        enabled: true,
        defaults: [
          { name: 'staging', branches: ['$integration'], wait_timer: 0, can_admins_bypass: true },
          {
            name: 'production',
            branches: ['$production'],
            wait_timer: 0,
            prevent_self_review: false,
            can_admins_bypass: true,
            required_reviewers: ['$repo_owner_user'],
          },
        ],
      },
    },
  };
}

function loadBootstrapPolicy(sourceRoot) {
  const cfgPath = path.join(sourceRoot, 'config', 'policy', 'bootstrap-policy.json');
  const raw = readJsonSafe(cfgPath);
  const d = defaultBootstrapPolicy();
  if (!raw || typeof raw !== 'object') return { path: cfgPath, loaded: false, config: d };
  const cfg = { ...d, ...(raw || {}) };
  cfg.github = { ...d.github, ...(raw.github || {}) };
  cfg.github.rulesets = { ...d.github.rulesets, ...(cfg.github.rulesets || {}) };
  cfg.github.rules = { ...d.github.rules, ...(cfg.github.rules || {}) };
  cfg.github.rules.pull_request = { ...d.github.rules.pull_request, ...(cfg.github.rules.pull_request || {}) };
  cfg.github.rules.required_status_checks = { ...d.github.rules.required_status_checks, ...(cfg.github.rules.required_status_checks || {}) };
  cfg.github.rules.merge_queue = { ...d.github.rules.merge_queue, ...(cfg.github.rules.merge_queue || {}) };
  cfg.github.rules.merge_queue.parameters = {
    ...d.github.rules.merge_queue.parameters,
    ...((cfg.github.rules.merge_queue && cfg.github.rules.merge_queue.parameters) || {}),
  };
  cfg.github.labels = { ...d.github.labels, ...(cfg.github.labels || {}) };
  cfg.github.security = { ...d.github.security, ...(cfg.github.security || {}) };
  cfg.github.security.security_and_analysis = {
    ...d.github.security.security_and_analysis,
    ...((cfg.github.security && cfg.github.security.security_and_analysis) || {}),
  };
  cfg.github.environments = { ...d.github.environments, ...(cfg.github.environments || {}) };
  cfg.github.repo_variables = { ...d.github.repo_variables, ...(cfg.github.repo_variables || {}) };
  return { path: cfgPath, loaded: true, config: cfg };
}

function parseArgs(argv) {
  const args = parseFlagArgs(argv);
  const positionals = Array.isArray(args._) ? args._.map((v) => toString(v)).filter(Boolean) : [];

  const out = {
    to: toString(args.to || args.t || positionals[0] || ''),
    mode: normalizeMode(args.mode || ''),
    overwrite: isTruthy(args.overwrite),
    dryRun: isTruthy(args['dry-run'] || args.dryRun),
    verbose: isTruthy(args.verbose),
    github: isTruthy(args.github),
    adopt: isTruthy(args.adopt),
    reviewers: toString(args.reviewers || args.reviewer || ''),
    autoMerge: isTruthy(args['auto-merge'] || args.autoMerge),
    requireClean: isTruthy(args['require-clean'] || args.requireClean),
    host: toString(args.host || ''),
    owner: toString(args.owner || ''),
    repo: toString(args.repo || ''),
    visibility: normalizeVisibility(args.visibility || ''),
    yes: isTruthy(args.yes || args.y),
    nonInteractive: isTruthy(args['non-interactive'] || args.nonInteractive),
    skipEnv: isTruthy(args['skip-env'] || args.skipEnv),
    skipTests: isTruthy(args['skip-tests'] || args.skipTests || args.noTests),
    mergeQueueProduction: isTruthy(args['merge-queue-production'] || args.mergeQueueProduction),
    mainApprovers: toString(args['main-approvers'] || args.mainApprovers || ''),
    enableBackport: args.enableBackport === undefined ? null : isTruthy(args.enableBackport),
    enableSecurity: args.enableSecurity === undefined ? null : isTruthy(args.enableSecurity),
    enableDeploy: args.enableDeploy === undefined ? null : isTruthy(args.enableDeploy),
    hardeningLabels: args['hardening-labels'] === undefined ? null : isTruthy(args['hardening-labels']),
    hardeningSecurity: args['hardening-security'] === undefined ? null : isTruthy(args['hardening-security']),
    hardeningEnvironments: args['hardening-environments'] === undefined ? null : isTruthy(args['hardening-environments']),
    help: isTruthy(args.help || args.h),
  };

  return out;
}

async function promptText({ rl, label, defaultValue, nonInteractive, yes }) {
  const dv = toString(defaultValue);
  if (nonInteractive || yes) return dv;
  const prompt = dv ? `${label} [${dv}]: ` : `${label}: `;
  const ans = toString(await rl.question(prompt));
  return ans || dv;
}

async function ensureGitAvailable() {
  const res = await runCapture('git', ['--version']).catch(() => null);
  if (!res || res.code !== 0) die('git is required but was not found on PATH.');
}

function patchBranchPolicyFile({ repoRoot, integration, production, dryRun }) {
  const root = path.resolve(String(repoRoot || process.cwd()));
  const cfgPath = path.join(root, 'config', 'policy', 'branch-policy.json');
  const raw = readJsonSafe(cfgPath);
  if (!raw || typeof raw !== 'object') return { path: cfgPath, changed: false };

  const next = { ...raw };
  let changed = false;
  const i = toString(integration);
  const p = toString(production);

  if (i && toString(next.integration_branch) !== i) {
    next.integration_branch = i;
    changed = true;
  }
  if (p && toString(next.production_branch) !== p) {
    next.production_branch = p;
    changed = true;
  }

  if (!changed) return { path: cfgPath, changed: false };
  if (dryRun) {
    info(`[dry-run] patch branch policy: integration_branch=${i || '<unchanged>'}, production_branch=${p || '<unchanged>'}`);
    return { path: cfgPath, changed: true };
  }
  writeJson(cfgPath, next);
  return { path: cfgPath, changed: true };
}

function parseRemoteRepoSlug(remoteUrl) {
  const raw = toString(remoteUrl);
  if (!raw) return null;

  // SCP-like: git@host:owner/repo(.git)
  const scp = /^(?:[^@]+@)?([^:\/]+):([^/]+)\/(.+?)(?:\.git)?$/.exec(raw);
  if (scp) return { host: scp[1], owner: scp[2], repo: scp[3].replace(/\.git$/i, '') };

  try {
    const u = new URL(raw);
    const host = toString(u.host);
    const parts = String(u.pathname || '').split('/').filter(Boolean);
    if (parts.length >= 2) return { host, owner: parts[0], repo: parts[1].replace(/\.git$/i, '') };
  } catch {
    // ignore
  }
  return null;
}

function parseWorkflowChecks(workflowFilePath) {
  const content = fs.readFileSync(workflowFilePath, 'utf8');
  const lines = content.split(/\r?\n/);

  const jobs = [];
  let inJobs = false;
  let currentJobId = '';
  let currentJobName = '';

  for (const line of lines) {
    if (!inJobs) {
      if (/^jobs:\s*$/.test(line)) inJobs = true;
      continue;
    }

    const jobMatch = /^\s{2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobMatch) {
      if (currentJobId) jobs.push({ id: currentJobId, name: currentJobName });
      currentJobId = jobMatch[1];
      currentJobName = '';
      continue;
    }

    if (currentJobId) {
      const nameMatch = /^\s{4}name:\s*(.+?)\s*$/.exec(line);
      if (nameMatch) currentJobName = stripQuotes(nameMatch[1]);
    }
  }
  if (currentJobId) jobs.push({ id: currentJobId, name: currentJobName });

  // GitHub Rulesets required status checks match the check-run name (job `name:` when set; otherwise job id),
  // not the UI label combining `<workflow name> / <job name>`.
  return jobs
    .map((j) => toString(j.name) || j.id)
    .filter(Boolean);
}

function deriveRequiredCheckContexts({ repoRoot, workflowPaths }) {
  const contexts = [];
  const seen = new Set();
  for (const relPath of Array.isArray(workflowPaths) ? workflowPaths : []) {
    const abs = path.join(repoRoot, ...toString(relPath).replace(/\\/g, '/').split('/'));
    if (!fs.existsSync(abs)) continue;
    for (const ctx of parseWorkflowChecks(abs)) {
      const v = toString(ctx);
      if (!v || seen.has(v)) continue;
      seen.add(v);
      contexts.push(v);
    }
  }
  return contexts;
}

function buildRulesetBody({ name, branch, enforcement, requiredContexts, includeMergeQueue, policy, scope }) {
  const prBase = (policy && policy.github && policy.github.rules && policy.github.rules.pull_request) || {};
  const prOverrides = (policy && policy.github && policy.github.rules && policy.github.rules.pull_request_overrides) || {};
  const scoped = scope && prOverrides && typeof prOverrides === 'object' ? prOverrides[scope] : null;
  const prParams = {
    ...prBase,
    ...(scoped && typeof scoped === 'object' ? scoped : {}),
  };
  const statusParams = policy.github.rules.required_status_checks || {};
  const mqParams = (policy.github.rules.merge_queue && policy.github.rules.merge_queue.parameters) || {};

  const rules = [
    { type: 'pull_request', parameters: prParams },
    {
      type: 'required_status_checks',
      parameters: {
        ...statusParams,
        required_status_checks: (requiredContexts || []).map((c) => ({ context: c })),
      },
    },
  ];

  if (includeMergeQueue) {
    rules.push({ type: 'merge_queue', parameters: mqParams });
  }

  return {
    name,
    target: 'branch',
    enforcement,
    conditions: { ref_name: { include: [`refs/heads/${branch}`], exclude: [] } },
    bypass_actors: [],
    rules,
  };
}

async function ghEnsure({ cwd, host }) {
  const h = toString(host) || 'github.com';
  const version = await runCapture('gh', ['--version'], { cwd }).catch(() => null);
  if (!version || version.code !== 0) die('GitHub CLI (gh) is required for --github but was not found on PATH.');
  const auth = await runCapture('gh', ['auth', 'status', '-h', h], { cwd });
  if (auth.code !== 0) die(`gh is not authenticated for ${h}. Run: gh auth login -h ${h}`);
  return { host: h };
}

async function ghApiJson({ cwd, host, method, endpoint, body }) {
  const args = [
    'api',
    '-H', 'X-GitHub-Api-Version: 2022-11-28',
    `--hostname=${host}`,
  ];
  if (method) args.push('--method', method);
  args.push(endpoint);
  if (body != null) args.push('--input', '-');

  const res = await runCapture('gh', args, { cwd, input: body != null ? JSON.stringify(body) : null });
  if (res.code !== 0) return { ok: false, ...res, data: null };
  try {
    return { ok: true, ...res, data: JSON.parse(res.stdout || 'null') };
  } catch {
    return { ok: true, ...res, data: null };
  }
}

function looksLikeNotFound(res) {
  const msg = `${res && res.stderr || ''}\n${res && res.stdout || ''}`;
  return /HTTP\s+404\b/i.test(msg) || /\bNot\s+Found\b/i.test(msg);
}

async function ghGetPersonalLogin({ cwd, host }) {
  const res = await ghApiJson({ cwd, host, endpoint: 'user' });
  if (!res.ok) return '';
  return toString(res.data && res.data.login || '');
}

async function ghGetRepo({ cwd, host, owner, repo }) {
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const res = await ghApiJson({ cwd, host, endpoint });
  if (res.ok) return { found: true, data: res.data };
  if (looksLikeNotFound(res)) return { found: false, data: null };
  die(`GitHub API error while reading repo ${owner}/${repo}: ${res.stderr || res.stdout || ''}`);
  return { found: false, data: null };
}

async function ghBranchExists({ cwd, host, owner, repo, branch }) {
  const b = toString(branch);
  if (!b) return false;
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(b)}`;
  const res = await ghApiJson({ cwd, host, endpoint });
  if (res.ok) return true;
  if (looksLikeNotFound(res)) return false;
  die(`GitHub API error while reading branch ${owner}/${repo}:${b}: ${res.stderr || res.stdout || ''}`);
  return false;
}

async function ghGetBranchHeadSha({ cwd, host, owner, repo, branch }) {
  const b = toString(branch);
  if (!b) return '';
  const ref = encodeURIComponent(`heads/${b}`);
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/${ref}`;
  const res = await ghApiJson({ cwd, host, endpoint });
  if (!res.ok) {
    if (looksLikeNotFound(res)) return '';
    die(`GitHub API error while reading ref heads/${b}: ${res.stderr || res.stdout || ''}`);
  }
  return toString(res.data && res.data.object && res.data.object.sha || '');
}

async function ghCreateBranchRef({ cwd, host, owner, repo, branch, sha, dryRun }) {
  const b = toString(branch);
  const s = toString(sha);
  if (!b || !s) return;
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`;
  const body = { ref: `refs/heads/${b}`, sha: s };

  if (dryRun) {
    info(`[dry-run] create branch ref: ${b} @ ${s}`);
    return;
  }

  const res = await ghApiJson({ cwd, host, method: 'POST', endpoint, body });
  if (!res.ok) {
    throw new Error(`Failed to create branch ${b} in ${owner}/${repo}: ${res.stderr || res.stdout || ''}`);
  }
}

async function ghCreateRepoViaApi({ cwd, host, owner, repo, visibility, personalLogin, dryRun }) {
  const isOrg = personalLogin && owner !== personalLogin;
  const endpoint = isOrg ? `/orgs/${encodeURIComponent(owner)}/repos` : '/user/repos';
  const vis = normalizeVisibility(visibility) || 'private';
  const payload = { name: repo, private: vis !== 'public', auto_init: false };

  if (dryRun) {
    info(`[dry-run] create GitHub repo via API: ${owner}/${repo} (${vis})`);
    return null;
  }

  const res = await ghApiJson({ cwd, host, method: 'POST', endpoint, body: payload });
  if (!res.ok) die(`Failed to create repo ${owner}/${repo}: ${res.stderr || res.stdout || ''}`);
  return res.data;
}

async function gitGetRemoteUrl({ cwd, remoteName }) {
  const res = await runCapture('git', ['remote', 'get-url', remoteName], { cwd });
  if (res.code !== 0) return '';
  return toString(res.stdout);
}

async function gitEnsureRemoteOrigin({ cwd, desired, candidateUrl, dryRun }) {
  const current = await gitGetRemoteUrl({ cwd, remoteName: 'origin' });
  if (current) {
    const parsed = parseRemoteRepoSlug(current);
    if (!parsed) die(`origin remote exists but is not parseable: ${current}`);
    if (desired.host && parsed.host !== desired.host) die(`origin remote host mismatch (found ${parsed.host}, expected ${desired.host}).`);
    if (desired.owner && parsed.owner !== desired.owner) die(`origin remote owner mismatch (found ${parsed.owner}, expected ${desired.owner}).`);
    if (desired.repo && parsed.repo !== desired.repo) die(`origin remote repo mismatch (found ${parsed.repo}, expected ${desired.repo}).`);
    return;
  }

  const url = toString(candidateUrl);
  if (!url) die('Unable to determine origin remote URL.');
  if (dryRun) {
    info(`[dry-run] git remote add origin ${url}`);
    return;
  }
  await run('git', ['remote', 'add', 'origin', url], { cwd });
}

async function gitHasCommit({ cwd }) {
  const res = await runCapture('git', ['rev-parse', '--verify', 'HEAD'], { cwd });
  return res.code === 0;
}

async function gitEnsureBranch({ cwd, branchName, fromRef, dryRun }) {
  const bn = toString(branchName);
  if (!bn) return;
  const exists = await runCapture('git', ['show-ref', '--verify', `refs/heads/${bn}`], { cwd });
  if (exists.code === 0) return;
  if (dryRun) {
    info(`[dry-run] git branch ${bn} ${fromRef}`);
    return;
  }
  await run('git', ['branch', bn, fromRef], { cwd });
}

async function gitCheckout({ cwd, ref, dryRun }) {
  const r = toString(ref);
  if (!r) return;
  if (dryRun) {
    info(`[dry-run] git checkout ${r}`);
    return;
  }
  await run('git', ['checkout', r], { cwd });
}

async function gitStatusPorcelain({ cwd }) {
  const res = await runCapture('git', ['status', '--porcelain'], { cwd });
  if (res.code !== 0) return null;
  return toString(res.stdout || '');
}

async function gitGetCurrentBranch({ cwd }) {
  const res = await runCapture('git', ['branch', '--show-current'], { cwd });
  if (res.code !== 0) return '';
  return toString(res.stdout || '');
}

async function gitGetRemoteHeadBranch({ cwd, remoteName }) {
  const remote = toString(remoteName) || 'origin';
  const res = await runCapture('git', ['symbolic-ref', '-q', `refs/remotes/${remote}/HEAD`], { cwd });
  if (res.code !== 0) return '';
  const full = toString(res.stdout || ''); // refs/remotes/origin/main
  const m = /^refs\/remotes\/[^/]+\/(.+)$/.exec(full);
  return m ? toString(m[1]) : '';
}

async function gitRefExists({ cwd, ref }) {
  const r = toString(ref);
  if (!r) return false;
  const res = await runCapture('git', ['show-ref', '--verify', r], { cwd });
  return res.code === 0;
}

async function ghSetDefaultBranch({ cwd, host, owner, repo, defaultBranch, dryRun }) {
  const branch = toString(defaultBranch);
  if (!branch) return;
  if (dryRun) {
    info(`[dry-run] set default branch to ${branch}`);
    return;
  }
  await run('gh', [
    'api',
    '-H', 'X-GitHub-Api-Version: 2022-11-28',
    `--hostname=${host}`,
    '--method', 'PATCH',
    `/repos/${owner}/${repo}`,
    '-f', `default_branch=${branch}`,
  ], { cwd });
}

function normalizeAllowedMergeMethods(value) {
  const raw = Array.isArray(value) ? value : [];
  const out = new Set();
  for (const v of raw) {
    const m = toString(v).toLowerCase();
    if (!m) continue;
    if (m === 'merge' || m === 'merge_commit' || m === 'merge-commit') out.add('merge');
    else if (m === 'squash') out.add('squash');
    else if (m === 'rebase') out.add('rebase');
  }
  return Array.from(out);
}

function deriveAllowedMergeMethodUnion({ base, overrides }) {
  const union = new Set(normalizeAllowedMergeMethods(base && base.allowed_merge_methods));
  if (overrides && typeof overrides === 'object') {
    for (const scoped of Object.values(overrides)) {
      for (const method of normalizeAllowedMergeMethods(scoped && scoped.allowed_merge_methods)) {
        union.add(method);
      }
    }
  }
  return Array.from(union);
}

async function ghPatchRepoSettings({ cwd, host, owner, repo, policy, dryRun }) {
  const repoSettings = (policy && policy.github && policy.github.repo_settings) || {};
  const rules = (policy && policy.github && policy.github.rules) || {};
  const prParams = rules.pull_request || {};
  const prOverrides = rules.pull_request_overrides || {};
  const allowedMethods = deriveAllowedMergeMethodUnion({ base: prParams, overrides: prOverrides });

  const payload = {};

  if (typeof repoSettings.delete_branch_on_merge === 'boolean') {
    payload.delete_branch_on_merge = repoSettings.delete_branch_on_merge;
  }

  if (allowedMethods.length) {
    payload.allow_merge_commit = allowedMethods.includes('merge');
    payload.allow_squash_merge = allowedMethods.includes('squash');
    payload.allow_rebase_merge = allowedMethods.includes('rebase');
  }

  if (Object.keys(payload).length === 0) return;

  if (dryRun) {
    info(`[dry-run] patch repo settings: ${JSON.stringify(payload)}`);
    return;
  }

  const res = await ghApiJson({ cwd, host, method: 'PATCH', endpoint: `/repos/${owner}/${repo}`, body: payload });
  if (!res.ok) {
    throw new Error(`Failed to patch repo settings for ${owner}/${repo}: ${res.stderr || res.stdout || ''}`);
  }
}

function normalizeHexColor(raw) {
  const v = toString(raw).replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{6}$/.test(v)) return v;
  if (/^[0-9a-f]{3}$/.test(v)) return v.split('').map((c) => `${c}${c}`).join('');
  return '';
}

function loadGitHubLabelsPolicy({ repoRoot, policy }) {
  const rel = toString(policy && policy.github && policy.github.labels && policy.github.labels.policy_path) || 'config/policy/github-labels.json';
  const abs = path.join(repoRoot, ...rel.replace(/\\/g, '/').split('/'));
  const raw = readJsonSafe(abs);
  if (!raw || typeof raw !== 'object') return { path: abs, loaded: false, labels: [] };
  const labels = Array.isArray(raw.labels) ? raw.labels : [];
  const out = [];
  for (const l of labels) {
    if (!l || typeof l !== 'object') continue;
    const name = toString(l.name);
    if (!name) continue;
    const color = normalizeHexColor(l.color) || 'ededed';
    out.push({ name, color, description: toString(l.description) });
  }
  return { path: abs, loaded: true, labels: out };
}

async function ghGetLabel({ cwd, host, owner, repo, name }) {
  const n = toString(name);
  if (!n) return { found: false, data: null };
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels/${encodeURIComponent(n)}`;
  const res = await ghApiJson({ cwd, host, endpoint });
  if (res.ok) return { found: true, data: res.data };
  if (looksLikeNotFound(res)) return { found: false, data: null };
  return { found: false, data: null, error: `${res.stderr || res.stdout || ''}` };
}

async function ghCreateLabel({ cwd, host, owner, repo, label, dryRun }) {
  const name = toString(label && label.name);
  if (!name) return;
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels`;
  const body = {
    name,
    color: normalizeHexColor(label && label.color) || 'ededed',
    description: toString(label && label.description),
  };

  if (dryRun) {
    info(`[dry-run] create label: ${name}`);
    return;
  }

  const res = await ghApiJson({ cwd, host, method: 'POST', endpoint, body });
  if (!res.ok) {
    warn(`Unable to create label "${name}". ${res.stderr || res.stdout || ''}`.trim());
  }
}

async function ghUpdateLabel({ cwd, host, owner, repo, label, dryRun }) {
  const name = toString(label && label.name);
  if (!name) return;
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels/${encodeURIComponent(name)}`;
  const body = {
    color: normalizeHexColor(label && label.color) || 'ededed',
    description: toString(label && label.description),
  };

  if (dryRun) {
    info(`[dry-run] update label: ${name}`);
    return;
  }

  const res = await ghApiJson({ cwd, host, method: 'PATCH', endpoint, body });
  if (!res.ok) {
    warn(`Unable to update label "${name}". ${res.stderr || res.stdout || ''}`.trim());
  }
}

async function ghEnsureLabels({ cwd, host, owner, repo, policy, updateExisting, dryRun }) {
  const loaded = loadGitHubLabelsPolicy({ repoRoot: cwd, policy });
  if (!loaded.loaded || loaded.labels.length === 0) {
    warn(`Labels policy missing/empty; skipping labels provisioning. (${path.relative(cwd, loaded.path)})`);
    return;
  }

  for (const label of loaded.labels) {
    const name = toString(label && label.name);
    if (!name) continue;
    const got = await ghGetLabel({ cwd, host, owner, repo, name });
    if (!got.found) {
      await ghCreateLabel({ cwd, host, owner, repo, label, dryRun });
      continue;
    }
    if (updateExisting) {
      await ghUpdateLabel({ cwd, host, owner, repo, label, dryRun });
    }
  }
}

function normalizeSecurityStatus(raw) {
  const v = toString(raw).toLowerCase();
  if (v === 'enabled' || v === 'disabled') return v;
  return '';
}

async function ghEnableVulnerabilityAlerts({ cwd, host, owner, repo, dryRun }) {
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/vulnerability-alerts`;
  if (dryRun) {
    info('[dry-run] enable vulnerability alerts (Dependabot alerts)');
    return;
  }

  const res = await ghApiJson({ cwd, host, method: 'PUT', endpoint });
  if (!res.ok) {
    warn(`Unable to enable vulnerability alerts. ${res.stderr || res.stdout || ''}`.trim());
  }
}

async function ghEnableAutomatedSecurityFixes({ cwd, host, owner, repo, dryRun }) {
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/automated-security-fixes`;
  if (dryRun) {
    info('[dry-run] enable automated security fixes (Dependabot security updates)');
    return;
  }

  const res = await ghApiJson({ cwd, host, method: 'PUT', endpoint });
  if (!res.ok) {
    warn(`Unable to enable automated security fixes. ${res.stderr || res.stdout || ''}`.trim());
  }
}

async function ghPatchSecurityAndAnalysis({ cwd, host, owner, repo, settings, dryRun }) {
  const s = settings && typeof settings === 'object' ? settings : null;
  if (!s) return;

  const allowed = [
    'advanced_security',
    'dependency_graph',
    'secret_scanning',
    'secret_scanning_push_protection',
  ];

  const security_and_analysis = {};
  for (const key of allowed) {
    const status = normalizeSecurityStatus(s[key]);
    if (!status) continue;
    security_and_analysis[key] = { status };
  }

  if (Object.keys(security_and_analysis).length === 0) return;

  if (dryRun) {
    info(`[dry-run] patch repo security_and_analysis: ${JSON.stringify(security_and_analysis)}`);
    return;
  }

  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const res = await ghApiJson({ cwd, host, method: 'PATCH', endpoint, body: { security_and_analysis } });
  if (!res.ok) {
    warn(`Unable to patch security & analysis toggles. ${res.stderr || res.stdout || ''}`.trim());
  }
}

async function ghHardeningSecurity({ cwd, host, owner, repo, policy, dryRun }) {
  const sec = policy.github.security || {};
  if (sec.enable_vulnerability_alerts) {
    await ghEnableVulnerabilityAlerts({ cwd, host, owner, repo, dryRun });
  }
  if (sec.enable_automated_security_fixes) {
    await ghEnableAutomatedSecurityFixes({ cwd, host, owner, repo, dryRun });
  }
  await ghPatchSecurityAndAnalysis({
    cwd,
    host,
    owner,
    repo,
    settings: sec.security_and_analysis,
    dryRun,
  });
}

function resolveBranchToken(token, { integration, production }) {
  const v = toString(token);
  if (!v) return '';
  if (v === '$integration' || v === '$integration_branch') return toString(integration);
  if (v === '$production' || v === '$production_branch') return toString(production);
  return v;
}

function resolvePolicyTemplateToken(raw, { owner, personalLogin }) {
  const v = toString(raw);
  const o = toString(owner);
  const p = toString(personalLogin);
  if (!v) return '';
  if (v === '$repo_owner') return o;
  if (v === '$personal_login') return p;
  if (v === '$repo_owner_user') {
    if (o && p && o.toLowerCase() === p.toLowerCase()) return o;
    return '';
  }
  return v;
}

function normalizeEnvironmentReviewerSpecs(raw, { owner, personalLogin }) {
  const out = [];
  const seen = new Set();
  const list = Array.isArray(raw) ? raw : [];

  function addUser(login) {
    const l = toString(login).replace(/^@/, '');
    if (!l) return;
    const key = `user:${l.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind: 'user', login: l });
  }

  function addTeam(org, slug) {
    const o = toString(org);
    const s = toString(slug).replace(/^@/, '');
    if (!o || !s) return;
    const key = `team:${o.toLowerCase()}/${s.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind: 'team', org: o, slug: s });
  }

  for (const entry of list) {
    if (typeof entry === 'string') {
      const token = resolvePolicyTemplateToken(entry, { owner, personalLogin });
      const value = toString(token).replace(/^@/, '');
      if (!value) continue;
      const slash = value.indexOf('/');
      if (slash > 0) {
        addTeam(value.slice(0, slash), value.slice(slash + 1));
      } else {
        addUser(value);
      }
      continue;
    }

    if (!entry || typeof entry !== 'object') continue;
    const type = toString(entry.type).toLowerCase();
    const rawUser = resolvePolicyTemplateToken(entry.login || entry.user || '', { owner, personalLogin });
    const rawTeam = resolvePolicyTemplateToken(entry.team || '', { owner, personalLogin });
    const rawOrg = resolvePolicyTemplateToken(entry.org || '', { owner, personalLogin });
    const rawSlug = resolvePolicyTemplateToken(entry.slug || '', { owner, personalLogin });

    if (type === 'team') {
      if (rawTeam && toString(rawTeam).includes('/')) {
        const [org, slug] = toString(rawTeam).split('/', 2);
        addTeam(org, slug);
      } else {
        addTeam(rawOrg || owner, rawSlug || rawTeam);
      }
      continue;
    }

    if (type === 'user') {
      addUser(rawUser || rawTeam);
      continue;
    }

    if (rawTeam && toString(rawTeam).includes('/')) {
      const [org, slug] = toString(rawTeam).split('/', 2);
      addTeam(org, slug);
      continue;
    }
    if (rawUser) addUser(rawUser);
  }

  return out;
}

function formatReviewerSpec(spec) {
  if (!spec || typeof spec !== 'object') return '';
  if (spec.kind === 'team') return `${toString(spec.org)}/${toString(spec.slug)}`;
  return `@${toString(spec.login)}`;
}

async function ghResolveEnvironmentReviewers({ cwd, host, owner, personalLogin, reviewers, dryRun }) {
  const specs = normalizeEnvironmentReviewerSpecs(reviewers, { owner, personalLogin });
  if (specs.length === 0) return [];

  if (dryRun) {
    info(`[dry-run] environment reviewers: ${specs.map((s) => formatReviewerSpec(s)).filter(Boolean).join(', ')}`);
    return [];
  }

  const out = [];
  for (const spec of specs) {
    if (spec.kind === 'team') {
      const endpoint =
        `/orgs/${encodeURIComponent(spec.org)}/teams/${encodeURIComponent(spec.slug)}`;
      // eslint-disable-next-line no-await-in-loop
      const team = await ghApiJson({ cwd, host, endpoint });
      if (!team.ok) {
        warn(`Unable to resolve environment reviewer team "${spec.org}/${spec.slug}". ${team.stderr || team.stdout || ''}`.trim());
        continue;
      }
      const id = Number(team.data && team.data.id);
      if (!Number.isFinite(id) || id <= 0) {
        warn(`Skipping environment reviewer team "${spec.org}/${spec.slug}" (invalid team id).`);
        continue;
      }
      out.push({ type: 'Team', id: Math.floor(id) });
      continue;
    }

    const endpoint = `/users/${encodeURIComponent(spec.login)}`;
    // eslint-disable-next-line no-await-in-loop
    const user = await ghApiJson({ cwd, host, endpoint });
    if (!user.ok) {
      warn(`Unable to resolve environment reviewer user "${spec.login}". ${user.stderr || user.stdout || ''}`.trim());
      continue;
    }
    const userType = toString(user.data && user.data.type).toLowerCase();
    if (userType && userType !== 'user') {
      warn(`Skipping environment reviewer "${spec.login}" (GitHub type=${userType}; expected user).`);
      continue;
    }
    const id = Number(user.data && user.data.id);
    if (!Number.isFinite(id) || id <= 0) {
      warn(`Skipping environment reviewer "${spec.login}" (invalid user id).`);
      continue;
    }
    out.push({ type: 'User', id: Math.floor(id) });
  }
  return out;
}

function resolveEnvironmentBranches(raw, ctx) {
  const out = [];
  const list = Array.isArray(raw) ? raw : [];
  for (const t of list) {
    const resolved = resolveBranchToken(t, ctx);
    if (!resolved) continue;
    if (!out.includes(resolved)) out.push(resolved);
  }
  return out;
}

async function ghGetEnvironment({ cwd, host, owner, repo, environment }) {
  const env = toString(environment);
  if (!env) return { found: false, data: null };
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/environments/${encodeURIComponent(env)}`;
  const res = await ghApiJson({ cwd, host, endpoint });
  if (res.ok) return { found: true, data: res.data };
  if (looksLikeNotFound(res)) return { found: false, data: null };
  return { found: false, data: null, error: `${res.stderr || res.stdout || ''}` };
}

async function ghUpsertEnvironment({
  cwd,
  host,
  owner,
  repo,
  environment,
  waitTimerSeconds,
  enableCustomBranchPolicies,
  preventSelfReview,
  canAdminsBypass,
  reviewers,
  dryRun,
}) {
  const env = toString(environment);
  if (!env) return;

  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/environments/${encodeURIComponent(env)}`;
  const body = {};

  const wt = Number(waitTimerSeconds);
  if (Number.isFinite(wt) && wt >= 0) body.wait_timer = Math.floor(wt);
  if (typeof preventSelfReview === 'boolean') body.prevent_self_review = preventSelfReview;
  if (typeof canAdminsBypass === 'boolean') body.can_admins_bypass = canAdminsBypass;
  if (Array.isArray(reviewers) && reviewers.length > 0) body.reviewers = reviewers;

  if (enableCustomBranchPolicies) {
    body.deployment_branch_policy = { protected_branches: false, custom_branch_policies: true };
  }

  if (dryRun) {
    info(`[dry-run] upsert environment: ${env} ${JSON.stringify(body)}`);
    return;
  }

  const res = await ghApiJson({ cwd, host, method: 'PUT', endpoint, body });
  if (!res.ok) {
    warn(`Unable to upsert environment "${env}". ${res.stderr || res.stdout || ''}`.trim());
  }
}

async function ghListDeploymentBranchPolicies({ cwd, host, owner, repo, environment }) {
  const env = toString(environment);
  if (!env) return [];
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/environments/${encodeURIComponent(env)}/deployment-branch-policies`;
  const res = await ghApiJson({ cwd, host, endpoint });
  if (!res.ok) return [];

  const body = res.data;
  const list = Array.isArray(body) ? body : Array.isArray(body && body.branch_policies) ? body.branch_policies : [];
  return list.map((p) => toString(p && p.name)).filter(Boolean);
}

async function ghCreateDeploymentBranchPolicy({ cwd, host, owner, repo, environment, name, dryRun }) {
  const env = toString(environment);
  const n = toString(name);
  if (!env || !n) return;

  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/environments/${encodeURIComponent(env)}/deployment-branch-policies`;
  const body = { name: n };

  if (dryRun) {
    info(`[dry-run] add deployment branch policy: ${env} <- ${n}`);
    return;
  }

  const res = await ghApiJson({ cwd, host, method: 'POST', endpoint, body });
  if (!res.ok) {
    warn(`Unable to add deployment branch policy "${n}" to "${env}". ${res.stderr || res.stdout || ''}`.trim());
  }
}

async function ghEnsureDeploymentBranchPolicies({ cwd, host, owner, repo, environment, branches, dryRun }) {
  const env = toString(environment);
  const want = Array.isArray(branches) ? branches.map((b) => toString(b)).filter(Boolean) : [];
  if (!env || want.length === 0) return;

  const existing = await ghListDeploymentBranchPolicies({ cwd, host, owner, repo, environment: env });
  const missing = want.filter((b) => !existing.includes(b));
  for (const b of missing) {
    await ghCreateDeploymentBranchPolicy({ cwd, host, owner, repo, environment: env, name: b, dryRun });
  }
}

function envPolicyIsUnrestricted(dep) {
  if (!dep || typeof dep !== 'object') return true;
  const protectedBranches = !!dep.protected_branches;
  const custom = !!dep.custom_branch_policies;
  return !protectedBranches && !custom;
}

async function ghHardeningEnvironments({ cwd, host, owner, repo, policy, integration, production, personalLogin, dryRun }) {
  const envs = Array.isArray(policy.github.environments.defaults) ? policy.github.environments.defaults : [];
  const ctx = { integration, production };

  for (const e of envs) {
    const name = toString(e && e.name);
    if (!name) continue;

    const branches = resolveEnvironmentBranches(e && e.branches, ctx);
    const waitTimer = e && e.wait_timer;
    const preventSelfReview = typeof (e && e.prevent_self_review) === 'boolean' ? e.prevent_self_review : undefined;
    const canAdminsBypass = typeof (e && e.can_admins_bypass) === 'boolean' ? e.can_admins_bypass : undefined;
    const reviewersConfigured = e && Object.prototype.hasOwnProperty.call(e, 'required_reviewers');
    const resolvedReviewers = reviewersConfigured
      ? await ghResolveEnvironmentReviewers({
        cwd,
        host,
        owner,
        personalLogin,
        reviewers: e.required_reviewers,
        dryRun,
      })
      : [];
    const reviewers = resolvedReviewers.length > 0 ? resolvedReviewers : undefined;
    if (reviewersConfigured && !reviewers && !dryRun) {
      warn(`Environment "${name}" has required_reviewers configured but no reviewers could be resolved; skipping reviewer enforcement.`);
    }

    const got = await ghGetEnvironment({ cwd, host, owner, repo, environment: name });
    const exists = !!got.found;
    const dep = got.data && got.data.deployment_branch_policy;
    const shouldHarden = !exists || envPolicyIsUnrestricted(dep);
    const shouldApplyPolicyFields =
      !exists ||
      typeof preventSelfReview === 'boolean' ||
      typeof canAdminsBypass === 'boolean' ||
      Number.isFinite(Number(waitTimer)) ||
      !!reviewers;

    if (!branches.length) {
      warn(`Environments policy includes "${name}" with no branches; skipping branch policy enforcement.`);
      if (shouldApplyPolicyFields) {
        await ghUpsertEnvironment({
          cwd,
          host,
          owner,
          repo,
          environment: name,
          waitTimerSeconds: waitTimer,
          enableCustomBranchPolicies: false,
          preventSelfReview,
          canAdminsBypass,
          reviewers,
          dryRun,
        });
      }
      continue;
    }

    if (!exists || shouldHarden) {
      await ghUpsertEnvironment({
        cwd,
        host,
        owner,
        repo,
        environment: name,
        waitTimerSeconds: waitTimer,
        enableCustomBranchPolicies: true,
        preventSelfReview,
        canAdminsBypass,
        reviewers,
        dryRun,
      });
      await ghEnsureDeploymentBranchPolicies({ cwd, host, owner, repo, environment: name, branches, dryRun });
      continue;
    }

    if (shouldApplyPolicyFields) {
      await ghUpsertEnvironment({
        cwd,
        host,
        owner,
        repo,
        environment: name,
        waitTimerSeconds: waitTimer,
        enableCustomBranchPolicies: false,
        preventSelfReview,
        canAdminsBypass,
        reviewers,
        dryRun,
      });
    }

    if (dep && dep.custom_branch_policies) {
      const existing = await ghListDeploymentBranchPolicies({ cwd, host, owner, repo, environment: name });
      if (existing.length === 0) {
        await ghEnsureDeploymentBranchPolicies({ cwd, host, owner, repo, environment: name, branches, dryRun });
        continue;
      }
      const missing = branches.filter((b) => !existing.includes(b));
      if (missing.length) {
        warn(
          `Environment "${name}" already has custom branch policies; expected patterns missing (${missing.join(', ')}). ` +
          'Skipping to avoid broadening existing environment policy.'
        );
      }
      continue;
    }

    warn(
      `Environment "${name}" is already restricted via protected branches (or unknown policy). ` +
      `Verify deploy restrictions are correct for your integration/production branches (${branches.join(', ')}).`
    );
  }
}

function ghWebBaseUrl({ host, owner, repo }) {
  const h = toString(host) || 'github.com';
  const o = encodeURIComponent(toString(owner));
  const r = encodeURIComponent(toString(repo));
  if (!o || !r) return '';
  return `https://${h}/${o}/${r}`;
}

function printGitHubPostBootstrapChecklist({ host, owner, repo, integration, production, policy }) {
  const base = ghWebBaseUrl({ host, owner, repo });
  if (!base) return;

  const recommendMqIntegration = !!(policy && policy.github && policy.github.recommend_merge_queue_integration);
  const recommendMqProduction = !!(policy && policy.github && policy.github.recommend_merge_queue_production);
  const mqTargets = [
    recommendMqIntegration ? `\`${integration}\`` : '',
    recommendMqProduction ? `\`${production}\`` : '',
  ].filter(Boolean).join(' and ');

  info('Next (GitHub verification checklist):');
  info(`- Rulesets (UI): ${base}/settings/rules`);
  info(`  - CLI: gh api /repos/${owner}/${repo}/rulesets`);
  info(`- Actions variables (UI): ${base}/settings/variables/actions`);
  info(`  - CLI: gh variable list -R ${host}/${owner}/${repo}`);
  info('  - Key gates: MAIN_REQUIRED_APPROVER_LOGINS, MAIN_APPROVER_ALLOW_AUTHOR_FALLBACK, PRODUCTION_PROMOTION_REQUIRED, STAGING_DEPLOY_GUARD, PRODUCTION_DEPLOY_GUARD, DOCS_PUBLISH_GUARD, API_INGRESS_DEPLOY_GUARD');
  info(`- Environments (UI): ${base}/settings/environments`);
  info(`  - CLI: gh api /repos/${owner}/${repo}/environments`);
  info(`  - Production promotion workflow: ${base}/actions/workflows/promote-production.yml`);
  info(`    - Gate path: comment \`/approve-prod\` on a merged PR to \`${production}\`, or run workflow dispatch.`);
  info(`- Security & analysis (UI): ${base}/settings/security_analysis`);
  info(`  - CLI: gh api /repos/${owner}/${repo} --jq .security_and_analysis`);
  if (mqTargets) {
    info(`- Merge Queue (if available): bootstrap attempts API enablement; confirm for ${mqTargets} in rulesets (workflows already support \`merge_group\`).`);
  } else {
    info('- Merge Queue (optional): bootstrap attempts API enablement; confirm in rulesets if your plan supports it (workflows already support `merge_group`).');
  }
  info('- CODEOWNERS: add `.github/CODEOWNERS` in the target repo so code owner review rules can apply.');
  info('- Docs: see docs/ops/runbooks/BASELINE_BOOTSTRAP.md and docs/ops/runbooks/DEPLOYMENT.md');
}

async function ghSetRepoVariable({ cwd, owner, repo, host, name, value, dryRun }) {
  const n = toString(name);
  const v = toString(value);
  if (!n) return;
  if (dryRun) {
    info(`[dry-run] gh variable set ${n}=${v}`);
    return;
  }
  await run('gh', ['variable', 'set', n, '-R', `${host}/${owner}/${repo}`, '-b', v], { cwd });
}

function resolveRepoVariablePolicyValue(raw, { owner, personalLogin }) {
  return resolvePolicyTemplateToken(raw, { owner, personalLogin });
}

async function ghApplyPolicyRepoVariables({ cwd, owner, repo, host, policy, personalLogin, dryRun }) {
  const map = policy && policy.github && policy.github.repo_variables;
  if (!map || typeof map !== 'object') return;

  for (const [name, raw] of Object.entries(map)) {
    const n = toString(name);
    if (!n) continue;
    const value = resolveRepoVariablePolicyValue(raw, { owner, personalLogin });
    if (!toString(value)) {
      warn(`Repo variable "${n}" resolved empty from policy template; skipping.`);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await ghSetRepoVariable({ cwd, owner, repo, host, name: n, value, dryRun });
  }
}

async function ghListRulesets({ cwd, host, owner, repo }) {
  const res = await runCapture(
    'gh',
    [
      'api',
      '-H', 'X-GitHub-Api-Version: 2022-11-28',
      `--hostname=${host}`,
      '--method', 'GET',
      `/repos/${owner}/${repo}/rulesets`,
      '-f', 'includes_parents=false',
      '--paginate',
    ],
    { cwd }
  );
  if (res.code !== 0) return [];
  try {
    const parsed = JSON.parse(res.stdout || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function ghUpsertRuleset({ cwd, host, owner, repo, desired, dryRun }) {
  const name = toString(desired && desired.name || '');
  if (!name) return;

  const existing = await ghListRulesets({ cwd, host, owner, repo });
  const match = existing.find((r) => toString(r && r.name) === name);
  const method = match ? 'PUT' : 'POST';
  const endpoint = match
    ? `/repos/${owner}/${repo}/rulesets/${encodeURIComponent(String(match.id))}`
    : `/repos/${owner}/${repo}/rulesets`;

  if (dryRun) {
    info(`[dry-run] gh api ${method} ${endpoint} (ruleset: ${name})`);
    return;
  }

  async function upsert(body) {
    return runCapture(
      'gh',
      [
        'api',
        '-H', 'X-GitHub-Api-Version: 2022-11-28',
        `--hostname=${host}`,
        '--method', method,
        endpoint,
        '--input', '-',
      ],
      { cwd, input: JSON.stringify(body) }
    );
  }

  let res = await upsert(desired);

  if (res.code !== 0) {
    const stderr = toString(res && res.stderr);
    const stdout = toString(res && res.stdout);
    const msg = [stderr, stdout].filter(Boolean).join('\n');
    const mergeQueueUnsupported =
      /Invalid rule 'merge_queue'/i.test(msg) ||
      (/Invalid rule/i.test(msg) && /\bmerge_queue\b/i.test(msg));

    const hasMergeQueueRule =
      Array.isArray(desired && desired.rules) &&
      desired.rules.some((r) => toString(r && r.type).toLowerCase() === 'merge_queue');

    if (mergeQueueUnsupported && hasMergeQueueRule) {
      warn(
        'Merge Queue rule was rejected by GitHub API for this repo (likely unsupported for personal repos or your plan). ' +
        'Retrying ruleset without merge queue.'
      );
      const stripped = {
        ...desired,
        rules: desired.rules.filter((r) => toString(r && r.type).toLowerCase() !== 'merge_queue'),
      };
      res = await upsert(stripped);
      if (res.code === 0) return;
    }
    if (/Upgrade\s+to\s+GitHub\s+Pro\b/i.test(msg) || /make\s+this\s+repository\s+public\b/i.test(msg)) {
      throw new Error(
        `Failed to ${method} ruleset ${name}: ${msg}\n` +
        'Hint: Rulesets/branch protection may be restricted on private personal repos. Options:\n' +
        '- Make the repository public, or\n' +
        '- Upgrade your GitHub plan / use an organization repo with the required plan.\n' +
        'After fixing, re-run: npm run baseline:bootstrap -- --to <target> --mode overlay --overwrite --github'
      );
    }
    throw new Error(`Failed to ${method} ruleset ${name}: ${msg}`);
  }
}

async function runNpmTests({ cwd, dryRun }) {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    warn('No package.json in target; skipping npm install/test.');
    return;
  }

  const hasLock = fs.existsSync(path.join(cwd, 'package-lock.json'));
  if (dryRun) {
    info(`[dry-run] npm ${hasLock ? 'ci' : 'install'}`);
    info('[dry-run] npm test');
    return;
  }

  await run('npm', [hasLock ? 'ci' : 'install'], { cwd });
  await run('npm', ['test'], { cwd });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log([
      'baseline:bootstrap',
      '',
      'Usage:',
      '  npm run baseline:bootstrap -- --to <path> [--mode init|overlay] [--overwrite] [--dry-run] [--github]',
      '',
      'Flags:',
      '  --to, -t                   Target path (required)',
      '  --mode                     init|overlay (auto when omitted)',
      '  --overwrite                Overwrite baseline-managed files in target (recommended for updates)',
      '  --dry-run                  Print actions without writing',
      '  --github                   Provision/configure GitHub via gh (optional)',
      '  --adopt                    Active repo mode: create an adoption PR (recommended when branches are protected)',
      '  --reviewers                Comma-separated reviewers for the adopt PR (users or org/team)',
      '  --auto-merge               Enable GitHub auto-merge for the adopt PR (still requires approvals)',
      '  --require-clean            Fail if the target repo has uncommitted changes (implied by --adopt)',
      '  --owner / --repo           GitHub owner and repo name (optional; prompted if missing)',
      '  --visibility               private|public (default from bootstrap policy)',
      '  --host                     GitHub host (default from bootstrap policy; usually github.com)',
      '  --yes                      Accept defaults (minimize prompts)',
      '  --non-interactive          Fail instead of prompting for missing values',
      '  --skip-env                 Do not create local env file from template',
      '  --skip-tests               Do not run npm install/test in target',
      '  --merge-queue-production   Recommend enabling Merge Queue on production branch (manual)',
      '  --main-approvers=<csv>     Override MAIN_REQUIRED_APPROVER_LOGINS repo var (when --github)',
      '  --enableBackport=<0|1>     Set BACKPORT_ENABLED repo var (when --github)',
      '  --enableSecurity=<0|1>     Set SECURITY_ENABLED repo var (when --github)',
      '  --enableDeploy=<0|1>       Set DEPLOY_ENABLED repo var (when --github)',
      '  --hardening-labels=<0|1>   Ensure baseline labels exist (when --github; default from policy)',
      '  --hardening-security=<0|1> Enable GitHub security toggles (when --github; best-effort; default from policy)',
      '  --hardening-environments=<0|1> Create GitHub environments + branch policies (when --github; best-effort; default from policy)',
      '',
    ].join('\n'));
    return;
  }

  if (!args.to) die('Missing --to <path>.');
  if (args.adopt && !args.github) die('--adopt requires --github (adopt mode opens a PR via gh).');

  const runSummary = createRunSummary({ dryRun: args.dryRun, verbose: args.verbose });
  ACTIVE_RUN_SUMMARY = runSummary;

  const sourceRoot = path.resolve(__dirname, '..', '..');
  const baselinePolicy = loadBootstrapPolicy(sourceRoot).config;

  const targetRoot = path.resolve(process.cwd(), args.to);
  const host = args.host || toString(baselinePolicy.github.host) || 'github.com';

  let mode = args.mode;
  if (!mode) mode = isEmptyDir(targetRoot) ? 'init' : 'overlay';

  ensureDir(targetRoot, args.dryRun);
  await ensureGitAvailable();

  info(`Target: ${targetRoot}`);
  info(`Mode: ${mode}${args.overwrite ? ' (overwrite)' : ''}${args.dryRun ? ' (dry-run)' : ''}`);

  const requireClean = !!(args.requireClean || args.adopt);
  if (requireClean && fs.existsSync(path.join(targetRoot, '.git'))) {
    const dirty = await gitStatusPorcelain({ cwd: targetRoot });
    if (dirty) {
      die(
        'Target repo has uncommitted changes. Commit or stash them before running bootstrap.\n' +
        'Tip: for active repos, prefer a clean worktree and use --adopt to open a PR.'
      );
    }
  }

  // 1) Install/update baseline files into target.
  await summaryStep(runSummary, 'Baseline: install/update', async (step) => {
    const installScript = path.join(sourceRoot, 'scripts', 'tooling', 'baseline-install.js');
    const installArgs = ['--to', targetRoot, '--mode', mode];
    if (args.overwrite) installArgs.push('--overwrite');
    if (args.dryRun) installArgs.push('--dry-run');
    if (args.verbose) installArgs.push('--verbose');

    step.note = `mode=${mode}${args.overwrite ? ', overwrite' : ''}${args.dryRun ? ', dry-run' : ''}`;

    if (args.dryRun) info(`[dry-run] node ${path.relative(process.cwd(), installScript)} ${installArgs.join(' ')}`);
    else await run(process.execPath, [installScript, ...installArgs], { cwd: sourceRoot });
  });

  // Effective bootstrap policy is the target repo's SSOT once installed.
  const policy = loadBootstrapPolicy(targetRoot).config;

  // 2) Env scaffold (non-destructive).
  if (args.skipEnv) {
    summarySkipStep(runSummary, 'Env: scaffold', '--skip-env');
  } else {
    await summaryStep(runSummary, 'Env: scaffold', async (step) => {
      const envExample = path.join(targetRoot, 'config', 'env', '.env.local.example');
      const envLocal = path.join(targetRoot, 'config', 'env', '.env.local');
      if (fs.existsSync(envLocal)) {
        step.status = 'SKIP';
        step.note = 'config/env/.env.local already exists';
        info('Env: config/env/.env.local already exists (skip).');
        return;
      }

      if (fs.existsSync(envExample)) {
        if (args.dryRun) {
          step.note = 'dry-run (create from template)';
          info('[dry-run] create config/env/.env.local from .env.local.example');
          return;
        }
        ensureDir(path.dirname(envLocal), false);
        fs.copyFileSync(envExample, envLocal);
        step.note = 'created from template';
        info('Env: created config/env/.env.local from template.');
        return;
      }

      if (args.dryRun) {
        step.note = 'dry-run (create placeholder)';
        info('[dry-run] create config/env/.env.local (placeholder)');
        return;
      }
      ensureDir(path.dirname(envLocal), false);
      fs.writeFileSync(envLocal, '# Local environment overrides (never commit secrets)\n', 'utf8');
      step.note = 'created placeholder';
      info('Env: created config/env/.env.local (placeholder).');
    });
  }

  // 3) Git init/commit/branches (idempotent).
  const branchPolicyLoaded = loadBranchPolicyConfig(targetRoot);
  const branchPolicy = branchPolicyLoaded.config;
  let integration = toString(branchPolicy.integration_branch) || 'dev';
  let production = toString(branchPolicy.production_branch) || 'main';

  const hadGitDirBefore = fs.existsSync(path.join(targetRoot, '.git'));
  const hadCommitBefore = hadGitDirBefore ? await gitHasCommit({ cwd: targetRoot }) : false;

  await summaryStep(runSummary, 'Git: init/commit/branches', async (step) => {
    if (!hadGitDirBefore) {
      if (args.dryRun) info(`[dry-run] git init -b ${production}`);
      else await run('git', ['init', '-b', production], { cwd: targetRoot });
    }

    // Existing repos: if the configured production branch doesn't exist locally, infer it from origin/HEAD or current branch.
    if (hadGitDirBefore) {
      const prodRef = `refs/heads/${production}`;
      const prodExists = await gitRefExists({ cwd: targetRoot, ref: prodRef });
      if (!prodExists) {
        const inferredRemoteHead = await gitGetRemoteHeadBranch({ cwd: targetRoot, remoteName: 'origin' });
        const inferredCurrent = await gitGetCurrentBranch({ cwd: targetRoot });
        const inferred = inferredRemoteHead || inferredCurrent;
        if (!inferred || inferred === 'HEAD') {
          die(
            `Configured production branch (${production}) was not found, and bootstrap could not infer a production branch.\n` +
            `Fix: update ${path.join('config', 'policy', 'branch-policy.json')} to match your repo's production branch, or checkout a branch before running bootstrap.`
          );
        }
        warn(`Production branch "${production}" not found; using "${inferred}" (from origin/HEAD or current branch).`);
        production = inferred;
        patchBranchPolicyFile({ repoRoot: targetRoot, integration, production, dryRun: args.dryRun });

        const inferredLocalRef = `refs/heads/${production}`;
        const inferredLocalExists = await gitRefExists({ cwd: targetRoot, ref: inferredLocalRef });
        if (!inferredLocalExists) {
          const inferredRemoteRef = `refs/remotes/origin/${production}`;
          const inferredRemoteExists = await gitRefExists({ cwd: targetRoot, ref: inferredRemoteRef });
          if (!inferredRemoteExists) {
            die(`Unable to find local or remote ref for inferred production branch "${production}".`);
          }
          if (args.dryRun) info(`[dry-run] git branch ${production} origin/${production}`);
          else await run('git', ['branch', production, `origin/${production}`], { cwd: targetRoot });
        }
      }
    }

    if (!(await gitHasCommit({ cwd: targetRoot }))) {
      if (args.dryRun) {
        info('[dry-run] git add -A');
        info('[dry-run] git commit -m "chore: bootstrap baseline"');
      } else {
        await run('git', ['add', '-A'], { cwd: targetRoot });
        try {
          await run('git', ['commit', '-m', 'chore: bootstrap baseline'], { cwd: targetRoot });
        } catch {
          die(
            'Unable to create initial commit. Configure git user.name and user.email.\n' +
            'Example:\n' +
            '  git config --global user.name \"Your Name\"\n' +
            '  git config --global user.email \"you@example.com\"'
          );
        }
      }
    }

    await gitEnsureBranch({ cwd: targetRoot, branchName: integration, fromRef: production, dryRun: args.dryRun });
    await gitCheckout({ cwd: targetRoot, ref: integration, dryRun: args.dryRun });

    step.note = `integration=${integration}, production=${production}${args.dryRun ? ', dry-run' : ''}`;
  });

  // 4) Optional GitHub provisioning/config.
  if (args.github) {
    let actualHost = host;
    let owner = '';
    let repo = '';
    let personalLogin = '';
    let repoGet = { found: false, data: null };

    await summaryStep(runSummary, 'GitHub: repo/settings/variables', async (step) => {
      const ensured = await ghEnsure({ cwd: targetRoot, host });
      actualHost = ensured.host;

      // Try infer owner/repo from existing origin.
      const originUrl = await gitGetRemoteUrl({ cwd: targetRoot, remoteName: 'origin' });
      const inferred = parseRemoteRepoSlug(originUrl);

      owner = args.owner || (inferred && inferred.owner) || '';
      repo = args.repo || (inferred && inferred.repo) || '';
      let visibility = args.visibility || normalizeVisibility(policy.github.default_visibility) || 'private';

      if (!owner || !repo) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const personal = await ghGetPersonalLogin({ cwd: targetRoot, host: actualHost });
        owner = await promptText({ rl, label: 'GitHub owner (org or user)', defaultValue: owner || personal, nonInteractive: args.nonInteractive, yes: args.yes });
        repo = await promptText({ rl, label: 'GitHub repo name', defaultValue: repo || path.basename(targetRoot), nonInteractive: args.nonInteractive, yes: args.yes });
        visibility = await promptText({ rl, label: 'Repo visibility (private/public)', defaultValue: visibility, nonInteractive: args.nonInteractive, yes: args.yes });
        rl.close();
      }

      if (!owner || !repo) die('Missing GitHub owner/repo.');
      visibility = normalizeVisibility(visibility) || 'private';

      personalLogin = await ghGetPersonalLogin({ cwd: targetRoot, host: actualHost });
      repoGet = await ghGetRepo({ cwd: targetRoot, host: actualHost, owner, repo });
      let repoData = repoGet.found ? repoGet.data : null;
      if (!repoGet.found) {
        repoData = await ghCreateRepoViaApi({ cwd: targetRoot, host: actualHost, owner, repo, visibility, personalLogin, dryRun: args.dryRun });
      } else {
        info(`GitHub repo exists: ${owner}/${repo}`);
      }

      const cloneUrl = repoData ? toString(repoData.ssh_url || repoData.clone_url || '') : '';
      await gitEnsureRemoteOrigin({ cwd: targetRoot, desired: { host: actualHost, owner, repo }, candidateUrl: cloneUrl, dryRun: args.dryRun });

      // Ensure remote branches exist (avoid pushing protected branches when already present).
      let prodRemoteExists = await ghBranchExists({ cwd: targetRoot, host: actualHost, owner, repo, branch: production });
      let integRemoteExists = await ghBranchExists({ cwd: targetRoot, host: actualHost, owner, repo, branch: integration });

      async function gitPushBranch(branch) {
        const b = toString(branch);
        if (!b) return;
        if (args.dryRun) {
          info(`[dry-run] git push -u origin ${b}`);
          return;
        }
        await run('git', ['push', '-u', 'origin', b], { cwd: targetRoot });
      }

      if (!prodRemoteExists) {
        await gitPushBranch(production);
        prodRemoteExists = true;
      }

      if (!integRemoteExists) {
        // Prefer creating the integration branch via API when the repo already exists.
        if (repoGet.found && prodRemoteExists) {
          const sha = await ghGetBranchHeadSha({ cwd: targetRoot, host: actualHost, owner, repo, branch: production });
          if (sha) {
            try {
              await ghCreateBranchRef({ cwd: targetRoot, host: actualHost, owner, repo, branch: integration, sha, dryRun: args.dryRun });
              integRemoteExists = true;
            } catch (e) {
              warn(`Unable to create integration branch via API (${integration}); falling back to git push. ${e.message || e}`);
            }
          }
        }
        if (!integRemoteExists) {
          await gitPushBranch(integration);
          integRemoteExists = true;
        }
      }

      // Default branch (recommended: integration).
      if (policy.github.set_default_branch_to_integration) {
        await ghSetDefaultBranch({ cwd: targetRoot, host: actualHost, owner, repo, defaultBranch: integration, dryRun: args.dryRun });
      }

      // Repository settings (merge methods, delete branch on merge, etc.).
      await ghPatchRepoSettings({ cwd: targetRoot, host: actualHost, owner, repo, policy, dryRun: args.dryRun });

      const enableBackport = args.enableBackport == null ? !!policy.github.enable_backport_default : !!args.enableBackport;
      const enableSecurity = args.enableSecurity == null ? !!policy.github.enable_security_default : !!args.enableSecurity;
      const enableDeploy = args.enableDeploy == null ? !!policy.github.enable_deploy_default : !!args.enableDeploy;

      await ghApplyPolicyRepoVariables({
        cwd: targetRoot,
        owner,
        repo,
        host: actualHost,
        policy,
        personalLogin,
        dryRun: args.dryRun,
      });

      await ghSetRepoVariable({ cwd: targetRoot, owner, repo, host: actualHost, name: 'BACKPORT_ENABLED', value: enableBackport ? '1' : '0', dryRun: args.dryRun });
      await ghSetRepoVariable({ cwd: targetRoot, owner, repo, host: actualHost, name: 'SECURITY_ENABLED', value: enableSecurity ? '1' : '0', dryRun: args.dryRun });
      await ghSetRepoVariable({ cwd: targetRoot, owner, repo, host: actualHost, name: 'DEPLOY_ENABLED', value: enableDeploy ? '1' : '0', dryRun: args.dryRun });
      await ghSetRepoVariable({ cwd: targetRoot, owner, repo, host: actualHost, name: 'EVIDENCE_SOURCE_BRANCH', value: integration, dryRun: args.dryRun });
      if (args.mainApprovers) {
        await ghSetRepoVariable({
          cwd: targetRoot,
          owner,
          repo,
          host: actualHost,
          name: 'MAIN_REQUIRED_APPROVER_LOGINS',
          value: args.mainApprovers,
          dryRun: args.dryRun,
        });
      }

      const state = repoGet.found ? 'existing repo' : 'created repo';
      step.note = `${actualHost}/${owner}/${repo} (${state})`;
    });

    const hardeningLabels = args.hardeningLabels == null ? !!(policy.github.labels && policy.github.labels.enabled) : !!args.hardeningLabels;
    const hardeningSecurity = args.hardeningSecurity == null ? !!(policy.github.security && policy.github.security.enabled) : !!args.hardeningSecurity;
    const hardeningEnvironments = args.hardeningEnvironments == null ? !!(policy.github.environments && policy.github.environments.enabled) : !!args.hardeningEnvironments;

    if (hardeningLabels) {
      await summaryStep(runSummary, 'GitHub: labels', async (step) => {
        await ghEnsureLabels({
          cwd: targetRoot,
          host: actualHost,
          owner,
          repo,
          policy,
          updateExisting: !!(policy.github.labels && policy.github.labels.update_existing),
          dryRun: args.dryRun,
        });
        step.note = 'ensure baseline labels exist';
      });
    } else {
      summarySkipStep(runSummary, 'GitHub: labels', 'disabled (policy/flag)');
    }

    if (hardeningSecurity) {
      await summaryStep(runSummary, 'GitHub: security hardening', async () => {
        await ghHardeningSecurity({ cwd: targetRoot, host: actualHost, owner, repo, policy, dryRun: args.dryRun });
      });
    } else {
      summarySkipStep(runSummary, 'GitHub: security hardening', 'disabled (policy/flag)');
    }

    if (hardeningEnvironments) {
      await summaryStep(runSummary, 'GitHub: environments', async () => {
        await ghHardeningEnvironments({
          cwd: targetRoot,
          host: actualHost,
          owner,
          repo,
          policy,
          integration,
          production,
          personalLogin,
          dryRun: args.dryRun,
        });
      });
    } else {
      summarySkipStep(runSummary, 'GitHub: environments', 'disabled (policy/flag)');
    }

    await summaryStep(runSummary, 'GitHub: rulesets', async (step) => {
      // Rulesets (branch protection).
      const requiredContexts = deriveRequiredCheckContexts({ repoRoot: targetRoot, workflowPaths: policy.github.required_check_workflows || [] });
      if (requiredContexts.length === 0) warn('Unable to derive required check contexts from workflow files; required status checks may not enforce as expected.');

      const includeMqIntegration = !!policy.github.recommend_merge_queue_integration;
      const includeMqProduction = args.mergeQueueProduction || !!policy.github.recommend_merge_queue_production;

      const integrationRuleset = buildRulesetBody({
        name: toString(policy.github.rulesets.integration && policy.github.rulesets.integration.name) || 'baseline: integration',
        branch: integration,
        enforcement: toString(policy.github.rulesets.integration && policy.github.rulesets.integration.enforcement) || 'active',
        requiredContexts,
        includeMergeQueue: includeMqIntegration,
        policy,
        scope: 'integration',
      });

      const productionRuleset = buildRulesetBody({
        name: toString(policy.github.rulesets.production && policy.github.rulesets.production.name) || 'baseline: production',
        branch: production,
        enforcement: toString(policy.github.rulesets.production && policy.github.rulesets.production.enforcement) || 'active',
        requiredContexts,
        includeMergeQueue: includeMqProduction,
        policy,
        scope: 'production',
      });

      await ghUpsertRuleset({ cwd: targetRoot, host: actualHost, owner, repo, desired: integrationRuleset, dryRun: args.dryRun });
      await ghUpsertRuleset({ cwd: targetRoot, host: actualHost, owner, repo, desired: productionRuleset, dryRun: args.dryRun });

      if (includeMqIntegration || includeMqProduction) {
        const targets = [
          includeMqIntegration ? `\`${integration}\`` : '',
          includeMqProduction ? `\`${production}\`` : '',
        ].filter(Boolean).join(' and ');
        info('Merge Queue: policy enabled (best-effort).');
        info(
          `- Bootstrap configures Merge Queue via rulesets when supported by your plan/org.\n` +
          `- If unsupported, bootstrap will warn and the ruleset will be applied without merge queue.\n` +
          '- Workflows already include `merge_group` triggers so required checks can run under Merge Queue.'
        );
        step.note = `merge queue best-effort for ${targets || 'rulesets'}`;
      }
    });

    // Active repo adopt mode: create a PR instead of pushing baseline changes directly to protected branches.
    if (args.adopt) {
      await summaryStep(runSummary, 'GitHub: adopt PR', async (step) => {
        if (!hadCommitBefore || !repoGet.found) {
          step.status = 'SKIP';
          step.note = 'new repo (adopt PR is for existing repos)';
          info('Adopt: skipped (new repo bootstraps directly; PR adoption is for existing repos).');
          return;
        }

        const dirty = await gitStatusPorcelain({ cwd: targetRoot });
        if (!dirty) {
          step.status = 'SKIP';
          step.note = 'no working tree changes';
          info('Adopt: no working tree changes detected; skipping PR creation.');
          return;
        }

        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-').replace('Z', '');
        const adoptBranch = `baseline/adopt-${stamp}`;

        const reviewers = toString(args.reviewers)
          .split(',')
          .map((v) => toString(v).replace(/^@/, ''))
          .filter(Boolean);

        function ym() {
          const d = new Date();
          const y = d.getUTCFullYear();
          const m = String(d.getUTCMonth() + 1).padStart(2, '0');
          return `${y}${m}`;
        }

        function planPathForSlug(slug) {
          return path.join(targetRoot, 'docs', 'ops', 'plans', `PLAN-${ym()}-${slug}.md`);
        }

        function resolveUniqueSlug(baseSlug) {
          const base = toString(baseSlug) || 'baseline-adopt';
          for (let i = 0; i < 50; i++) {
            const slug = i === 0 ? base : `${base}-${i + 1}`;
            if (!fs.existsSync(planPathForSlug(slug))) return slug;
          }
          return `${base}-${Date.now()}`;
        }

        const planOwner = personalLogin ? `@${personalLogin}` : '@handle';
        const slug = resolveUniqueSlug('baseline-adopt');
        const planId = `PLAN-${ym()}-${slug}`;
        const planNew = path.join(targetRoot, 'scripts', 'ops', 'plan-new.js');
        const planAdvance = path.join(targetRoot, 'scripts', 'ops', 'plan-advance.js');
        const planFile = path.join(targetRoot, 'docs', 'ops', 'plans', `${planId}.md`);

        if (args.dryRun) {
          step.note = 'dry-run (would open PR)';
          info(`[dry-run] git checkout -b ${adoptBranch}`);
          info(`[dry-run] node ${path.relative(targetRoot, planNew)} --slug ${slug} --title "Baseline adoption" --owner ${planOwner} --status in_progress`);
          info(`[dry-run] insert checklist step: - [ ] S10 - Baseline adoption (bootstrap install + PR)`);
          info(`[dry-run] node ${path.relative(targetRoot, planAdvance)} --plan ${planId} --to S10`);
          info('[dry-run] git add -A && git commit -m "chore: adopt baseline kit"');
          info(`[dry-run] git push -u origin ${adoptBranch}`);
          info(`[dry-run] gh pr create -R ${actualHost}/${owner}/${repo} --base ${integration} --head ${adoptBranch} ...`);
          return;
        }

        await run('git', ['checkout', '-b', adoptBranch], { cwd: targetRoot });

        // Create a plan so PR policy can validate Plan/Step metadata.
        await run(process.execPath, [planNew, '--slug', slug, '--title', 'Baseline adoption', '--owner', planOwner, '--status', 'in_progress'], { cwd: targetRoot });

        // Insert S10 into the checklist and advance the plan to S10 (so Step is valid + visible).
        let body = fs.readFileSync(planFile, 'utf8');
        if (!/^- \[ \] S10\b/m.test(body)) {
          body = body.replace(
            /^- \[ \] S03\b.*$/m,
            (m) => `${m}\n- [ ] S10 - Baseline adoption (bootstrap install + PR)`
          );
          fs.writeFileSync(planFile, body, 'utf8');
        }
        await run(process.execPath, [planAdvance, '--plan', planId, '--to', 'S10'], { cwd: targetRoot });

        await run('git', ['add', '-A'], { cwd: targetRoot });
        await run('git', ['commit', '-m', 'chore: adopt baseline kit'], { cwd: targetRoot });
        await run('git', ['push', '-u', 'origin', adoptBranch], { cwd: targetRoot });

        const prTitle = 'chore: adopt baseline kit';
        const prBody = [
          '## Plan',
          `Plan: ${planId}`,
          'Step: S10',
          '',
          '## Summary',
          '- Adopt baseline kit into an existing repository (non-destructive overlay).',
          '',
          '## Verification',
          '- [ ] `npm test`',
          '',
        ].join('\n');

        const prArgs = [
          'pr', 'create',
          '-R', `${actualHost}/${owner}/${repo}`,
          '--base', integration,
          '--head', adoptBranch,
          '--title', prTitle,
          '--body', prBody,
        ];
        for (const r of reviewers) prArgs.push('--reviewer', r);

        const prRes = await runCapture('gh', prArgs, { cwd: targetRoot });
        if (prRes.code !== 0) die(`Failed to create adopt PR: ${prRes.stderr || prRes.stdout || ''}`);
        const prUrl = toString((prRes.stdout || '').split(/\r?\n/).pop());
        step.note = prUrl ? `PR created (${prUrl})` : 'PR created';
        info(`Adopt PR created: ${prUrl || '<unknown>'}`);

        if (args.autoMerge && prUrl) {
          const mergeRes = await runCapture('gh', ['pr', 'merge', prUrl, '--auto', '--squash', '--delete-branch'], { cwd: targetRoot });
          if (mergeRes.code !== 0) {
            warn(`Unable to enable auto-merge for adopt PR. ${mergeRes.stderr || mergeRes.stdout || ''}`.trim());
          } else {
            info('Adopt PR: auto-merge enabled (awaiting approvals + green checks).');
          }
        }
      });
    } else {
      summarySkipStep(runSummary, 'GitHub: adopt PR', 'not requested (--adopt)');
    }

    printGitHubPostBootstrapChecklist({ host: actualHost, owner, repo, integration, production, policy });

    info('GitHub: provisioning complete.');
  } else {
    summarySkipStep(runSummary, 'GitHub: provisioning', '--github not set');
    info('GitHub: skipped (run with --github to provision/configure).');
  }

  // 5) Optional install/test in target repo.
  if (args.skipTests) {
    summarySkipStep(runSummary, 'Tests: npm install/test', '--skip-tests');
    info('Tests: skipped (--skip-tests).');
  } else {
    await summaryStep(runSummary, 'Tests: npm install/test', async () => {
      await runNpmTests({ cwd: targetRoot, dryRun: args.dryRun });
    });
  }

  printRunSummary(runSummary);
  ACTIVE_RUN_SUMMARY = null;

  info('Done.');
}

if (require.main === module) {
  main().catch((e) => {
    try {
      if (ACTIVE_RUN_SUMMARY) printRunSummary(ACTIVE_RUN_SUMMARY);
    } catch {
      // ignore summary failures
    }
    die(e && e.message ? e.message : String(e));
  });
}

module.exports = {
  buildRulesetBody,
  deriveRequiredCheckContexts,
  loadBootstrapPolicy,
  normalizeEnvironmentReviewerSpecs,
  parseRemoteRepoSlug,
  parseWorkflowChecks,
  resolvePolicyTemplateToken,
};
