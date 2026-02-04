#!/usr/bin/env node
/**
 * plan-objectives-auto.js
 * Auto-checks Objectives Gate (S98) when objectives-lint passes.
 * Adds an "Objectives Evidence:" line with timestamp and commit.
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const plansDir = path.join(root, 'docs', 'ops', 'plans');

function die(msg) { console.error(`[plan-objectives-auto] ${msg}`); process.exit(1); }
function read(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function write(file, body) { fs.writeFileSync(file, body, 'utf8'); }

function parseArgs() {
  const out = {};
  const argv = process.argv.slice(2);
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.replace(/^--/, '');
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1';
      out[k] = v;
      continue;
    }
    positionals.push(a);
  }
  return { args: out, positionals };
}

function gitSha() {
  try { return spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(); } catch { return ''; }
}

function checkOffS98(planPath) {
  let body = read(planPath) || '';
  const reUnchecked = /^- \[ \] S98\b.*$/m;
  const reChecked = /^- \[(x|X)\] S98\b.*$/m;
  if (reChecked.test(body)) return false;
  if (reUnchecked.test(body)) {
    body = body.replace(reUnchecked, (s) => s.replace('[ ]', '[x]'));
    write(planPath, body);
    return true;
  }
  // Insert if missing under Objectives Gate header if present
  if (/Objectives Gate/.test(body)) {
    body = body.replace(/Objectives Gate[\s\S]*?\n\n/, (m) => m.replace(/\n\n/, `\n- [x] S98 - Objectives Gate (auto)\n\n`));
    write(planPath, body);
    return true;
  }
  return false;
}

function insertEvidence(planPath, text) {
  let body = read(planPath) || '';
  if (!/Decisions \& Notes/.test(body)) {
    body += `\n\nDecisions & Notes\n`;
  }
  // Drop any existing Objectives Evidence lines so the latest is authoritative.
  body = body.replace(/^\s*-\s*Objectives Evidence\s*:.*\r?\n?/gmi, '');
  body = body.replace(/\n{3,}/g, '\n\n');
  body = body.replace(/Decisions \& Notes\n/, (m) => `${m}- Objectives Evidence: ${text}\n`);
  write(planPath, body);
}

function main() {
  const { args, positionals } = parseArgs();
  const planId = args.plan || positionals[0];
  if (!planId) die('Usage: plans:objectives:gate:auto -- --plan PLAN-YYYYMM-<slug>');
  const planPath = path.join(plansDir, `${planId}.md`);
  if (!fs.existsSync(planPath)) die(`Plan not found: ${planPath}`);

  const lint = spawnSync(process.execPath, [path.join('scripts','ops','objectives-lint.js')], { stdio: 'inherit' });
  if (lint.status !== 0) die('objectives-lint failed; not checking S98');

  const ts = new Date().toISOString();
  const sha = gitSha();
  insertEvidence(planPath, `auto-verified at ${ts} (commit ${sha})`);
  const changed = checkOffS98(planPath);
  console.log(`[plan-objectives-auto] Objectives Gate ${changed ? 'checked' : 'already checked'}.`);
}

if (require.main === module) {
  main();
}

module.exports = {
  insertEvidence,
  checkOffS98,
};
