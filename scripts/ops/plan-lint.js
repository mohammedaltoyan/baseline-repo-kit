#!/usr/bin/env node
/*
 * Plan Linter (Parallel-Friendly)
 * Validates canonical plans (PLAN-YYYYMM-<slug>.md), optional FOCUS.json, and archive hygiene.
 * Policy: No placeholder plans. When zero canonical plans exist, only allow commits that add/modify plan artifacts.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { stripBom } = require('../utils/json');

const root = process.cwd();
const plansDir = path.join(root, 'docs', 'ops', 'plans');
const archiveDir = path.join(plansDir, 'archive');
const focusPath = path.join(plansDir, 'FOCUS.json');

const ALLOWED_STATUS = new Set([
  'draft', 'queued', 'in_progress', 'blocked', 'on_hold', 'done', 'canceled', 'superseded'
]);

function die(msg) { console.error(`[plan-lint] ${msg}`); process.exit(1); }
function warn(msg) { console.warn(`[plan-lint] Warning: ${msg}`); }
function read(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function toBool(value, fallback = false) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return !!fallback;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(raw)) return false;
  return !!fallback;
}
function readEventJson() {
  const evtPath = process.env.GITHUB_EVENT_PATH;
  if (!evtPath || !fs.existsSync(evtPath)) return null;
  try {
    return JSON.parse(stripBom(fs.readFileSync(evtPath, 'utf8')));
  } catch {
    return null;
  }
}
function isDependencyAutomationPrEvent(evt) {
  const pr = evt && evt.pull_request;
  if (!pr) return false;
  const login = String(pr.user && pr.user.login || '').trim().toLowerCase();
  const type = String(pr.user && pr.user.type || '').trim().toLowerCase();
  const headRef = String(pr.head && pr.head.ref || '').trim().toLowerCase();

  const isBot = type === 'bot' || login.endsWith('[bot]') || login.startsWith('app/');
  if (!isBot) return false;

  return (
    login.includes('dependabot') ||
    login.includes('renovate') ||
    headRef.startsWith('dependabot/') ||
    headRef.startsWith('renovate/')
  );
}
function loadBranchPolicy() {
  const file = path.join(root, 'config', 'policy', 'branch-policy.json');
  if (!fs.existsSync(file)) return { integration: '', production: '' };
  try {
    const parsed = JSON.parse(stripBom(fs.readFileSync(file, 'utf8')));
    return {
      integration: String(parsed && parsed.integration_branch || '').trim(),
      production: String(parsed && parsed.production_branch || '').trim(),
    };
  } catch {
    return { integration: '', production: '' };
  }
}
function isReleasePromotionPrEvent(evt, policy) {
  const pr = evt && evt.pull_request;
  if (!pr) return false;
  const integration = String(policy && policy.integration || '').trim();
  const production = String(policy && policy.production || '').trim();
  if (!integration || !production) return false;
  const baseRef = String(pr.base && pr.base.ref || '').trim();
  const headRef = String(pr.head && pr.head.ref || '').trim();
  return baseRef === production && headRef === integration;
}

function parseFrontmatter(content) {
  if (!content) return {};
  const lines = content.split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== '---') return {};
  const data = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '---') break;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim().replace(/^['"]|['"]$/g, '');
      data[key] = val;
    }
  }
  return data;
}

function stepUnchecked(content, stepId) {
  const re = new RegExp(`^- \\[ \\] ${stepId}\\b`, 'm');
  return re.test(content);
}
function stepExists(content, stepId) {
  const re = new RegExp(`^- \\[([ xX])\\] ${stepId}\\b`, 'm');
  return re.test(content);
}
function stepChecked(content, stepId) {
  const re = new RegExp(`^- \\[(?:x|X)\\] ${stepId}\\b`, 'm');
  return re.test(content);
}
function hasUncheckedSteps(content) { return /^- \[ \] S\d{2}\b/m.test(content); }
function hasObjectivesEvidence(content) { return /Objectives Evidence\s*:\s*.+/i.test(content); }
function hasObjectivesEvidenceStrong(content) {
  // Expect an auto-verified marker with a timestamp for done plans
  // e.g., "Objectives Evidence: auto-verified at 2025-01-01T10:00:00.000Z (commit abcdef0)"
  return /Objectives Evidence\s*:\s*.*auto-verified at\s+[0-9TZ:.-]+/i.test(content);
}
function hasCiEvidence(content) { return /(CI|Cloud)\s+Evidence\s*:\s*https?:\/\//i.test(content); }

function isCanonicalPlanFile(fileName) { return /^PLAN-\d{6}-[A-Za-z0-9_.-]+\.md$/.test(fileName); }
function parseDate(d) { const m = /^\d{4}-\d{2}-\d{2}$/.exec(d || ''); if (!m) return null; const [y, mo, da] = d.split('-').map(Number); return new Date(Date.UTC(y, mo - 1, da)); }

// Ensure plans directory exists
if (!fs.existsSync(plansDir)) die(`Missing directory: ${plansDir}`);

// Parse args (optional --only PLAN-ID)
const argv = process.argv.slice(2);
function getArg(name, def = '') {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === name) return argv[i + 1] || def;
    if (a.startsWith(name + '=')) return a.split('=').slice(1).join('=') || def;
  }
  return def;
}
const onlyPlan = getArg('--only', '').trim();

// Collect canonical plan files (exclude archive; --only may target an archived plan)
let files = fs.readdirSync(plansDir).filter(isCanonicalPlanFile);
if (onlyPlan) {
  const fname = onlyPlan.endsWith('.md') ? onlyPlan : `${onlyPlan}.md`;
  const active = path.join(plansDir, fname);
  const archived = path.join(archiveDir, fname);
  if (fs.existsSync(active)) {
    files = [fname];
  } else if (fs.existsSync(archived)) {
    files = [path.join('archive', fname)];
  } else {
    die(`--only specified but plan file not found (active or archived): ${fname}`);
  }
}

// Zero-plan policy:
// - On PRs (GITHUB_EVENT_NAME starts with pull_request), fail if no canonical plans.
// - On non-PR contexts (e.g., main branch, local without PR), allow zero plans so we don't need a placeholder.
if (files.length === 0) {
  const isPR = String(process.env.GITHUB_EVENT_NAME || '').startsWith('pull_request');
  if (isPR) {
    const evt = readEventJson();
    if (isDependencyAutomationPrEvent(evt)) {
      warn('No canonical plans found; allowing zero-plan dependency automation PR context.');
      process.exit(0);
    }
    if (toBool(process.env.RELEASE_PR_BYPASS_PLAN_STEP, false)) {
      const branchPolicy = loadBranchPolicy();
      if (isReleasePromotionPrEvent(evt, branchPolicy)) {
        warn('No canonical plans found; allowing zero-plan release promotion PR context.');
        process.exit(0);
      }
    }
    die('No canonical plans found for PR context. Add a PLAN-YYYYMM-<slug>.md and reference it in the PR body.');
  }
  warn('No canonical plans detected (non-PR context). Skipping plan lint; ensure PRs include a canonical plan.');
  process.exit(0);
}

const activePlans = [];

// Validate each canonical plan
for (const f of files) {
  const body = read(path.join(plansDir, f));
  const fm = parseFrontmatter(body);
  const idFromFile = path.basename(f).replace(/\.md$/, '');
  if (!fm.plan_id) die(`Canonical plan missing plan_id frontmatter: ${f}`);
  if (fm.plan_id !== idFromFile) die(`plan_id mismatch: expected ${idFromFile}, got ${fm.plan_id}`);
  if (!fm.title) die(`Canonical plan missing title: ${f}`);
  if (!fm.status) die(`Canonical plan missing status: ${f}`);
  const statusVal = String(fm.status).split('#')[0].trim();
  if (!ALLOWED_STATUS.has(statusVal)) die(`Invalid status in ${f}: ${fm.status}`);
  if (!fm.updated || !parseDate(fm.updated)) die(`Invalid or missing updated date in ${f}: ${fm.updated || ''}`);

  if (statusVal === 'in_progress') {
    if (!fm.current_step) die(`in_progress plan missing current_step: ${f}`);
    if (!stepExists(body, fm.current_step)) die(`current_step ${fm.current_step} not found in checklist of ${f}`);
    if (!stepUnchecked(body, fm.current_step)) die(`current_step ${fm.current_step} is not unchecked in ${f}`);
    activePlans.push({ id: fm.plan_id, f, updated: fm.updated, owner: fm.owner || '', priority: fm.priority || 'P2' });
  }
  if (statusVal === 'done') {
    if (hasUncheckedSteps(body)) die(`done plan has unchecked steps: ${f}`);
    if (!stepChecked(body, 'S98')) die(`done plan missing checked Objectives Gate (S98): ${f}`);
    if (!stepChecked(body, 'S99')) die(`done plan missing checked Tests Gate (S99): ${f}`);
    if (!hasObjectivesEvidence(body)) die(`done plan missing Objectives Evidence: ${f}`);
    if (!hasObjectivesEvidenceStrong(body)) die(`done plan missing strong Objectives Evidence (expected 'auto-verified at <timestamp>'): ${f}`);
    if (!hasCiEvidence(body)) die(`done plan missing CI Evidence link (CI run URL) in Decisions & Notes: ${f}`);
  }
}

// Validate FOCUS.json JSON when present
const focusBody = read(focusPath);
if (focusBody) {
  try { JSON.parse(stripBom(focusBody)); } catch (e) { die(`Invalid JSON in FOCUS.json: ${e.message}`); }
}

console.log(`[plan-lint] OK ? plans: ${files.length}, active: ${activePlans.length}, queued: ${0}`);
