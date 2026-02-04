#!/usr/bin/env node
/**
 * plan-focus.js
 * Updates docs/ops/plans/FOCUS.json with per-owner focus.
 */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const focusPath = path.join(root, 'docs', 'ops', 'plans', 'FOCUS.json');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { _positionals: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : '1';
      out[key] = val;
      continue;
    }
    out._positionals.push(a);
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

function main() {
  const args = parseArgs();
  let { owner, plan: plan_id, step: current_step } = args;

  // npm@11+ can strip unknown `--flags` even after `--`; accept positional fallback:
  //   plans:focus <owner> <plan_id> <step>
  if ((!owner || !plan_id || !current_step) && Array.isArray(args._positionals) && args._positionals.length >= 3) {
    owner = owner || args._positionals[0];
    plan_id = plan_id || args._positionals[1];
    current_step = current_step || args._positionals[2];
  }
  if (!owner || !plan_id || !current_step) {
    console.error('Usage: plans:focus -- --owner @handle --plan PLAN-YYYYMM-<slug> --step Sxx');
    process.exit(1);
  }

  let focus = { updated: today(), owners: [] };
  try { focus = JSON.parse(fs.readFileSync(focusPath, 'utf8')); } catch {}
  if (!Array.isArray(focus.owners)) focus.owners = [];

  focus.owners = focus.owners.filter(
    (x) => x.owner !== owner && x.plan_id !== plan_id
  );
  focus.owners.push({ owner, plan_id, current_step });

  focus.updated = today();
  fs.writeFileSync(focusPath, JSON.stringify(focus, null, 2) + '\n', 'utf8');
  console.log(`[plan-focus] Set ${owner} -> ${plan_id} / ${current_step}`);

  // Validate reference: canonical or archived
  const plansDir = path.join(root, 'docs', 'ops', 'plans');
  const canonical = path.join(plansDir, `${plan_id}.md`);
  const archived = path.join(plansDir, 'archive', `${plan_id}.md`);
  if (!fs.existsSync(canonical)) {
    if (fs.existsSync(archived)) {
      console.warn(`[plan-focus] Warning: ${plan_id} is archived. Consider clearing or repointing focus.`);
    } else {
      console.warn(`[plan-focus] Warning: ${plan_id} not found under canonical or archive.`);
    }
  }
}

main();
