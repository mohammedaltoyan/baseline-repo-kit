#!/usr/bin/env node
/**
 * plan-archive.js
 * Marks a plan as done/canceled/superseded, updates frontmatter, and moves to archive.
 * Warns if S99 Tests Gate is missing before archiving as done.
 */
const fs = require('fs');
const path = require('path');
const { updateFrontmatter } = require('./plans/frontmatter');

const root = process.cwd();
const plansDir = path.join(root, 'docs', 'ops', 'plans');
const archiveDir = path.join(plansDir, 'archive');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace(/^--/, '');
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : '1';
      out[key] = val;
    }
  }
  return out;
}

function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, body) { fs.writeFileSync(file, body, 'utf8'); }

function today() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function utcStamp() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${da}-${hh}${mm}${ss}`;
}

function checkAllSteps(body) {
  return body.replace(/^- \[ \] (S\d{2}\b.*)$/mg, '- [x] $1');
}

function main() {
  const { plan: plan_id, status, reason, by } = parseArgs();
  if (!plan_id || !status) {
    console.error('Usage: plans:archive -- --plan PLAN-YYYYMM-<slug> --status done|canceled|superseded [--reason "..."] [--by PLAN-YYYYMM-<slug>]');
    process.exit(1);
  }
  if (!['done', 'canceled', 'superseded'].includes(status)) {
    console.error('Status must be one of: done|canceled|superseded');
    process.exit(1);
  }
  const file = path.join(plansDir, `${plan_id}.md`);
  if (!fs.existsSync(file)) {
    console.error(`Plan not found: ${file}`);
    process.exit(1);
  }
  let body = read(file);
  const now = today();
  if (status === 'done') {
    // Warn if Tests Gate is missing
    if (!/- \[[xX]\] S99\b.*Tests Gate/.test(body)) {
      console.warn('[plan-archive] Warning: Tests Gate (S99) not checked. Run plans:gate before archiving.');
    }
    body = checkAllSteps(body);
  } else if (status === 'canceled') {
    if (!reason) {
      console.error('Canceled requires --reason');
      process.exit(1);
    }
  } else if (status === 'superseded') {
    if (!by) {
      console.error('Superseded requires --by PLAN-YYYYMM-<slug>');
      process.exit(1);
    }
  }

  let newBody = updateFrontmatter(body, { status, updated: now }, { preserveCommentKeys: ['status'] });
  if (status === 'canceled') {
    newBody = updateFrontmatter(newBody, { archive_reason: reason }, { insertAfter: { archive_reason: 'status' } });
  } else if (status === 'superseded') {
    newBody = updateFrontmatter(newBody, { superseded_by: by }, { insertAfter: { superseded_by: 'status' } });
  }

  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
  const dest = path.join(archiveDir, path.basename(file));

  if (fs.existsSync(dest)) {
    const existing = read(dest);
    if (existing === newBody) {
      fs.unlinkSync(file);
      console.warn(`[plan-archive] Archive already contains ${plan_id}; removed duplicate active plan file.`);
    } else {
      const dupDir = path.join(archiveDir, 'duplicates');
      if (!fs.existsSync(dupDir)) fs.mkdirSync(dupDir, { recursive: true });
      const dupPath = path.join(dupDir, `${plan_id}--dup-${utcStamp()}.md`);
      write(dupPath, newBody);
      fs.unlinkSync(file);
      console.warn(`[plan-archive] Archive already contains ${plan_id}; moved active copy to ${dupPath}.`);
    }
  } else {
    write(file, newBody);
    fs.renameSync(file, dest);
    console.log(`[plan-archive] Archived ${plan_id} -> ${status}`);
  }

  // Prune focus entries for this plan
  try {
    const focusPath = path.join(plansDir, 'FOCUS.json');
    const focus = JSON.parse(read(focusPath));
    const before = (focus.owners || []).length;
    focus.owners = (focus.owners || []).filter((o) => o.plan_id !== plan_id);
    focus.updated = today();
    if (before !== (focus.owners || []).length) {
      write(focusPath, JSON.stringify(focus, null, 2) + '\n');
      console.log(`[plan-archive] Pruned ${plan_id} from FOCUS.json`);
    }
  } catch (err) {
    console.warn(`[plan-archive] Unable to prune FOCUS.json for ${plan_id}: ${err.message || err}`);
  }
}

main();
