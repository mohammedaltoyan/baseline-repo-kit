#!/usr/bin/env node
/**
 * release-pr-open.js
 *
 * Opens (or refreshes) the canonical release PR: integration -> production (defaults: dev -> main).
 *
 * Why:
 * - Keeps production strict (required checks + required reviews).
 * - Avoids solo-maintainer deadlocks by authoring the PR as a bot (GitHub Actions).
 *
 * Inputs (env; optional unless noted):
 * - GITHUB_TOKEN (required) - token to call GitHub API
 * - GITHUB_REPOSITORY (required) - owner/repo
 * - GITHUB_API_URL (optional; defaults to https://api.github.com)
 *
 * Optional overrides:
 * - RELEASE_PR_TITLE - custom PR title (default: "chore(release): promote <integration> -> <production>")
 * - RELEASE_PR_DRAFT - "1" to open as draft
 * - RELEASE_PR_UPDATE_EXISTING - "1" to update title/body when an open release PR already exists (default: 1)
 * - RELEASE_PR_PLAN - optional plan id to include in body (when your PR policy requires it)
 * - RELEASE_PR_STEP - optional step (Sxx) to include in body
 */
/* eslint-disable no-console */
'use strict';

const { loadBranchPolicyConfig } = require('./branch-policy');

function die(msg) {
  console.error(`[release-pr] ${msg}`);
  process.exit(1);
}

function info(msg) {
  console.log(`[release-pr] ${msg}`);
}

function toString(value) {
  return String(value == null ? '' : value).trim();
}

function toBool(value, fallback = false) {
  const raw = toString(value).toLowerCase();
  if (!raw) return !!fallback;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(raw)) return false;
  return !!fallback;
}

function parseRepoSlug(value) {
  const full = toString(value);
  const m = /^([^/]+)\/([^/]+)$/.exec(full);
  return m ? { owner: m[1], repo: m[2] } : { owner: '', repo: '' };
}

async function ghJson({ token, apiBase, method, path, body }) {
  const t = toString(token);
  if (!t) throw new Error('Missing GITHUB_TOKEN.');
  const base = toString(apiBase) || 'https://api.github.com';
  const url = `${base.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;

  const res = await fetch(url, {
    method: method || 'GET',
    headers: {
      authorization: `Bearer ${t}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'baseline-kit-release-pr-open',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} ${method || 'GET'} ${path}: ${text || res.statusText}`);
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
  const b = toString(base);
  if (!o || !r || !h || !b) return null;

  const params = new URLSearchParams({
    state: 'open',
    head: `${o}:${h}`,
    base: b,
    per_page: '100',
  });
  const rows = await ghJson({
    token,
    apiBase,
    method: 'GET',
    path: `/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}/pulls?${params}`,
  });
  const list = Array.isArray(rows) ? rows : [];
  return list[0] || null;
}

function buildReleasePrTitle({ integration, production, overrideTitle }) {
  const custom = toString(overrideTitle);
  if (custom) return custom;
  return `chore(release): promote ${integration} -> ${production}`;
}

function buildReleasePrBody({ integration, production, planId, step }) {
  const pid = toString(planId);
  const s = toString(step).toUpperCase();

  const meta = [];
  if (pid) meta.push(`Plan: ${pid}`);
  if (s) meta.push(`Step: ${s}`);

  return [
    ...(meta.length ? [...meta, ''] : []),
    '## Summary',
    `- Release promotion PR opened by GitHub Actions (\`${integration}\` -> \`${production}\`).`,
    '',
    '## Verification',
    '- [ ] Required checks green',
    '- [ ] Deploy staging (optional)',
    '- [ ] Promote production (if applicable)',
    '',
  ].join('\n');
}

async function main() {
  const token = toString(process.env.GITHUB_TOKEN) || toString(process.env.GH_TOKEN);
  const { owner, repo } = parseRepoSlug(process.env.GITHUB_REPOSITORY);
  if (!owner || !repo) die('Missing/invalid GITHUB_REPOSITORY (expected owner/repo).');

  const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';
  const cfg = loadBranchPolicyConfig(process.cwd()).config;
  const integration = toString(cfg.integration_branch) || 'dev';
  const production = toString(cfg.production_branch) || 'main';
  if (integration === production) die(`Invalid branch policy: integration_branch equals production_branch (${integration}).`);

  const draft = toBool(process.env.RELEASE_PR_DRAFT, false);
  const updateExisting = toBool(process.env.RELEASE_PR_UPDATE_EXISTING, true);
  const title = buildReleasePrTitle({
    integration,
    production,
    overrideTitle: process.env.RELEASE_PR_TITLE,
  });
  const body = buildReleasePrBody({
    integration,
    production,
    planId: process.env.RELEASE_PR_PLAN,
    step: process.env.RELEASE_PR_STEP,
  });

  const existing = await findExistingPr({ token, apiBase, owner, repo, head: integration, base: production });
  if (existing && existing.number) {
    const url = existing.html_url || existing.url || '';
    if (updateExisting) {
      await ghJson({
        token,
        apiBase,
        method: 'PATCH',
        path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(String(existing.number))}`,
        body: { title, body },
      });
      info(`Release PR updated: ${url || `#${existing.number}`}`);
      return;
    }
    info(`Release PR already open: ${url || `#${existing.number}`}`);
    return;
  }

  const created = await ghJson({
    token,
    apiBase,
    method: 'POST',
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    body: {
      title,
      head: integration,
      base: production,
      body,
      draft,
    },
  });

  const url = created && (created.html_url || created.url);
  info(`Release PR created: ${url || '<unknown>'}`);
}

if (require.main === module) {
  main().catch((e) => die(e && e.message ? e.message : String(e)));
}

module.exports = {
  buildReleasePrBody,
  buildReleasePrTitle,
};

