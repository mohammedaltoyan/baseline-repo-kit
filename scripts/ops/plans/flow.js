#!/usr/bin/env node
/**
 * flow.js
 * Wrapper for plan lifecycle commands that keeps FOCUS.json in sync.
 * Actions:
 *   new      --slug <slug> [--title "..."] [--owner @handle] [--status draft|in_progress]
 *   advance  --plan PLAN-YYYYMM-<slug> --to Sxx [--owner @handle]
 *   complete --plan PLAN-YYYYMM-<slug>
 *   archive  --plan PLAN-YYYYMM-<slug> [--status done|canceled|superseded]
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const plansDir = path.join(root, 'docs', 'ops', 'plans');
const focusPath = path.join(plansDir, 'FOCUS.json');

function sanitizeOwner(owner) {
  if (!owner) return '';
  const trimmed = String(owner).trim();
  if (!trimmed || trimmed === '1') return '';
  if (trimmed.startsWith('@')) return trimmed;
  // If this looks like a GitHub username, normalize to @handle for consistency.
  // https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-your-personal-account/username-changes
  if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(trimmed)) return `@${trimmed}`;
  return trimmed;
}

function today() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function ym() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}

function parseArgs() {
  const out = {};
  const argv = process.argv.slice(2);
  const action = argv.shift();
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1';
      out[key] = val;
      continue;
    }
    positionals.push(a);
  }
  return { action, args: out, positionals };
}

function runNode(scriptPath, args) {
  const res = spawnSync(process.execPath, [scriptPath, ...args], { stdio: 'inherit', env: process.env });
  const code = typeof res.status === 'number' ? res.status : 1;
  if (code !== 0) {
    console.error(`[plan-flow] ${path.basename(scriptPath)} failed with code ${code}`);
    process.exit(code);
  }
}

function readFocus() {
  try {
    const data = JSON.parse(fs.readFileSync(focusPath, 'utf8'));
    if (!data.owners || !Array.isArray(data.owners)) return { updated: today(), owners: [] };
    return data;
  } catch {
    return { updated: today(), owners: [] };
  }
}

function writeFocus(focus) {
  focus.updated = today();
  fs.writeFileSync(focusPath, JSON.stringify(focus, null, 2) + '\n', 'utf8');
}

function setFocus(owner, planId, step) {
  const resolvedOwner =
    sanitizeOwner(owner) ||
    sanitizeOwner(planOwnerFromFile(planId)) ||
    sanitizeOwner(process.env.GIT_AUTHOR_NAME) ||
    sanitizeOwner(process.env.GITHUB_ACTOR);
  if (!resolvedOwner || !planId || !step) return;
  const focus = readFocus();
  focus.owners = focus.owners.filter(
    (o) => !(o.owner === resolvedOwner || o.plan_id === planId)
  );
  focus.owners.push({ owner: resolvedOwner, plan_id: planId, current_step: step });
  writeFocus(focus);
  console.log(`[plan-flow] focus -> ${resolvedOwner} / ${planId} / ${step}`);
}

function prunePlan(planId) {
  if (!planId) return;
  const focus = readFocus();
  const before = focus.owners.length;
  focus.owners = focus.owners.filter((o) => o.plan_id !== planId);
  if (focus.owners.length !== before) {
    writeFocus(focus);
    console.log(`[plan-flow] pruned ${planId} from FOCUS.json`);
  }
}

function planOwnerFromFile(planId) {
  const file = path.join(plansDir, `${planId}.md`);
  try {
    const body = fs.readFileSync(file, 'utf8');
    const m = body.match(/owner:\s*([^\s]+)/);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

function planStepFromFile(planId) {
  const file = path.join(plansDir, `${planId}.md`);
  try {
    const body = fs.readFileSync(file, 'utf8');
    const m = body.match(/current_step:\s*(S\d{2})/);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

function main() {
  const { action, args, positionals } = parseArgs();
  if (!action) {
    console.error('Usage: flow.js <new|advance|archive> [--flags]');
    process.exit(1);
  }

  if (action === 'new') {
    let slug = args.slug;
    // npm@11+ sometimes strips `--flag` tokens even after `--`; accept positional fallback.
    if (!slug && positionals.length) {
      slug = positionals[0];
      args.slug = slug;
      let tail = positionals.slice(1);

      // Positional fallback formats:
      //   plans:new <slug> <title...>
      //   plans:new <slug> <title...> draft|in_progress
      //   plans:new <slug> <title...> @owner
      //   plans:new <slug> <title...> @owner draft|in_progress
      const maybeStatus = tail[tail.length - 1];
      if (!args.status && (maybeStatus === 'draft' || maybeStatus === 'in_progress')) {
        args.status = maybeStatus;
        tail = tail.slice(0, -1);
      }

      const maybeOwner = tail[tail.length - 1];
      if (!args.owner && maybeOwner && String(maybeOwner).startsWith('@')) {
        args.owner = maybeOwner;
        tail = tail.slice(0, -1);
      }

      if (!args.title && tail.length) args.title = tail.join(' ');
    }
    if (!slug) {
      console.error('Usage: flow.js new --slug <slug> [--title "..."] [--owner @handle] [--status draft|in_progress]');
      process.exit(1);
    }
    const planId = `PLAN-${ym()}-${slug}`;
    const passArgs = [];
    for (const [k, v] of Object.entries(args)) {
      passArgs.push(`--${k}`, v);
    }
    runNode(path.join('scripts', 'ops', 'plan-new.js'), passArgs);

    const owner =
      sanitizeOwner(args.owner) ||
      sanitizeOwner(planOwnerFromFile(planId)) ||
      sanitizeOwner(process.env.GIT_AUTHOR_NAME) ||
      sanitizeOwner(process.env.GITHUB_ACTOR);
    const step = String(args.step || '').trim() || planStepFromFile(planId) || 'S00';
    setFocus(owner || planOwnerFromFile(planId), planId, step);
    return;
  }

  if (action === 'advance') {
    let planId = args.plan;
    let to = args.to;
    if ((!planId || !to) && positionals.length >= 2) {
      planId = planId || positionals[0];
      to = to || positionals[1];
      args.plan = planId;
      args.to = to;
      if (!args.owner && positionals[2] && String(positionals[2]).startsWith('@')) {
        args.owner = positionals[2];
      }
    }
    if (!planId || !to) {
      console.error('Usage: flow.js advance --plan PLAN-YYYYMM-<slug> --to Sxx [--owner @handle]');
      process.exit(1);
    }
    const passArgs = [];
    for (const [k, v] of Object.entries(args)) {
      passArgs.push(`--${k}`, v);
    }
    runNode(path.join('scripts', 'ops', 'plan-advance.js'), passArgs);
    const owner =
      sanitizeOwner(args.owner) ||
      sanitizeOwner(planOwnerFromFile(planId)) ||
      sanitizeOwner(process.env.GIT_AUTHOR_NAME) ||
      sanitizeOwner(process.env.GITHUB_ACTOR);
    setFocus(owner, planId, to);
    return;
  }

  if (action === 'complete') {
    let planId = args.plan;
    if (!planId && positionals.length) {
      planId = positionals[0];
      args.plan = planId;
    }
    if (!planId) {
      console.error('Usage: flow.js complete --plan PLAN-YYYYMM-<slug>');
      process.exit(1);
    }
    const passArgs = [];
    for (const [k, v] of Object.entries(args)) {
      passArgs.push(`--${k}`, v);
    }
    runNode(path.join('scripts', 'ops', 'plan-complete.js'), passArgs);
    prunePlan(planId);
    return;
  }

  if (action === 'archive') {
    let planId = args.plan;
    if (!planId && positionals.length) {
      planId = positionals[0];
      args.plan = planId;
      const maybeStatus = positionals[1];
      if (!args.status && maybeStatus && ['done', 'canceled', 'superseded'].includes(maybeStatus)) {
        args.status = maybeStatus;
      }
      // Positional fallback for npm@11+ argument stripping (even after `--`):
      //   plans:archive <planId> superseded <byPlanId>
      //   plans:archive <planId> canceled <reason...>
      if (args.status === 'superseded' && !args.by && positionals[2]) {
        args.by = positionals[2];
      }
      if (args.status === 'canceled' && !args.reason && positionals.length >= 3) {
        args.reason = positionals.slice(2).join(' ');
      }
    }
    if (!planId) {
      console.error('Usage: flow.js archive --plan PLAN-YYYYMM-<slug> [--status done|canceled|superseded]');
      process.exit(1);
    }
    const passArgs = [];
    for (const [k, v] of Object.entries(args)) {
      passArgs.push(`--${k}`, v);
    }
    runNode(path.join('scripts', 'ops', 'plan-archive.js'), passArgs);
    prunePlan(planId);
    return;
  }

  console.error(`Unknown action: ${action}`);
  process.exit(1);
}

main();
