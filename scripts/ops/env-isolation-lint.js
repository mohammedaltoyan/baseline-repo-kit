#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const { parseFlagArgs } = require('../utils/cli-args');
const { loadRegistryFromFile, resolveDeployEnvName } = require('./deploy-surface-registry');

function toString(value) {
  return String(value == null ? '' : value).trim();
}

function isEnabled(value) {
  const v = toString(value).toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(v);
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => toString(v)).filter(Boolean);
}

function diffKeys(actual, allowed) {
  const allow = new Set(toStringArray(allowed));
  return toStringArray(actual).filter((k) => k && !allow.has(k));
}

function detectRepoFromEnv() {
  const slug = toString(process.env.GITHUB_REPOSITORY);
  if (slug.includes('/')) {
    const [owner, repo] = slug.split('/', 2);
    return { owner, repo };
  }
  return { owner: '', repo: '' };
}

function buildTokenCandidates(...values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const token = toString(value);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

async function fetchJson(url, token) {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'User-Agent': 'baseline-kit-env-isolation-lint',
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return {
    ok: res.ok,
    status: res.status,
    data,
    text,
    acceptedPermissions: toString(res.headers.get('x-accepted-github-permissions')),
    requestId: toString(res.headers.get('x-github-request-id')),
  };
}

async function fetchJsonWithTokenCandidates(url, tokenCandidates) {
  const candidates = toStringArray(tokenCandidates);
  if (!candidates.length) throw new Error('Missing auth token for GitHub API call.');
  let last = null;
  const attempts = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const token = candidates[i];
    const resp = await fetchJson(url, token);
    attempts.push({
      status: resp.status,
      acceptedPermissions: resp.acceptedPermissions,
      requestId: resp.requestId,
    });
    if (resp.ok) return { ...resp, attempts };
    last = resp;
    const retriableAuth = resp.status === 401 || resp.status === 403;
    if (!(retriableAuth && i + 1 < candidates.length)) break;
  }
  return last ? { ...last, attempts } : { ok: false, status: 0, data: null, text: '', attempts };
}

const VALID_AUTHZ_MODES = new Set(['warn', 'strict']);

function resolveAuthzMode(args) {
  const raw = toString(args['authz-mode'] || args.authzMode || process.env.ENV_ISOLATION_LINT_AUTHZ_MODE || 'warn').toLowerCase();
  if (!VALID_AUTHZ_MODES.has(raw)) {
    throw new Error(`Invalid authz mode: ${raw} (expected one of: warn, strict)`);
  }
  return raw;
}

function responseMessage(resp) {
  if (!resp || typeof resp !== 'object') return '';
  const fromData = toString(resp.data && resp.data.message);
  return fromData || toString(resp.text);
}

function isAuthzDeniedResponse(resp) {
  const status = Number(resp && resp.status);
  if (status !== 403) return false;

  const message = responseMessage(resp).toLowerCase();
  if (message.includes('rate limit')) return false;
  if (!message) return true;

  return (
    message.includes('resource not accessible') ||
    message.includes('insufficient') ||
    message.includes('must have admin rights') ||
    message.includes('not authorized') ||
    message.includes('forbidden')
  );
}

function formatAttemptSummary(resp) {
  const attempts = Array.isArray(resp && resp.attempts) ? resp.attempts : [];
  if (!attempts.length) return `status=${Number(resp && resp.status) || 0}`;
  return attempts
    .map((attempt, idx) => {
      const parts = [`attempt${idx + 1}:status=${Number(attempt && attempt.status) || 0}`];
      const accepted = toString(attempt && attempt.acceptedPermissions);
      const requestId = toString(attempt && attempt.requestId);
      if (accepted) parts.push(`accepted=${accepted}`);
      if (requestId) parts.push(`request_id=${requestId}`);
      return parts.join(' ');
    })
    .join(' | ');
}

