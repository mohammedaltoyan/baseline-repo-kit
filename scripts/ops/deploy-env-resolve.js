#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const { parseFlagArgs } = require('../utils/cli-args');
const { loadRegistryFromFile, resolveDeployEnvName, normalizeTier, normalizeComponent } = require('./deploy-surface-registry');

function toString(value) {
  return String(value == null ? '' : value).trim();
}

function parseDeployEnvMap(raw) {
  const text = toString(raw);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function detectRepoFromEnv() {
  const slug = toString(process.env.GITHUB_REPOSITORY);
  if (slug.includes('/')) {
    const [owner, repo] = slug.split('/', 2);
    return { owner, repo };
  }
  return { owner: '', repo: '' };
}

async function fetchRepoVariable({ owner, repo, name, token, apiUrl }) {
  const base = apiUrl || toString(process.env.GITHUB_API_URL) || 'https://api.github.com';
  const url = new URL(`${base.replace(/\/$/, '')}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/variables/${encodeURIComponent(name)}`);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'baseline-kit-deploy-env-resolve',
    },
  });

  if (res.status === 404) return { found: false, value: '' };
  const text = await res.text();
  if (!res.ok) throw new Error(`GitHub API actions.variables.get failed: ${res.status} ${text}`.trim());
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  const value = toString(data && data.value);
  return { found: true, value };
}

function buildLegacyKey({ component, tier }) {
  const c = toString(component).toUpperCase().replace(/-/g, '_');
  const t = toString(tier).toUpperCase();
  return `DEPLOY_ENV_${c}_${t}`;
}

async function resolveDeployEnvironment({
  cwd,
  tier,
  component,
  registryPath,
  deployEnvMapJson,
  token,
  owner,
  repo,
  apiUrl,
}) {
  const t = normalizeTier(tier);
  if (!t) throw new Error(`Invalid tier "${toString(tier)}" (expected staging|production).`);
  const c = normalizeComponent(component);
  if (!c) throw new Error(`Invalid component "${toString(component)}" (expected a safe token like "application").`);

  const relRegistry = toString(registryPath) || toString(process.env.DEPLOY_SURFACES_PATH) || 'config/deploy/deploy-surfaces.json';
  const absRegistry = path.resolve(cwd || process.cwd(), relRegistry);

  if (fs.existsSync(absRegistry)) {
    const loaded = loadRegistryFromFile(absRegistry);
    if (!loaded.registry) throw new Error(`Unable to load registry at ${relRegistry}`);
    const envName = resolveDeployEnvName({ registry: loaded.registry, surfaceId: c, tier: t });
    return { envName, tier: t, component: c, source: 'registry', registryPath: relRegistry };
  }

  const map = parseDeployEnvMap(deployEnvMapJson);
  const fromMap = map && map[c] && typeof map[c] === 'object' ? toString(map[c][t]) : '';
  if (fromMap) return { envName: fromMap, tier: t, component: c, source: 'map_json', registryPath: relRegistry };

  const legacyKey = buildLegacyKey({ component: c, tier: t });
  const tok = toString(token || process.env.GITHUB_TOKEN);
  let repoOwner = toString(owner);
  let repoName = toString(repo);
  if (!repoOwner || !repoName) {
    const detected = detectRepoFromEnv();
    repoOwner = repoOwner || detected.owner;
    repoName = repoName || detected.repo;
  }

  if (!tok || !repoOwner || !repoName) {
    throw new Error(
      `Unable to resolve GitHub environment for component="${c}" tier="${t}".\n` +
      `Fix: add an entry to DEPLOY_ENV_MAP_JSON, or set legacy repo variable ${legacyKey}.`
    );
  }

  const got = await fetchRepoVariable({ owner: repoOwner, repo: repoName, name: legacyKey, token: tok, apiUrl });
  const legacyValue = toString(got && got.value);
  if (legacyValue) return { envName: legacyValue, tier: t, component: c, source: 'legacy_var', legacyKey, registryPath: relRegistry };

  throw new Error(
    `Unable to resolve GitHub environment for component="${c}" tier="${t}".\n` +
    `Fix: add an entry to DEPLOY_ENV_MAP_JSON for this component/tier, or set legacy repo variable ${legacyKey}.`
  );
}

function appendOutput(name, value) {
  const outPath = toString(process.env.GITHUB_OUTPUT);
  const line = `${name}=${toString(value).replace(/\n/g, ' ')}`.trim() + '\n';
  if (outPath) {
    fs.appendFileSync(outPath, line, 'utf8');
  } else {
    process.stdout.write(line);
  }
}

async function main() {
  const args = parseFlagArgs(process.argv.slice(2));
  if (args.h || args.help) {
    console.log(
      'Usage: node scripts/ops/deploy-env-resolve.js --tier <staging|production> --component <id> [--registry <path>]\n' +
      '\n' +
      'Reads deploy surfaces registry when present; otherwise falls back to DEPLOY_ENV_MAP_JSON and legacy DEPLOY_ENV_<COMPONENT>_<TIER> vars.'
    );
    process.exit(0);
  }

  const tier = toString(args.tier || process.env.TIER);
  const component = toString(args.component || process.env.COMPONENT || 'application');

  const result = await resolveDeployEnvironment({
    cwd: process.cwd(),
    tier,
    component,
    registryPath: toString(args.registry),
    deployEnvMapJson: toString(args['deploy-env-map-json'] || args.deployEnvMapJson || process.env.DEPLOY_ENV_MAP_JSON),
    token: toString(args.token || process.env.GITHUB_TOKEN),
    owner: toString(args.owner),
    repo: toString(args.repo),
    apiUrl: toString(args['api-url'] || args.apiUrl),
  });

  appendOutput('github_environment', result.envName);
  appendOutput('tier', result.tier);
  appendOutput('component', result.component);
  appendOutput('source', result.source);
  appendOutput('registry_path', result.registryPath);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[deploy-env-resolve] failed:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = {
  parseDeployEnvMap,
  buildLegacyKey,
  resolveDeployEnvironment,
};

