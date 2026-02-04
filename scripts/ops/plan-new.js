#!/usr/bin/env node
/**
 * plan-new.js
 * Scaffolds a new canonical plan from TEMPLATE.md
 */
const fs = require('fs');
const path = require('path');
const { updateFrontmatter } = require('./plans/frontmatter');

const root = process.cwd();
const plansDir = path.join(root, 'docs', 'ops', 'plans');
const templatePath = path.join(plansDir, 'TEMPLATE.md');

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

function main() {
  const { slug, title = '', owner = '', status = 'draft' } = parseArgs();
  if (!slug) {
    console.error('Usage: plans:new -- --slug <slug> [--title "..."] [--owner @handle] [--status draft]');
    process.exit(1);
  }
  const pid = `PLAN-${ym()}-${slug}`;
  const dest = path.join(plansDir, `${pid}.md`);
  if (fs.existsSync(dest)) {
    console.error(`Plan already exists: ${dest}`);
    process.exit(1);
  }
  const normalizeOwner = (raw) => {
    const v = String(raw || '').trim();
    if (!v || v === '1') return '';
    if (v.startsWith('@')) return v;
    if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(v)) return `@${v}`;
    return v;
  };

  const parsedOwner = normalizeOwner(owner);
  const actorOwner = normalizeOwner(process.env.GITHUB_ACTOR);
  const computedOwner = (parsedOwner && parsedOwner !== '@handle') ? parsedOwner : (actorOwner || '@handle');
  const targetWindow = today().slice(0, 7);
  const template = fs.readFileSync(templatePath, 'utf8');
  const body = updateFrontmatter(
    template,
    {
      plan_id: pid,
      title: title || slug,
      owner: computedOwner,
      status,
      current_step: 'S00',
      updated: today(),
      target_window: targetWindow,
    },
    { preserveCommentKeys: ['status', 'priority', 'target_window'] }
  );
  fs.writeFileSync(dest, body, 'utf8');
  console.log(`[plan-new] Created ${dest}`);
}

main();

