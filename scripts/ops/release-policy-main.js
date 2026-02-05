#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const { loadBranchPolicyConfig } = require('./branch-policy');

function die(message) {
  console.error(`[release-policy-main] ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`[release-policy-main] ${message}`);
}

function toString(value) {
  return String(value == null ? '' : value).trim();
}

function toBool(value, fallback) {
  const raw = toString(value).toLowerCase();
  if (!raw) return !!fallback;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(raw)) return false;
  return !!fallback;
}

function parseApproverLogins(raw) {
  const text = toString(raw);
  if (!text) return [];
  const out = [];
  const seen = new Set();
  const parts = text.split(/[,\s]+/g);
  for (const part of parts) {
    const login = toString(part).replace(/^@/, '').toLowerCase();
    if (!login || seen.has(login)) continue;
    seen.add(login);
    out.push(login);
  }
  return out;
}

function parseRepo(full) {
  const value = toString(full);
  const m = /^([^/]+)\/([^/]+)$/.exec(value);
  if (!m) return { owner: '', repo: '' };
  return { owner: m[1], repo: m[2] };
}

function readEventJson() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const args = { base: '', head: '', author: '', approvers: '', approved: '' };
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i++) {
    const token = toString(list[i]);
    if (!token.startsWith('--')) continue;
    const key = token.replace(/^--/, '');
    const value = toString(list[i + 1]);
    if (['base', 'head', 'author', 'approvers', 'approved'].includes(key)) {
      args[key] = value;
      i += 1;
    }
  }
  return args;
}

function startsWithAnyPrefix(value, prefixes) {
  const v = toString(value);
  if (!v) return false;
  const list = Array.isArray(prefixes) ? prefixes : [];
  return list.some((prefix) => {
    const normalized = toString(prefix);
    return normalized ? v.startsWith(normalized) : false;
  });
}

function extractPrNumbersFromMergeGroup(evt) {
  const mg = evt && evt.merge_group;
  if (!mg) return [];

  const out = new Set();
  const rows = Array.isArray(mg.pull_requests) ? mg.pull_requests : [];
  for (const row of rows) {
    const n = parseInt(toString(row && (row.number || row.pull_request_number || row.pr_number)), 10);
    if (n) out.add(n);
  }

  const headRef = toString(mg.head_ref);
  const re = /pr-(\d+)/gi;
  let m;
  while ((m = re.exec(headRef)) !== null) {
    const n = parseInt(toString(m[1]), 10);
    if (n) out.add(n);
  }

  return Array.from(out);
}

async function ghRequestJson({ token, url }) {
  const t = toString(token);
  if (!t) throw new Error('Missing GITHUB_TOKEN');
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${t}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'baseline-kit-release-policy-main',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status} for ${url}: ${body || res.statusText}`);
  }
  return res.json();
}

