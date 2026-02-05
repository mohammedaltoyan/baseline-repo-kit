#!/usr/bin/env node
/**
 * baseline-bootstrap.js
 *
 * One-button bootstrap for new projects:
 * - Installs/updates this baseline into a target repo (non-destructive).
 * - Initializes git + branches from SSOT policy.
 * - Optionally provisions/configures GitHub (repo, repo settings, rulesets/branch protection, repo variables).
 *   - Merge Queue must be enabled manually (when supported by your GitHub plan).
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
const { readJsonSafe } = require('../utils/json');
const { run, runCapture } = require('../utils/exec');
const { loadBranchPolicyConfig } = require('../ops/branch-policy');

function die(msg) {
  console.error(`[baseline-bootstrap] ${msg}`);
  process.exit(1);
}

function warn(msg) {
  console.warn(`[baseline-bootstrap] WARN: ${msg}`);
}

function info(msg) {
  console.log(`[baseline-bootstrap] ${msg}`);
}

function toString(value) {
  return String(value == null ? '' : value).trim();
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
      recommend_merge_queue_integration: true,
      recommend_merge_queue_production: false,
      required_check_workflows: [
        '.github/workflows/ci.yml',
        '.github/workflows/pr-policy.yml',
      ],
      rulesets: {
        integration: { name: 'baseline: integration', enforcement: 'active' },
        production: { name: 'baseline: production', enforcement: 'active' },
      },
      rules: {
        pull_request: {
          allowed_merge_methods: ['squash'],
          dismiss_stale_reviews_on_push: true,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_approving_review_count: 0,
          required_review_thread_resolution: true,
        },
        required_status_checks: {
          do_not_enforce_on_create: false,
          strict_required_status_checks_policy: true,
        },
      },
      repo_settings: {
        delete_branch_on_merge: true,
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
    host: toString(args.host || ''),
    owner: toString(args.owner || ''),
    repo: toString(args.repo || ''),
    visibility: normalizeVisibility(args.visibility || ''),
    yes: isTruthy(args.yes || args.y),
    nonInteractive: isTruthy(args['non-interactive'] || args.nonInteractive),
    skipEnv: isTruthy(args['skip-env'] || args.skipEnv),
    skipTests: isTruthy(args['skip-tests'] || args.skipTests || args.noTests),
    mergeQueueProduction: isTruthy(args['merge-queue-production'] || args.mergeQueueProduction),
    enableBackport: args.enableBackport === undefined ? null : isTruthy(args.enableBackport),
    enableSecurity: args.enableSecurity === undefined ? null : isTruthy(args.enableSecurity),
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

  let workflowName = '';
  for (const line of lines) {
    const m = /^name:\s*(.+?)\s*$/.exec(line);
    if (m) {
      workflowName = stripQuotes(m[1]);
      break;
    }
  }
  if (!workflowName) workflowName = path.posix.basename(workflowFilePath.replace(/\\/g, '/'));

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

  return jobs.map((j) => `${workflowName} / ${toString(j.name) || j.id}`);
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

function buildRulesetBody({ name, branch, enforcement, requiredContexts, includeMergeQueue, policy }) {
  const prParams = policy.github.rules.pull_request || {};
  const statusParams = policy.github.rules.required_status_checks || {};

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

  // NOTE: Merge queue cannot be configured via the Rulesets REST API at this time.
  // Keep `includeMergeQueue` in the signature for compatibility, but do not emit a rule.

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

async function ghPatchRepoSettings({ cwd, host, owner, repo, policy, dryRun }) {
  const repoSettings = (policy && policy.github && policy.github.repo_settings) || {};
  const prParams = (policy && policy.github && policy.github.rules && policy.github.rules.pull_request) || {};
  const allowedMethods = normalizeAllowedMergeMethods(prParams.allowed_merge_methods);

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

async function ghListRulesets({ cwd, host, owner, repo }) {
  const res = await runCapture(
    'gh',
    [
      'api',
      '-H', 'X-GitHub-Api-Version: 2022-11-28',
      `--hostname=${host}`,
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

  const res = await runCapture(
    'gh',
    [
      'api',
      '-H', 'X-GitHub-Api-Version: 2022-11-28',
      `--hostname=${host}`,
      '--method', method,
      endpoint,
      '--input', '-',
    ],
    { cwd, input: JSON.stringify(desired) }
  );

  if (res.code !== 0) {
    const msg = `${res.stderr || res.stdout || ''}`;
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
      '  --owner / --repo           GitHub owner and repo name (optional; prompted if missing)',
      '  --visibility               private|public (default from bootstrap policy)',
      '  --host                     GitHub host (default from bootstrap policy; usually github.com)',
      '  --yes                      Accept defaults (minimize prompts)',
      '  --non-interactive          Fail instead of prompting for missing values',
      '  --skip-env                 Do not create local env file from template',
      '  --skip-tests               Do not run npm install/test in target',
      '  --merge-queue-production   Recommend enabling Merge Queue on production branch (manual)',
      '  --enableBackport=<0|1>     Set BACKPORT_ENABLED repo var (when --github)',
      '  --enableSecurity=<0|1>     Set SECURITY_ENABLED repo var (when --github)',
      '',
    ].join('\n'));
    return;
  }

  if (!args.to) die('Missing --to <path>.');

  const sourceRoot = path.resolve(__dirname, '..', '..');
  const policy = loadBootstrapPolicy(sourceRoot).config;

  const targetRoot = path.resolve(process.cwd(), args.to);
  const host = args.host || toString(policy.github.host) || 'github.com';

  let mode = args.mode;
  if (!mode) mode = isEmptyDir(targetRoot) ? 'init' : 'overlay';

  ensureDir(targetRoot, args.dryRun);
  await ensureGitAvailable();

  info(`Target: ${targetRoot}`);
  info(`Mode: ${mode}${args.overwrite ? ' (overwrite)' : ''}${args.dryRun ? ' (dry-run)' : ''}`);

  // 1) Install/update baseline files into target.
  const installScript = path.join(sourceRoot, 'scripts', 'tooling', 'baseline-install.js');
  const installArgs = ['--to', targetRoot, '--mode', mode];
  if (args.overwrite) installArgs.push('--overwrite');
  if (args.dryRun) installArgs.push('--dry-run');
  if (args.verbose) installArgs.push('--verbose');

  if (args.dryRun) info(`[dry-run] node ${path.relative(process.cwd(), installScript)} ${installArgs.join(' ')}`);
  else await run(process.execPath, [installScript, ...installArgs], { cwd: sourceRoot });

  // 2) Env scaffold (non-destructive).
  if (!args.skipEnv) {
    const envExample = path.join(targetRoot, 'config', 'env', '.env.local.example');
    const envLocal = path.join(targetRoot, 'config', 'env', '.env.local');
    if (fs.existsSync(envLocal)) info('Env: config/env/.env.local already exists (skip).');
    else if (fs.existsSync(envExample)) {
      if (args.dryRun) info('[dry-run] create config/env/.env.local from .env.local.example');
      else {
        ensureDir(path.dirname(envLocal), false);
        fs.copyFileSync(envExample, envLocal);
        info('Env: created config/env/.env.local from template.');
      }
    } else {
      if (args.dryRun) info('[dry-run] create config/env/.env.local (placeholder)');
      else {
        ensureDir(path.dirname(envLocal), false);
        fs.writeFileSync(envLocal, '# Local environment overrides (never commit secrets)\n', 'utf8');
        info('Env: created config/env/.env.local (placeholder).');
      }
    }
  }

  // 3) Git init/commit/branches (idempotent).
  const branchPolicy = loadBranchPolicyConfig(targetRoot).config;
  const integration = toString(branchPolicy.integration_branch) || 'dev';
  const production = toString(branchPolicy.production_branch) || 'main';

  if (!fs.existsSync(path.join(targetRoot, '.git'))) {
    if (args.dryRun) info(`[dry-run] git init -b ${production}`);
    else await run('git', ['init', '-b', production], { cwd: targetRoot });
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

  // 4) Optional GitHub provisioning/config.
  if (args.github) {
    const ensured = await ghEnsure({ cwd: targetRoot, host });
    const actualHost = ensured.host;

    // Try infer owner/repo from existing origin.
    const originUrl = await gitGetRemoteUrl({ cwd: targetRoot, remoteName: 'origin' });
    const inferred = parseRemoteRepoSlug(originUrl);

    let owner = args.owner || (inferred && inferred.owner) || '';
    let repo = args.repo || (inferred && inferred.repo) || '';
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

    const personalLogin = await ghGetPersonalLogin({ cwd: targetRoot, host: actualHost });
    const repoGet = await ghGetRepo({ cwd: targetRoot, host: actualHost, owner, repo });
    let repoData = repoGet.found ? repoGet.data : null;
    if (!repoGet.found) {
      repoData = await ghCreateRepoViaApi({ cwd: targetRoot, host: actualHost, owner, repo, visibility, personalLogin, dryRun: args.dryRun });
    } else {
      info(`GitHub repo exists: ${owner}/${repo}`);
    }

    const cloneUrl = repoData ? toString(repoData.ssh_url || repoData.clone_url || '') : '';
    await gitEnsureRemoteOrigin({ cwd: targetRoot, desired: { host: actualHost, owner, repo }, candidateUrl: cloneUrl, dryRun: args.dryRun });

    // Push branches (create remote refs).
    if (args.dryRun) {
      info(`[dry-run] git push -u origin ${production}`);
      info(`[dry-run] git push -u origin ${integration}`);
    } else {
      await run('git', ['push', '-u', 'origin', production], { cwd: targetRoot });
      await run('git', ['push', '-u', 'origin', integration], { cwd: targetRoot });
    }

    // Default branch (recommended: integration).
    if (policy.github.set_default_branch_to_integration) {
      await ghSetDefaultBranch({ cwd: targetRoot, host: actualHost, owner, repo, defaultBranch: integration, dryRun: args.dryRun });
    }

    // Repository settings (merge methods, delete branch on merge, etc.).
    await ghPatchRepoSettings({ cwd: targetRoot, host: actualHost, owner, repo, policy, dryRun: args.dryRun });

    const enableBackport = args.enableBackport == null ? !!policy.github.enable_backport_default : !!args.enableBackport;
    const enableSecurity = args.enableSecurity == null ? !!policy.github.enable_security_default : !!args.enableSecurity;

    await ghSetRepoVariable({ cwd: targetRoot, owner, repo, host: actualHost, name: 'BACKPORT_ENABLED', value: enableBackport ? '1' : '0', dryRun: args.dryRun });
    await ghSetRepoVariable({ cwd: targetRoot, owner, repo, host: actualHost, name: 'SECURITY_ENABLED', value: enableSecurity ? '1' : '0', dryRun: args.dryRun });
    await ghSetRepoVariable({ cwd: targetRoot, owner, repo, host: actualHost, name: 'EVIDENCE_SOURCE_BRANCH', value: integration, dryRun: args.dryRun });

    // Rulesets (branch protection).
    const requiredContexts = deriveRequiredCheckContexts({ repoRoot: targetRoot, workflowPaths: policy.github.required_check_workflows || [] });
    if (requiredContexts.length === 0) warn('Unable to derive required check contexts from workflow files; required status checks may not enforce as expected.');

    const integrationRuleset = buildRulesetBody({
      name: toString(policy.github.rulesets.integration && policy.github.rulesets.integration.name) || 'baseline: integration',
      branch: integration,
      enforcement: toString(policy.github.rulesets.integration && policy.github.rulesets.integration.enforcement) || 'active',
      requiredContexts,
      policy,
    });

    const productionRuleset = buildRulesetBody({
      name: toString(policy.github.rulesets.production && policy.github.rulesets.production.name) || 'baseline: production',
      branch: production,
      enforcement: toString(policy.github.rulesets.production && policy.github.rulesets.production.enforcement) || 'active',
      requiredContexts,
      policy,
    });

    await ghUpsertRuleset({ cwd: targetRoot, host: actualHost, owner, repo, desired: integrationRuleset, dryRun: args.dryRun });
    await ghUpsertRuleset({ cwd: targetRoot, host: actualHost, owner, repo, desired: productionRuleset, dryRun: args.dryRun });

    const recommendMqIntegration = !!policy.github.recommend_merge_queue_integration;
    const recommendMqProduction = args.mergeQueueProduction || !!policy.github.recommend_merge_queue_production;
    if (recommendMqIntegration || recommendMqProduction) {
      const targets = [
        recommendMqIntegration ? `\`${integration}\`` : '',
        recommendMqProduction ? `\`${production}\`` : '',
      ].filter(Boolean).join(' and ');
      info('Merge Queue: recommended (manual enable).');
      info(
        `- baseline:bootstrap does not configure Merge Queue automatically.\n` +
        `- If your GitHub plan supports it, enable Merge Queue for ${targets} in the GitHub UI.\n` +
        '- Workflows already include `merge_group` triggers so required checks can run under Merge Queue.'
      );
    }

    info('GitHub: provisioning complete.');
  } else {
    info('GitHub: skipped (run with --github to provision/configure).');
  }

  // 5) Optional install/test in target repo.
  if (!args.skipTests) await runNpmTests({ cwd: targetRoot, dryRun: args.dryRun });
  else info('Tests: skipped (--skip-tests).');

  info('Done.');
}

if (require.main === module) {
  main().catch((e) => die(e && e.message ? e.message : String(e)));
}

module.exports = {
  buildRulesetBody,
  deriveRequiredCheckContexts,
  loadBootstrapPolicy,
  parseRemoteRepoSlug,
  parseWorkflowChecks,
};