function authzRemediation(resp) {
  const accepted = toString(resp && resp.acceptedPermissions);
  if (accepted) {
    return `Set ENV_ISOLATION_TOKEN with permissions satisfying: ${accepted}`;
  }
  return 'Set ENV_ISOLATION_TOKEN with repository Environments:read permission (or equivalent GitHub App install permission).';
}

async function listEnvironmentResourceNames({
  apiBase,
  owner,
  repo,
  environment,
  tokenCandidates,
  authzMode,
  resourcePath,
  collectionKey,
  resourceLabel,
}) {
  const base = apiBase || toString(process.env.GITHUB_API_URL) || 'https://api.github.com';
  const out = [];
  const perPage = 100;

  for (let page = 1; page <= 50; page += 1) {
    const url = new URL(`${base.replace(/\/$/, '')}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/environments/${encodeURIComponent(environment)}/${resourcePath}`);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));

    const resp = await fetchJsonWithTokenCandidates(url.toString(), tokenCandidates);
    if (!resp.ok) {
      if (authzMode === 'warn' && isAuthzDeniedResponse(resp)) {
        return {
          names: out,
          skipped: true,
          warning: {
            environment,
            resource: resourceLabel,
            status: Number(resp.status) || 0,
            detail: formatAttemptSummary(resp),
            remediation: authzRemediation(resp),
          },
        };
      }
      throw new Error(
        `list ${resourceLabel} failed env=${environment} ${formatAttemptSummary(resp)} ${toString(resp.text)}`
      );
    }

    const list = resp.data && typeof resp.data === 'object' ? resp.data[collectionKey] : null;
    if (!Array.isArray(list)) {
      throw new Error(`list ${resourceLabel} returned unexpected payload for env=${environment}`);
    }
    for (const entry of list) {
      const name = toString(entry && entry.name);
      if (name) out.push(name);
    }
    if (list.length < perPage) break;
  }

  return {
    names: out,
    skipped: false,
    warning: null,
  };
}

async function listEnvironmentSecrets({ apiBase, owner, repo, environment, tokenCandidates, authzMode }) {
  return listEnvironmentResourceNames({
    apiBase,
    owner,
    repo,
    environment,
    tokenCandidates,
    authzMode,
    resourcePath: 'secrets',
    collectionKey: 'secrets',
    resourceLabel: 'secrets',
  });
}

async function listEnvironmentVariables({ apiBase, owner, repo, environment, tokenCandidates, authzMode }) {
  return listEnvironmentResourceNames({
    apiBase,
    owner,
    repo,
    environment,
    tokenCandidates,
    authzMode,
    resourcePath: 'variables',
    collectionKey: 'variables',
    resourceLabel: 'variables',
  });
}

function loadRegistryOrThrow(registryPath) {
  const rel = toString(registryPath) || toString(process.env.DEPLOY_SURFACES_PATH) || 'config/deploy/deploy-surfaces.json';
  const abs = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(abs)) throw new Error(`Registry missing: ${rel}`);
  const res = loadRegistryFromFile(abs);
  if (!res.loaded || !res.registry) throw new Error(`Unable to load registry: ${rel}`);
  return { absPath: abs, registry: res.registry };
}

