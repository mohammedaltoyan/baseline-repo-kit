#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseFlagArgs } = require('../utils/cli-args');
const { loadRegistryFromFile, matchSurfacesForPaths } = require('./deploy-surface-registry');

function toString(value) {
  return String(value == null ? '' : value).trim();
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => toString(v)).filter(Boolean);
}

function normalizeRelPath(p) {
  return toString(p)
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '');
}

function die(message) {
  console.error(`[changed-surfaces] ${message}`);
  process.exit(1);
}

function parseFilesArg({ args }) {
  if (args['files-json']) {
    try {
      const parsed = JSON.parse(toString(args['files-json']));
      return toStringArray(parsed).map(normalizeRelPath);
    } catch (e) {
      die(`--files-json is not valid JSON: ${e.message || e}`);
    }
  }

  const csv = toString(args.files);
  if (!csv) return [];
  return csv.split(',').map((s) => normalizeRelPath(s)).filter(Boolean);
}

function gitDiffNames({ baseRef, headRef, cwd }) {
  const base = toString(baseRef);
  const head = toString(headRef);
  if (!base || !head) return [];
  const res = spawnSync('git', ['diff', '--name-only', `${base}...${head}`], { cwd, encoding: 'utf8' });
  if (res.status !== 0) {
    const err = toString(res.stderr || res.stdout);
    die(`git diff failed (base=${base} head=${head}): ${err || 'unknown error'}`);
  }
  return String(res.stdout || '')
    .split(/\r?\n/g)
    .map((s) => normalizeRelPath(s))
    .filter(Boolean);
}

function detectRepoFromEnv() {
  const slug = toString(process.env.GITHUB_REPOSITORY);
  if (slug.includes('/')) {
    const [owner, repo] = slug.split('/', 2);
    return { owner, repo };
  }
  return { owner: '', repo: '' };
}

async function fetchJson(url, token) {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'User-Agent': 'baseline-kit-changed-surfaces',
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

async function listPullRequestFiles({ apiUrl, owner, repo, pullNumber, token }) {
  const n = Number(pullNumber);
  if (!Number.isFinite(n) || n <= 0) die(`invalid --pr "${toString(pullNumber)}"`);
  const base = apiUrl || toString(process.env.GITHUB_API_URL) || 'https://api.github.com';

  const out = [];
  const perPage = 100;
  for (let page = 1; page <= 50; page += 1) {
    const url = new URL(`${base.replace(/\/$/, '')}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${n}/files`);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));
    const resp = await fetchJson(url.toString(), token);
    if (!resp.ok) {
      die(`GitHub API pulls.files failed: ${resp.status} ${resp.text || ''}`.trim());
    }
    if (!Array.isArray(resp.data)) die('GitHub API pulls.files returned non-array payload');

    for (const f of resp.data) {
      const name = normalizeRelPath(f && f.filename);
      if (name) out.push(name);
    }

    if (resp.data.length < perPage) break;
  }

  return out;
}

function loadRegistryMaybe(registryPath) {
  const rel = toString(registryPath) || toString(process.env.DEPLOY_SURFACES_PATH) || 'config/deploy/deploy-surfaces.json';
  const abs = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(abs)) return { loaded: false, path: abs, registry: null };
  return loadRegistryFromFile(abs);
}

async function main() {
  const args = parseFlagArgs(process.argv.slice(2));
  if (args.h || args.help) {
    console.log(
      'Usage: node scripts/ops/changed-surfaces.js [--registry <path>] ( --files <csv> | --files-json <json> | --pr <n> | --base-ref <ref> --ref <ref> )\n' +
      '\n' +
      'Outputs a JSON array of matched surface_ids (per deploy-surfaces registry).'
    );
    process.exit(0);
  }

  const registryResult = loadRegistryMaybe(args.registry);
  const registry = registryResult.registry;

  let files = parseFilesArg({ args });
  const pr = toString(args.pr);
  const baseRef = toString(args['base-ref'] || args.baseRef);
  const headRef = toString(args.ref);

  if (files.length === 0 && pr) {
    const token = toString(args.token || process.env.GITHUB_TOKEN);
    if (!token) die('Missing token for --pr mode (set --token or GITHUB_TOKEN).');

    let { owner, repo } = detectRepoFromEnv();
    owner = toString(args.owner) || owner;
    repo = toString(args.repo) || repo;
    if (!owner || !repo) die('Unable to infer repo. Provide --owner and --repo or set GITHUB_REPOSITORY.');

    files = await listPullRequestFiles({
      apiUrl: toString(args['api-url'] || args.apiUrl),
      owner,
      repo,
      pullNumber: pr,
      token,
    });
  }

  if (files.length === 0 && baseRef && headRef) {
    files = gitDiffNames({ baseRef, headRef, cwd: process.cwd() });
  }

  if (files.length === 0) {
    die('No files resolved. Provide --files/--files-json, or --pr, or --base-ref + --ref.');
  }

  if (!registry) {
    // Registry absent: surface detection is undefined. Defer to caller to select surfaces explicitly.
    console.log('[]');
    return;
  }

  const surfaces = matchSurfacesForPaths({ registry, paths: files });
  console.log(JSON.stringify(surfaces));
}

if (require.main === module) {
  main().catch((err) => die(err && err.message ? err.message : String(err)));
}

module.exports = {
  normalizeRelPath,
  gitDiffNames,
  listPullRequestFiles,
};
