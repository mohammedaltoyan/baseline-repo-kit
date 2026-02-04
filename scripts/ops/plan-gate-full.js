#!/usr/bin/env node
/**
 * plan-gate-full.js
 * Convenience orchestrator: Objectives Auto -> Tests Gate
 */
/* eslint-disable no-console */
const path = require('path');
const { spawnSync } = require('child_process');

function die(msg) { console.error(`[plan-gate-full] ${msg}`); process.exit(1); }

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

function runNode(rel, args) {
  const cmd = [path.join(...rel.split('/')), ...args];
  const p = spawnSync(process.execPath, cmd, { stdio: 'inherit' });
  if (p.status !== 0) die(`${rel} failed`);
}

function main() {
  const { args, positionals } = parseArgs();
  const plan = args.plan || positionals[0];
  if (!plan) die('Usage: plans:gate:full -- --plan PLAN-YYYYMM-<slug>');
  runNode('scripts/ops/plan-objectives-auto.js', ['--plan', plan]);
  runNode('scripts/ops/plan-gate.js', ['--plan', plan]);
  console.log('[plan-gate-full] Full gating sequence completed');
}

main();
