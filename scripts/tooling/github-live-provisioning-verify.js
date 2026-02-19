#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseFlagArgs } = require('../utils/cli-args');
const { runCapture } = require('../utils/exec');
const { writeJson } = require('../utils/json');

function toString(value) {
  return String(value == null ? '' : value).trim();
}

function toBool(value) {
  const raw = toString(value).toLowerCase();
  if (!raw) return false;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function isoNow() {
  return new Date().toISOString();
}

function slug(value) {
  return toString(value).replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}

function die(message) {
  console.error(`[github-live-verify] ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`[github-live-verify] ${message}`);
}

function parseCsv(value) {
  const raw = toString(value);
  if (!raw) return [];
  return raw.split(',').map((item) => toString(item)).filter(Boolean);
}

function parseScopesFromAuthStatus(text) {
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/Token scopes:\s*(.+)$/i);
    if (!match) continue;
    return parseCsv(match[1].replace(/'/g, '').replace(/\s+/g, ''));
  }
  return [];
}

function parseWarnings(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /\bWARN:/i.test(line));
}

function parseCliArgs(argv, options = {}) {
  const flags = parseFlagArgs(Array.isArray(argv) ? argv : []);
  const cwd = options.cwd || process.cwd();
  const stamp = isoNow().replace(/[:.]/g, '-');

  const artifactPathRaw =
    toString(flags['artifact-path']) ||
    toString(flags.artifactPath) ||
    path.join('tmp', 'github-live-verify', `report-${stamp}.json`);

  const ownerTokens = parseCsv(flags.owners || flags.ownerMatrix);

  return {
    help: !!(flags.h || flags.help),
    execute: toBool(flags.execute),
    cleanup: !toBool(flags['keep-repos'] || flags.keepRepos),
    includeOrgs: !toBool(flags['skip-orgs'] || flags.skipOrgs),
    allOrgs: toBool(flags['all-orgs'] || flags.allOrgs),
    visibility: toString(flags.visibility) || 'private',
    host: toString(flags.host) || 'github.com',
    repoPrefix: toString(flags['repo-prefix'] || flags.repoPrefix) || 'baseline-live-verify',
    artifactPath: path.resolve(cwd, artifactPathRaw),
    owners: ownerTokens,
    failOnScenarioError: !toBool(flags['allow-failures'] || flags.allowFailures),
    dryRunBootstrap: toBool(flags['dry-run-bootstrap'] || flags.dryRunBootstrap),
  };
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function withGitIdentityEnv(baseEnv) {
  const env = { ...(baseEnv || process.env) };
  env.GIT_AUTHOR_NAME = env.GIT_AUTHOR_NAME || 'baseline-kit';
  env.GIT_AUTHOR_EMAIL = env.GIT_AUTHOR_EMAIL || 'baseline-kit@example.invalid';
  env.GIT_COMMITTER_NAME = env.GIT_COMMITTER_NAME || env.GIT_AUTHOR_NAME;
  env.GIT_COMMITTER_EMAIL = env.GIT_COMMITTER_EMAIL || env.GIT_AUTHOR_EMAIL;
  return env;
}

async function ghApiJson(endpoint, { method = 'GET', host = 'github.com', body = null, cwd = process.cwd() } = {}) {
  const args = ['api', endpoint, '--hostname', host];
  if (toString(method).toUpperCase() !== 'GET') {
    args.push('-X', toString(method).toUpperCase());
  }
  args.push('-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28');
  const input = body == null ? null : JSON.stringify(body);
  if (input != null) {
    args.push('--input', '-');
  }

  const res = await runCapture('gh', args, { cwd, input }).catch((error) => ({
    code: 99,
    stdout: '',
    stderr: String(error && error.message ? error.message : error),
  }));

  if (res.code !== 0) {
    return {
      ok: false,
      code: res.code,
      error: toString(res.stderr) || toString(res.stdout) || 'gh api failed',
      data: null,
      stdout: toString(res.stdout),
      stderr: toString(res.stderr),
    };
  }

  const raw = toString(res.stdout);
  if (!raw) return { ok: true, code: 0, error: '', data: null, stdout: raw, stderr: toString(res.stderr) };
  try {
    return { ok: true, code: 0, error: '', data: JSON.parse(raw), stdout: raw, stderr: toString(res.stderr) };
  } catch (error) {
    return {
      ok: false,
      code: 0,
      error: `failed to parse JSON response: ${error && error.message ? error.message : error}`,
      data: null,
      stdout: raw,
      stderr: toString(res.stderr),
    };
  }
}

function normalizeOwnerToken(token, { userLogin }) {
  const raw = toString(token);
  if (!raw) return null;
  if (raw.toLowerCase() === 'user') {
    return { kind: 'user', owner: userLogin };
  }
  const orgMatch = raw.match(/^org:(.+)$/i);
  if (orgMatch) {
    return { kind: 'org', owner: toString(orgMatch[1]) };
  }
  if (raw.toLowerCase().startsWith('user:')) {
    return { kind: 'user', owner: toString(raw.slice(5)) };
  }
  return { kind: raw === userLogin ? 'user' : 'org', owner: raw };
}

function buildScenarioMatrix({ userLogin, orgLogins, owners, includeOrgs, allOrgs }) {
  const out = [];
  const seen = new Set();

  function pushScenario(kind, owner) {
    const k = `${kind}:${owner}`.toLowerCase();
    if (!owner || seen.has(k)) return;
    seen.add(k);
    out.push({ kind, owner });
  }

  if (Array.isArray(owners) && owners.length) {
    for (const token of owners) {
      const normalized = normalizeOwnerToken(token, { userLogin });
      if (!normalized || !normalized.owner) continue;
      pushScenario(normalized.kind, normalized.owner);
    }
    return out;
  }

  pushScenario('user', userLogin);
  if (!includeOrgs) return out;

  const orgs = Array.isArray(orgLogins) ? orgLogins.filter(Boolean) : [];
  if (!orgs.length) return out;
  if (allOrgs) {
    for (const org of orgs) pushScenario('org', org);
    return out;
  }
  pushScenario('org', orgs[0]);
  return out;
}

function summarizeProbe(result, countSelector) {
  if (!result || !result.ok) {
    return {
      ok: false,
      count: null,
      error: result ? result.error : 'probe failed',
    };
  }
  let count = null;
  try {
    count = typeof countSelector === 'function' ? countSelector(result.data) : null;
  } catch {
    count = null;
  }
  return {
    ok: true,
    count: Number.isFinite(count) ? count : null,
    error: '',
  };
}

function hasUnsupportedRulesetSignal(result) {
  if (!result || !result.bootstrap) return false;
  const joined = [
    ...(Array.isArray(result.bootstrap.stdout_tail) ? result.bootstrap.stdout_tail : []),
    ...(Array.isArray(result.bootstrap.stderr_tail) ? result.bootstrap.stderr_tail : []),
    ...(Array.isArray(result.bootstrap.warnings) ? result.bootstrap.warnings : []),
  ].join('\n');

  return /Upgrade to GitHub Pro or make this repository public/i.test(joined)
    || /rulesets\/branch protection may be restricted on private personal repos/i.test(joined)
    || /rest\/repos\/rules#create-a-repository-ruleset/i.test(joined);
}

function classifyScenarioOutcome(result) {
  if (!result || !result.bootstrap) return { status: 'failed', reason: 'missing bootstrap result' };
  if (result.bootstrap.exit_code === 0 && result.bootstrap.summary_found) {
    return { status: 'success', reason: 'bootstrap completed' };
  }

  const rulesetsUnavailable =
    !!(result.capabilities && result.capabilities.rulesets && result.capabilities.rulesets.ok === false);
  if (result.bootstrap.summary_found && rulesetsUnavailable && hasUnsupportedRulesetSignal(result)) {
    return {
      status: 'degraded_success',
      reason: 'ruleset capability unavailable for this entitlement; bootstrap emitted explicit remediation',
    };
  }

  return { status: 'failed', reason: `bootstrap_exit_${result.bootstrap.exit_code}` };
}

async function probeRepositoryCapabilities({ host, owner, repo, cwd }) {
  const repoPath = `repos/${owner}/${repo}`;
  const rulesetsRaw = await ghApiJson(`${repoPath}/rulesets`, { host, cwd });
  const environmentsRaw = await ghApiJson(`${repoPath}/environments`, { host, cwd });
  const variablesRaw = await ghApiJson(`${repoPath}/actions/variables`, { host, cwd });

  return {
    rulesets: summarizeProbe(rulesetsRaw, (data) => (Array.isArray(data) ? data.length : null)),
    environments: summarizeProbe(
      environmentsRaw,
      (data) => (data && Number.isFinite(data.total_count) ? data.total_count : null)
    ),
    variables: summarizeProbe(
      variablesRaw,
      (data) => (data && Number.isFinite(data.total_count) ? data.total_count : null)
    ),
  };
}

async function deleteRepository({ owner, repo, host, cwd }) {
  const full = `${owner}/${repo}`;
  const env = { ...process.env };
  if (toString(host)) env.GH_HOST = toString(host);
  const res = await runCapture('gh', ['repo', 'delete', full, '--yes'], { cwd, env }).catch((error) => ({
    code: 99,
    stdout: '',
    stderr: String(error && error.message ? error.message : error),
  }));
  return {
    ok: res.code === 0,
    code: res.code,
    error: toString(res.stderr) || toString(res.stdout),
  };
}

async function executeScenario({ sourceRoot, scenario, args }) {
  const timestamp = Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  const repo = `${slug(args.repoPrefix)}-${scenario.kind}-${timestamp}-${suffix}`.slice(0, 90);
  const owner = scenario.owner;
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `baseline-live-${slug(owner)}-`));
  const targetRoot = path.join(tmpRoot, 'target');
  fs.mkdirSync(targetRoot, { recursive: true });

  const bootstrapArgs = [
    path.join(sourceRoot, 'scripts', 'tooling', 'baseline-bootstrap.js'),
    '--to', targetRoot,
    '--mode', 'init',
    '--overwrite',
    '--github',
    '--owner', owner,
    '--repo', repo,
    '--visibility', args.visibility,
    '--yes',
    '--non-interactive',
    '--skip-tests',
  ];
  if (args.dryRunBootstrap) bootstrapArgs.push('--dry-run');

  const startedAt = isoNow();
  const env = withGitIdentityEnv(process.env);
  const runResult = await runCapture(process.execPath, bootstrapArgs, { cwd: sourceRoot, env }).catch((error) => ({
    code: 99,
    stdout: '',
    stderr: String(error && error.message ? error.message : error),
  }));
  const combined = `${toString(runResult.stdout)}\n${toString(runResult.stderr)}`;
  const warnings = parseWarnings(combined);
  const summaryFound = combined.includes('[baseline-bootstrap] Summary:');

  const repoInfoRaw = await ghApiJson(`repos/${owner}/${repo}`, { host: args.host, cwd: sourceRoot });
  const repoInfo = repoInfoRaw.ok ? repoInfoRaw.data : null;
  const capabilities = repoInfo
    ? await probeRepositoryCapabilities({ host: args.host, owner, repo, cwd: sourceRoot })
    : {
        rulesets: { ok: false, count: null, error: 'repo unavailable' },
        environments: { ok: false, count: null, error: 'repo unavailable' },
        variables: { ok: false, count: null, error: 'repo unavailable' },
      };

  let deleted = { ok: false, code: 0, error: 'cleanup disabled' };
  if (args.cleanup && !args.dryRunBootstrap && repoInfo) {
    deleted = await deleteRepository({ owner, repo, host: args.host, cwd: sourceRoot });
  }

  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {}

  return {
    scenario,
    owner,
    repo,
    started_at: startedAt,
    finished_at: isoNow(),
    bootstrap: {
      exit_code: runResult.code,
      summary_found: summaryFound,
      warnings,
      stdout_tail: toString(runResult.stdout).split(/\r?\n/).slice(-30),
      stderr_tail: toString(runResult.stderr).split(/\r?\n/).slice(-30),
    },
    repository: repoInfo
      ? {
          html_url: toString(repoInfo.html_url),
          owner_type: toString(repoInfo.owner && repoInfo.owner.type),
          visibility: toString(repoInfo.visibility),
          private: !!repoInfo.private,
          default_branch: toString(repoInfo.default_branch),
          permissions: repoInfo.permissions || null,
        }
      : null,
    capabilities,
    cleanup: deleted,
  };
}

async function detectGithubIdentity({ host, cwd }) {
  const userRaw = await ghApiJson('user', { host, cwd });
  if (!userRaw.ok || !userRaw.data || !userRaw.data.login) {
    throw new Error(`failed to query authenticated user: ${userRaw.error || 'unknown error'}`);
  }
  const orgsRaw = await ghApiJson('user/orgs', { host, cwd });
  const orgs = orgsRaw.ok && Array.isArray(orgsRaw.data)
    ? orgsRaw.data.map((org) => toString(org && org.login)).filter(Boolean)
    : [];

  const authStatus = await runCapture('gh', ['auth', 'status', '-h', host], { cwd }).catch((error) => ({
    code: 99,
    stdout: '',
    stderr: String(error && error.message ? error.message : error),
  }));
  const scopes = parseScopesFromAuthStatus(`${authStatus.stdout}\n${authStatus.stderr}`);

  return {
    user_login: toString(userRaw.data.login),
    user_type: toString(userRaw.data.type) || 'User',
    org_logins: orgs,
    token_scopes: scopes,
  };
}

async function runLiveVerification(args) {
  const sourceRoot = process.cwd();
  ensureParentDir(args.artifactPath);

  const identity = await detectGithubIdentity({ host: args.host, cwd: sourceRoot });
  const scenarios = buildScenarioMatrix({
    userLogin: identity.user_login,
    orgLogins: identity.org_logins,
    owners: args.owners,
    includeOrgs: args.includeOrgs,
    allOrgs: args.allOrgs,
  });
  if (!scenarios.length) {
    throw new Error('no owner scenarios resolved; provide --owners or ensure gh identity is available');
  }

  const report = {
    generated_at: isoNow(),
    mode: args.execute ? 'execute' : 'preview',
    host: args.host,
    config: {
      visibility: args.visibility,
      repo_prefix: args.repoPrefix,
      cleanup_requested: args.cleanup,
      include_orgs: args.includeOrgs,
      all_orgs: args.allOrgs,
      owners: args.owners,
      fail_on_scenario_error: args.failOnScenarioError,
      dry_run_bootstrap: args.dryRunBootstrap,
    },
    identity,
    scenarios_planned: scenarios,
    results: [],
    summary: {
      total: scenarios.length,
      executed: 0,
      successful: 0,
      degraded_success: 0,
      failed: 0,
    },
  };

  const scopes = Array.isArray(identity.token_scopes) ? identity.token_scopes.map((scope) => toString(scope)) : [];
  const canDeleteRepo = scopes.includes('delete_repo');
  const effectiveCleanup = !!(args.cleanup && canDeleteRepo);
  report.config.cleanup_effective = effectiveCleanup;
  if (args.cleanup && !canDeleteRepo) {
    report.config.cleanup_note = 'delete_repo scope not present; cleanup skipped';
  }

  if (!args.execute) {
    writeJson(args.artifactPath, report);
    info(`preview report: ${path.relative(process.cwd(), args.artifactPath)}`);
    info('no repositories were created (use --execute to run live provisioning validation)');
    return report;
  }

  for (const scenario of scenarios) {
    info(`running scenario ${scenario.kind}:${scenario.owner}`);
    const result = await executeScenario({
      sourceRoot,
      scenario,
      args: {
        ...args,
        cleanup: effectiveCleanup,
      },
    });
    const outcome = classifyScenarioOutcome(result);
    report.results.push({
      ...result,
      outcome,
    });
    report.summary.executed += 1;
    if (outcome.status === 'success') report.summary.successful += 1;
    else if (outcome.status === 'degraded_success') report.summary.degraded_success += 1;
    else report.summary.failed += 1;
  }

  writeJson(args.artifactPath, report);
  info(`report: ${path.relative(process.cwd(), args.artifactPath)}`);
  info(
    `summary: executed=${report.summary.executed} successful=${report.summary.successful} degraded=${report.summary.degraded_success} failed=${report.summary.failed}`
  );

  if (args.failOnScenarioError && report.summary.failed > 0) {
    throw new Error(`live provisioning verification failed for ${report.summary.failed} scenario(s)`);
  }

  return report;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/tooling/github-live-provisioning-verify.js [--execute] [--artifact-path <file>] [--repo-prefix <name>] [--owners user,org:acme] [--all-orgs] [--skip-orgs]\n' +
      '\n' +
      'Live validates baseline --github provisioning against a user/org owner matrix.\n' +
      'Default mode is preview only (no repo creation). Pass --execute to run live scenarios.'
    );
    return;
  }

  await runLiveVerification(args);
}

if (require.main === module) {
  main().catch((error) => {
    die(error && error.message ? error.message : String(error));
  });
}

module.exports = {
  buildScenarioMatrix,
  classifyScenarioOutcome,
  hasUnsupportedRulesetSignal,
  normalizeOwnerToken,
  parseCliArgs,
  parseScopesFromAuthStatus,
  parseWarnings,
  runLiveVerification,
};