async function main() {
  const args = parseFlagArgs(process.argv.slice(2));
  if (args.h || args.help) {
    console.log(
      'Usage: node scripts/ops/env-isolation-lint.js [--enabled <0|1>] [--authz-mode <warn|strict>] [--token <token>] [--registry <path>] [--owner <owner>] [--repo <repo>]\n' +
      '\n' +
      'When enabled, verifies each surface deploy environment contains only allowed secret/var keys (registry SSOT).'
    );
    process.exit(0);
  }

  const enabled = args.enabled === undefined
    ? isEnabled(process.env.ENV_ISOLATION_LINT_ENABLED)
    : isEnabled(args.enabled);
  if (!enabled) {
    console.log('[env-isolation-lint] disabled (ENV_ISOLATION_LINT_ENABLED=0)');
    return;
  }

  const tokenCandidates = buildTokenCandidates(args.token, process.env.ENV_ISOLATION_TOKEN, process.env.GITHUB_TOKEN);
  if (!tokenCandidates.length) {
    throw new Error(
      'ENV_ISOLATION_LINT_ENABLED=1 but no API token is available (set ENV_ISOLATION_TOKEN or provide GITHUB_TOKEN).'
    );
  }
  const authzMode = resolveAuthzMode(args);

  let { owner, repo } = detectRepoFromEnv();
  owner = toString(args.owner) || owner;
  repo = toString(args.repo) || repo;
  if (!owner || !repo) throw new Error('Unable to infer repo. Provide --owner and --repo or set GITHUB_REPOSITORY.');

  const { registry } = loadRegistryOrThrow(args.registry);

  const failures = [];
  const warnings = [];
  for (const surface of registry.surfaces || []) {
    const surfaceId = toString(surface && surface.surface_id);
    if (!surfaceId) continue;

    const allowedSecrets = toStringArray(surface.allowed_secret_keys);
    const allowedVars = toStringArray(surface.allowed_var_keys);

    for (const tier of ['staging', 'production']) {
      const envName = resolveDeployEnvName({ registry, surfaceId, tier });

      const secretsResult = await listEnvironmentSecrets({
        apiBase: toString(args['api-url'] || args.apiUrl),
        owner,
        repo,
        environment: envName,
        tokenCandidates,
        authzMode,
      });
      const varsResult = await listEnvironmentVariables({
        apiBase: toString(args['api-url'] || args.apiUrl),
        owner,
        repo,
        environment: envName,
        tokenCandidates,
        authzMode,
      });
      const secrets = toStringArray(secretsResult && secretsResult.names);
      const vars = toStringArray(varsResult && varsResult.names);
      if (secretsResult && secretsResult.warning) {
        warnings.push({ ...secretsResult.warning, tier, surface: surfaceId });
      }
      if (varsResult && varsResult.warning) {
        warnings.push({ ...varsResult.warning, tier, surface: surfaceId });
      }

      const extraSecrets = diffKeys(secrets, allowedSecrets);
      const extraVars = diffKeys(vars, allowedVars);

      if (extraSecrets.length || extraVars.length) {
        failures.push({
          tier,
          surface: surfaceId,
          environment: envName,
          unexpected_secrets: extraSecrets,
          unexpected_vars: extraVars,
        });
      }
    }
  }

  if (failures.length) {
    console.error(`[env-isolation-lint] FAILED: ${failures.length} environment(s) contain unexpected keys.`);
    for (const f of failures) {
      const s = f.unexpected_secrets || [];
      const v = f.unexpected_vars || [];
      console.error(`[env-isolation-lint] env=${f.environment} tier=${f.tier} surface=${f.surface}`);
      if (s.length) console.error(`[env-isolation-lint]  unexpected secrets: ${s.join(', ')}`);
      if (v.length) console.error(`[env-isolation-lint]  unexpected vars: ${v.join(', ')}`);
    }
    process.exit(1);
  }

  if (warnings.length) {
    console.warn(`[env-isolation-lint] WARN: ${warnings.length} check(s) skipped due to token entitlement limits.`);
    for (const w of warnings) {
      console.warn(
        `[env-isolation-lint]  env=${w.environment} tier=${w.tier} surface=${w.surface} resource=${w.resource} status=${w.status} ${w.detail}`
      );
      console.warn(`[env-isolation-lint]   remediation: ${w.remediation}`);
    }
  }

  console.log(warnings.length ? '[env-isolation-lint] OK (with warnings)' : '[env-isolation-lint] OK');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[env-isolation-lint] failed:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = {
  buildTokenCandidates,
  isEnabled,
  diffKeys,
  isAuthzDeniedResponse,
  resolveAuthzMode,
};