async function fetchPr({ owner, repo, prNumber, token }) {
  const url =
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(String(prNumber))}`;
  return ghRequestJson({ token, url });
}

async function fetchPrReviews({ owner, repo, prNumber, token }) {
  const out = [];
  const perPage = 100;
  for (let page = 1; page <= 10; page++) {
    const url =
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
      `/pulls/${encodeURIComponent(String(prNumber))}/reviews?per_page=${perPage}&page=${page}`;
    // eslint-disable-next-line no-await-in-loop
    const rows = await ghRequestJson({ token, url });
    const list = Array.isArray(rows) ? rows : [];
    out.push(...list);
    if (list.length < perPage) break;
  }
  return out;
}

function approvedReviewersByLatestState(reviews) {
  const latest = new Map();
  const list = Array.isArray(reviews) ? reviews : [];
  for (const row of list) {
    const login = toString(row && row.user && row.user.login).replace(/^@/, '').toLowerCase();
    const state = toString(row && row.state).toUpperCase();
    if (!login || !state) continue;
    latest.set(login, state);
  }
  const out = new Set();
  for (const [login, state] of latest.entries()) {
    if (state === 'APPROVED') out.add(login);
  }
  return out;
}

function evaluateMainApprovalGate({ requiredApprovers, authorLogin, approvedReviewers, allowSoloAuthorFallback }) {
  const required = parseApproverLogins((requiredApprovers || []).join(' '));
  const author = toString(authorLogin).replace(/^@/, '').toLowerCase();
  const approved = new Set(
    Array.from(approvedReviewers || [])
      .map((v) => toString(v).replace(/^@/, '').toLowerCase())
      .filter(Boolean)
  );

  if (required.length === 0) return { ok: true, reason: 'no-required-approvers' };

  const nonAuthorRequired = required.filter((login) => login !== author);
  const nonAuthorApprovals = nonAuthorRequired.filter((login) => approved.has(login));
  if (nonAuthorApprovals.length > 0) {
    return { ok: true, reason: `approved-by-required-reviewer:${nonAuthorApprovals.join(',')}` };
  }

  if (nonAuthorRequired.length === 0) {
    if (approved.has(author)) return { ok: true, reason: `approved-by-author:${author}` };
    if (allowSoloAuthorFallback) return { ok: true, reason: `solo-author-fallback:${author || '<unknown>'}` };
  }

  return {
    ok: false,
    reason:
      `missing-required-approval(required=${required.join(',') || '<none>'}; ` +
      `approved=${Array.from(approved).join(',') || '<none>'}; author=${author || '<unknown>'})`,
  };
}

async function resolveContexts({ args, branchPolicy }) {
  if (args.base && args.head) {
    return [{
      prNumber: 0,
      baseRef: args.base,
      headRef: args.head,
      authorLogin: args.author,
      approvedReviewers: parseApproverLogins(args.approved),
    }];
  }

  const evt = readEventJson();
  if (!evt) {
    die('Missing GitHub event payload. Run in CI or pass --base/--head for local checks.');
  }

  if (evt.pull_request) {
    return [{
      prNumber: parseInt(toString(evt.pull_request.number), 10) || 0,
      baseRef: toString(evt.pull_request.base && evt.pull_request.base.ref),
      headRef: toString(evt.pull_request.head && evt.pull_request.head.ref),
      authorLogin: toString(evt.pull_request.user && evt.pull_request.user.login),
      approvedReviewers: null,
    }];
  }

  if (evt.merge_group) {
    const prNumbers = extractPrNumbersFromMergeGroup(evt);
    if (prNumbers.length === 0) die('Unable to resolve PR number(s) from merge_group event.');

    const { owner, repo } = parseRepo(process.env.GITHUB_REPOSITORY);
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
    if (!owner || !repo || !token) {
      die('Missing GITHUB_REPOSITORY or GITHUB_TOKEN for merge_group release policy checks.');
    }

    const out = [];
    for (const prNumber of prNumbers) {
      // eslint-disable-next-line no-await-in-loop
      const pr = await fetchPr({ owner, repo, prNumber, token });
      out.push({
        prNumber,
        baseRef: toString(pr && pr.base && pr.base.ref),
        headRef: toString(pr && pr.head && pr.head.ref),
        authorLogin: toString(pr && pr.user && pr.user.login),
        approvedReviewers: null,
      });
    }
    return out;
  }

  if (evt.workflow_dispatch || evt.workflow_run) {
    return [{
      prNumber: 0,
      baseRef: toString(process.env.PR_BASE_REF) || branchPolicy.production_branch,
      headRef: toString(process.env.PR_HEAD_REF) || branchPolicy.integration_branch,
      authorLogin: toString(process.env.PR_AUTHOR_LOGIN),
      approvedReviewers: parseApproverLogins(toString(process.env.PR_APPROVED_LOGINS)),
    }];
  }

  die('Unsupported event for release policy check.');
  return [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const branchPolicy = loadBranchPolicyConfig(process.cwd()).config;
  const contexts = await resolveContexts({ args, branchPolicy });

  const { owner, repo } = parseRepo(process.env.GITHUB_REPOSITORY);
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

  const requiredApprovers = parseApproverLogins(
    args.approvers || process.env.MAIN_REQUIRED_APPROVER_LOGINS || ''
  );
  const allowSoloAuthorFallback = toBool(process.env.MAIN_APPROVER_ALLOW_AUTHOR_FALLBACK, true);

  for (const ctx of contexts) {
    const baseRef = toString(ctx.baseRef);
    const headRef = toString(ctx.headRef);
    const prLabel = ctx.prNumber ? `#${ctx.prNumber}` : '<local>';

    if (!baseRef || !headRef) die(`PR ${prLabel}: missing base/head references.`);
    if (baseRef !== branchPolicy.production_branch) {
      info(`PR ${prLabel}: base=${baseRef} is not production (${branchPolicy.production_branch}); skip.`);
      continue;
    }

    const releaseFromIntegration = headRef === branchPolicy.integration_branch;
    const hotfixToProduction = startsWithAnyPrefix(headRef, branchPolicy.hotfix_branch_prefixes);
    if (!releaseFromIntegration && !hotfixToProduction) {
      die(
        `PR ${prLabel}: base=${baseRef} must come from ${branchPolicy.integration_branch} or ` +
        `hotfix branch (${branchPolicy.hotfix_branch_prefixes.join(', ') || 'hotfix/'}). Found head=${headRef}.`
      );
    }

    if (requiredApprovers.length === 0) {
      info(`PR ${prLabel}: no MAIN_REQUIRED_APPROVER_LOGINS configured; gate passes.`);
      continue;
    }

    let approved = new Set();
    if (ctx.approvedReviewers && ctx.approvedReviewers.length > 0) {
      approved = new Set(ctx.approvedReviewers);
    } else {
      if (!ctx.prNumber) {
        die(`PR ${prLabel}: missing PR number; cannot evaluate reviews.`);
      }
      if (!owner || !repo || !token) {
        die(`PR ${prLabel}: missing GITHUB_REPOSITORY or GITHUB_TOKEN; cannot evaluate reviews.`);
      }
      // eslint-disable-next-line no-await-in-loop
      const reviews = await fetchPrReviews({ owner, repo, prNumber: ctx.prNumber, token });
      approved = approvedReviewersByLatestState(reviews);
    }

    const result = evaluateMainApprovalGate({
      requiredApprovers,
      authorLogin: ctx.authorLogin,
      approvedReviewers: approved,
      allowSoloAuthorFallback,
    });
    if (!result.ok) die(`PR ${prLabel}: ${result.reason}`);

    info(`PR ${prLabel}: ${result.reason}`);
  }
}

if (require.main === module) {
  main().catch((e) => die(e && e.message ? e.message : String(e)));
}

module.exports = {
  approvedReviewersByLatestState,
  evaluateMainApprovalGate,
  parseApproverLogins,
};
