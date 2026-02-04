#!/usr/bin/env node
/**
 * plan-complete.js
 *
 * Marks a canonical plan as `status: done` in-place (without archiving).
 * Required for PR gating because `plans:require:complete` expects:
 *   - plan file remains under docs/ops/plans/
 *   - status is `done`
 *   - all checklist items checked
 *
 * Usage:
 *   node scripts/ops/plan-complete.js --plan PLAN-YYYYMM-<slug>
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { readFrontmatterTopLevel, updateFrontmatter } = require('./plans/frontmatter');

function die(msg) {
  console.error(`[plan-complete] ${msg}`);
  process.exit(1);
}

function parseArgs() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.replace(/^--/, '');
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1';
    out[key] = val;
  }
  return out;
}

function today() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function hasUncheckedSteps(body) {
  return /- \[ \] /m.test(body);
}

function stepChecked(body, step) {
  return new RegExp(`^- \\[(?:x|X)\\] ${step}\\b`, 'm').test(body);
}

function hasCiEvidence(body) {
  return /(CI|Cloud)\s+Evidence\s*:\s*https?:\/\//i.test(body);
}

function hasObjectivesEvidenceStrong(body) {
  return /Objectives Evidence\s*:\s*.*auto-verified at\s+[0-9TZ:.-]+/i.test(body);
}

function main() {
  const args = parseArgs();
  const planId = (args.plan || args.plans || '').trim();
  if (!planId) die('Usage: plan-complete.js --plan PLAN-YYYYMM-<slug>');

  const plansDir = path.join(process.cwd(), 'docs', 'ops', 'plans');
  const planPath = path.join(plansDir, `${planId}.md`);
  if (!fs.existsSync(planPath)) die(`Plan not found: ${planPath}`);

  const body = fs.readFileSync(planPath, 'utf8');
  const fm = readFrontmatterTopLevel(body);

  const statusVal = String(fm.status || '').split('#')[0].trim();
  if (statusVal === 'done') {
    console.log(`[plan-complete] Plan already done: ${planId}`);
    process.exit(0);
  }

  if (hasUncheckedSteps(body)) {
    die(`Plan ${planId} has unchecked checklist items. Check all steps before marking done.`);
  }
  for (const step of ['S98', 'S99']) {
    if (!stepChecked(body, step)) die(`Plan ${planId} is missing checked ${step}.`);
  }
  if (!hasCiEvidence(body)) {
    die(`Plan ${planId} missing CI Evidence (CI run URL). Add a CI Evidence: https://... line in Decisions & Notes first.`);
  }
  if (!hasObjectivesEvidenceStrong(body)) {
    die(`Plan ${planId} missing Objectives Evidence (expected 'Objectives Evidence: auto-verified at <timestamp>'). Run plans:objectives:gate:auto first.`);
  }

  const updatedBody = updateFrontmatter(
    body,
    { status: 'done', updated: today() },
    { preserveCommentKeys: ['status'] }
  );
  fs.writeFileSync(planPath, updatedBody, 'utf8');

  console.log(`[plan-complete] Marked done: ${planId}`);
}

main();
