#!/usr/bin/env node
/**
 * plan-archive-backlog.js
 *
 * Archives canonical plans that are already `done|canceled|superseded`, while
 * skipping any plan referenced by an open PR (PR Plan Check requires plans to
 * remain unarchived until merge).
 *
 * Usage:
 *   node scripts/ops/plan-archive-backlog.js
 *   node scripts/ops/plan-archive-backlog.js --status done,canceled --reason "..." --dry-run
 *   node scripts/ops/plan-archive-backlog.js --cancel-nonterminal --reason "bulk reset..." --dry-run
 *   node scripts/ops/plan-archive-backlog.js --skip-open-pr-check
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { readFrontmatterTopLevel } = require('./plans/frontmatter');
const { extractPlanIds } = require('./plans/pr-meta');

function die(msg) {
  console.error(`[plan-archive-backlog] ${msg}`);
  process.exit(1);
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = {
    statusCsv: 'done',
    reason: '',
    by: '',
    repo: '',
    skipPlansCsv: '',
    cancelNonterminal: false,
    dryRun: false,
    skipOpenPrCheck: false,
    noIndex: false,
    limit: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i] || '');
    if (!a) continue;
    if (a === '--status' || a === '--statuses') out.statusCsv = String(argv[++i] || '').trim();
    else if (a.startsWith('--status=')) out.statusCsv = a.split('=').slice(1).join('=').trim();
    else if (a.startsWith('--statuses=')) out.statusCsv = a.split('=').slice(1).join('=').trim();
    else if (a === '--reason') out.reason = String(argv[++i] || '').trim();
    else if (a.startsWith('--reason=')) out.reason = a.split('=').slice(1).join('=').trim();
    else if (a === '--by') out.by = String(argv[++i] || '').trim();
    else if (a.startsWith('--by=')) out.by = a.split('=').slice(1).join('=').trim();
    else if (a === '--repo') out.repo = String(argv[++i] || '').trim();
    else if (a.startsWith('--repo=')) out.repo = a.split('=').slice(1).join('=').trim();
    else if (a === '--skip-plans' || a === '--skip-plan') out.skipPlansCsv = String(argv[++i] || '').trim();
    else if (a.startsWith('--skip-plans=')) out.skipPlansCsv = a.split('=').slice(1).join('=').trim();
    else if (a.startsWith('--skip-plan=')) out.skipPlansCsv = a.split('=').slice(1).join('=').trim();
    else if (a === '--cancel-nonterminal') out.cancelNonterminal = true;
    else if (a === '--limit') out.limit = parseInt(String(argv[++i] || '0'), 10) || 0;
    else if (a.startsWith('--limit=')) out.limit = parseInt(a.split('=').slice(1).join('='), 10) || 0;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--skip-open-pr-check') out.skipOpenPrCheck = true;
    else if (a === '--no-index') out.noIndex = true;
  }
  return out;
}

function getToken() {
  const envToken = String(process.env.PLAN_AUTOMATION_PR_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
  if (envToken) return envToken;
  try {
    const t = execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return String(t || '').trim();
  } catch {
    return '';
  }
}

function parseRepo(full) {
  const v = String(full || '').trim();
  const m = /^([^/]+)\/([^/]+)$/.exec(v);
  return m ? { owner: m[1], repo: m[2] } : { owner: '', repo: '' };
}

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

function getRepoFromGitRemote() {
  const url = sh('git config --get remote.origin.url');
  const m = url.match(/github.com[:/](.+?)\/(.+?)(\.git)?$/i);
  if (!m) return { owner: '', repo: '' };
  return { owner: m[1], repo: m[2] };
}

async function ghListOpenPrs({ owner, repo, token }) {
  const prs = [];
  let page = 1;
  while (true) {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&per_page=100&page=${page}`;
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'baseline-kit-plan-archive-backlog',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub API ${res.status} for ${url}: ${text || res.statusText}`);
    }
    // eslint-disable-next-line no-await-in-loop
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    prs.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return prs;
}

async function getOpenPrReferencedPlanIds({ owner, repo, token }) {
  const ids = new Set();
  const prs = await ghListOpenPrs({ owner, repo, token });
  for (const pr of prs) {
    const body = String(pr && pr.body || '');
    for (const id of extractPlanIds(body)) ids.add(id);
  }
  return ids;
}

function isCanonicalPlanFile(fileName) {
  return /^PLAN-\d{6}-[A-Za-z0-9_.-]+\.md$/.test(fileName);
}

function statusFromFrontmatter(fm) {
  return String(fm && fm.status || '').split('#')[0].trim();
}

function getPlanCandidates({ plansDir, allowedStatuses, cancelNonterminal }) {
  const nonterminal = new Set(['draft', 'queued', 'in_progress', 'blocked', 'on_hold']);
  const entries = fs.readdirSync(plansDir).filter(isCanonicalPlanFile);
  const out = [];
  for (const f of entries) {
    const planId = f.replace(/\.md$/, '');
    if (planId.startsWith('PLAN-2099')) continue;
    const full = path.join(plansDir, f);
    let body = '';
    try { body = fs.readFileSync(full, 'utf8'); } catch { continue; }
    const fm = readFrontmatterTopLevel(body);
    const status = statusFromFrontmatter(fm);
    if (!allowedStatuses.has(status)) continue;
    out.push({
      planId,
      status,
      archiveStatus: (cancelNonterminal && nonterminal.has(status)) ? 'canceled' : status,
      archive_reason: String(fm.archive_reason || '').trim(),
      superseded_by: String(fm.superseded_by || '').trim(),
    });
  }
  return out;
}

function runNode(scriptPath, args) {
  const res = spawnSync(process.execPath, [scriptPath, ...args], { stdio: 'inherit', env: process.env });
  const code = typeof res.status === 'number' ? res.status : 1;
  if (code !== 0) die(`${path.basename(scriptPath)} failed (code ${code})`);
}

async function main() {
  const args = parseArgs();

  const terminalStatuses = new Set(
    String(args.statusCsv || '')
      .split(',')
      .map((s) => String(s || '').trim())
      .filter(Boolean)
  );
  for (const s of terminalStatuses) {
    if (!['done', 'canceled', 'superseded'].includes(s)) {
      die(`Invalid --status entry '${s}' (allowed: done,canceled,superseded)`);
    }
  }
  if (terminalStatuses.size === 0) die('Missing --status (expected done,canceled,superseded)');
  if (args.cancelNonterminal && !args.reason) {
    die('--cancel-nonterminal requires --reason "<why these plans were canceled>"');
  }

  const allowedStatuses = new Set(terminalStatuses);
  if (args.cancelNonterminal) {
    for (const s of ['draft', 'queued', 'in_progress', 'blocked', 'on_hold']) allowedStatuses.add(s);
  }

  const root = process.cwd();
  const plansDir = path.join(root, 'docs', 'ops', 'plans');
  if (!fs.existsSync(plansDir)) die(`Missing plans dir: ${plansDir}`);

  let referenced = new Set();
  let detectedRepo = { owner: '', repo: '' };
  const token = args.skipOpenPrCheck ? '' : getToken();

  const explicitRepo = parseRepo(args.repo);
  const envRepo = parseRepo(process.env.GITHUB_REPOSITORY);
  detectedRepo = (explicitRepo.owner && explicitRepo.repo) ? explicitRepo : (envRepo.owner && envRepo.repo ? envRepo : getRepoFromGitRemote());

  if (!args.skipOpenPrCheck) {
    if (!token) die('Missing GITHUB_TOKEN (or GH_TOKEN / PLAN_AUTOMATION_PR_TOKEN). Use --skip-open-pr-check to override.');
    if (!detectedRepo.owner || !detectedRepo.repo) {
      die('Unable to resolve repo (set GITHUB_REPOSITORY or pass --repo owner/repo or configure origin remote).');
    }

    console.log(`[plan-archive-backlog] Resolving open PR plan references from ${detectedRepo.owner}/${detectedRepo.repo}...`);
    referenced = await getOpenPrReferencedPlanIds({ owner: detectedRepo.owner, repo: detectedRepo.repo, token });
    console.log(`[plan-archive-backlog] Open PR referenced plan ids: ${referenced.size}`);
  }

  const skipPlans = new Set();
  for (const id of String(args.skipPlansCsv || '').split(',').map((s) => String(s || '').trim()).filter(Boolean)) {
    if (/^PLAN-\d{6}-[A-Za-z0-9_.-]+$/.test(id)) skipPlans.add(id);
  }

  const candidates = getPlanCandidates({ plansDir, allowedStatuses, cancelNonterminal: args.cancelNonterminal });
  const toArchive = [];
  const skipped = [];
  for (const c of candidates) {
    if (skipPlans.has(c.planId)) {
      skipped.push(`${c.planId} (skip)`);
      continue;
    }
    if (referenced.has(c.planId)) {
      skipped.push(c.planId);
      continue;
    }
    toArchive.push(c);
    if (args.limit > 0 && toArchive.length >= args.limit) break;
  }

  console.log(`[plan-archive-backlog] Candidates (${candidates.length}) -> archive (${toArchive.length}), skipped (${skipped.length})`);
  if (skipped.length) console.log(`[plan-archive-backlog] Skipped: ${skipped.slice(0, 50).join(', ')}${skipped.length > 50 ? ` (+${skipped.length - 50} more)` : ''}`);

  if (toArchive.length === 0) {
    if (!args.noIndex) runNode(path.join('scripts', 'ops', 'plan-index.js'), []);
    console.log('[plan-archive-backlog] Nothing to archive.');
    return;
  }

  if (args.dryRun) {
    console.log('[plan-archive-backlog] Dry run. Plans to archive:');
    for (const p of toArchive) console.log(`- ${p.planId} (${p.status})`);
    return;
  }

  const archiveScript = path.join('scripts', 'ops', 'plan-archive.js');
  for (const p of toArchive) {
    const pass = ['--plan', p.planId, '--status', p.archiveStatus];
    if (p.archiveStatus === 'canceled') {
      const reason = p.archive_reason || args.reason;
      if (!reason) die(`Plan ${p.planId} is canceled but missing archive_reason (pass --reason or set archive_reason in frontmatter).`);
      pass.push('--reason', reason);
    }
    if (p.archiveStatus === 'superseded') {
      const by = p.superseded_by || args.by;
      if (!by) die(`Plan ${p.planId} is superseded but missing superseded_by (pass --by or set superseded_by in frontmatter).`);
      pass.push('--by', by);
    }
    runNode(archiveScript, pass);
  }

  if (!args.noIndex) runNode(path.join('scripts', 'ops', 'plan-index.js'), []);
  console.log(`[plan-archive-backlog] Archived ${toArchive.length} plan(s).`);
}

main().catch((e) => die(e && e.message ? e.message : String(e)));
