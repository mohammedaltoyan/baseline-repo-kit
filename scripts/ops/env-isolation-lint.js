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
  return { ok: res.ok, status: res.status, data, text };
}

async function fetchJsonWithTokenCandidates(url, tokenCandidates) {
  const candidates = toStringArray(tokenCandidates);
  if (!candidates.length) throw new Error('Missing auth token for GitHub API call.');
  let last = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const token = candidates[i];
    const resp = await fetchJson(url, token);
    if (resp.ok) return resp;
    last = resp;
    const retriableAuth = resp.status === 401 || resp.status === 403;
    if (!(retriableAuth && i + 1 < candidates.length)) break;
  }
  return last;
}

async function listEnvironmentSecrets({ apiBase, owner, repo, environment, tokenCandidates }) {
  const base = apiBase || toString(process.env.GITHUB_API_URL) || 'https://api.github.com';
  const out = [];
  const perPage = 100;
  for (let page = 1; page <= 50; page += 1) {
    const url = new URL(`${base.replace(/\/$/, '')}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/environments/${encodeURIComponent(environment)}/secrets`);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));
    const resp = await fetchJsonWithTokenCandidates(url.toString(), tokenCandidates);
    if (!resp.ok) throw new Error(`list secrets failed env=${environment} status=${resp.status} ${toString(resp.text)}`);
    const list = resp.data && typeof resp.data === 'object' ? resp.data.secrets : null;
    if (!Array.isArray(list)) throw new Error(`list secrets returned unexpected payload for env=${environment}`);
    for (const s of list) {
      const name = toString(s && s.name);
      if (name) out.push(name);
    }
    if (list.length < perPage) break;
  }
  return out;
}

async function listEnvironmentVariables({ apiBase, owner, repo, environment, tokenCandidates }) {
  const base = apiBase || toString(process.env.GITHUB_API_URL) || 'https://api.github.com';
  const out = [];
  const perPage = 100;
  for (let page = 1; page <= 50; page += 1) {
    const url = new URL(`${base.replace(/\/$/, '')}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/environments/${encodeURIComponent(environment)}/variables`);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));
    const resp = await fetchJsonWithTokenCandidates(url.toString(), tokenCandidates);
    if (!resp.ok) throw new Error(`list variables failed env=${environment} status=${resp.status} ${toString(resp.text)}`);
    const list = resp.data && typeof resp.data === 'object' ? resp.data.variables : null;
    if (!Array.isArray(list)) throw new Error(`list variables returned unexpected payload for env=${environment}`);
    for (const v of list) {
      const name = toString(v && v.name);
      if (name) out.push(name);
    }
    if (list.length < perPage) break;
  }
  return out;
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
      'Usage: node scripts/ops/env-isolation-lint.js [--enabled <0|1>] [--token <token>] [--registry <path>] [--owner <owner>] [--repo <repo>]\n' +
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

  let { owner, repo } = detectRepoFromEnv();
  owner = toString(args.owner) || owner;
  repo = toString(args.repo) || repo;
  if (!owner || !repo) throw new Error('Unable to infer repo. Provide --owner and --repo or set GITHUB_REPOSITORY.');

  const { registry } = loadRegistryOrThrow(args.registry);

  const failures = [];
  for (const surface of registry.surfaces || []) {
    const surfaceId = toString(surface && surface.surface_id);
    if (!surfaceId) continue;

    const allowedSecrets = toStringArray(surface.allowed_secret_keys);
    const allowedVars = toStringArray(surface.allowed_var_keys);

    for (const tier of ['staging', 'production']) {
      const envName = resolveDeployEnvName({ registry, surfaceId, tier });

      const secrets = await listEnvironmentSecrets({
        apiBase: toString(args['api-url'] || args.apiUrl),
        owner,
        repo,
        environment: envName,
        tokenCandidates,
      });
      const vars = await listEnvironmentVariables({
        apiBase: toString(args['api-url'] || args.apiUrl),
        owner,
        repo,
        environment: envName,
        tokenCandidates,
      });

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

  console.log('[env-isolation-lint] OK');
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
};
