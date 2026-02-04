#!/usr/bin/env node
/**
 * plan-advance.js
 * Advances current_step for a canonical plan after verifying the step exists and is unchecked.
 */
const fs = require('fs');
const path = require('path');
const { updateFrontmatter } = require('./plans/frontmatter');

const root = process.cwd();
const plansDir = path.join(root, 'docs', 'ops', 'plans');

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

function main() {
  const { plan: plan_id, to, owner } = parseArgs();
  if (!plan_id || !to) {
    console.error('Usage: plans:advance -- --plan PLAN-YYYYMM-<slug> --to Sxx [--owner @handle]');
    process.exit(1);
  }
  const file = path.join(plansDir, `${plan_id}.md`);
  if (!fs.existsSync(file)) {
    console.error(`Plan not found: ${file}`);
    process.exit(1);
  }
  const body = read(file);
  const reExists = new RegExp(`^- \\[([ xX])\\] ${to}\\b`, 'm');
  const reUnchecked = new RegExp(`^- \\[ \\] ${to}\\b`, 'm');
  if (!reExists.test(body)) {
    console.error(`Step ${to} not found in checklist of ${plan_id}`);
    process.exit(1);
  }
  if (!reUnchecked.test(body)) {
    console.error(`Step ${to} is not currently unchecked in ${plan_id}`);
    process.exit(1);
  }
  const normalizeOwner = (raw) => {
    const v = String(raw || '').trim();
    if (!v || v === '1') return '';
    if (v.startsWith('@')) return v;
    if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(v)) return `@${v}`;
    return v;
  };
  const resolvedOwner = normalizeOwner(owner);

  const updates = {
    current_step: to,
    updated: today(),
    ...(resolvedOwner ? { owner: resolvedOwner } : {}),
  };

  const newBody = updateFrontmatter(body, updates);
  write(file, newBody);
  console.log(`[plan-advance] ${plan_id} -> ${to}`);
}

main();

