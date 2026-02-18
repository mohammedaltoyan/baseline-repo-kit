#!/usr/bin/env node
'use strict';

const { parseArgs } = require('./lib/util/args');
const { runInit } = require('./lib/commands/init');
const { runDiff } = require('./lib/commands/diff');
const { runApply } = require('./lib/commands/apply');
const { runUpgrade } = require('./lib/commands/upgrade');
const { runDoctor } = require('./lib/commands/doctor');
const { runVerify } = require('./lib/commands/verify');
const { runUi } = require('./lib/commands/ui');

const HELP = `baseline engine (v2.2)

Usage:
  baseline <command> [--target <path>] [--json]

Commands:
  init      Initialize .baseline state/config and generated defaults
  ui        Launch web-first control panel
  diff      Show pending generated changes
  apply     Apply generated changes (PR-first by default)
  upgrade   Run versioned migrations then apply
  doctor    Validate config, modules, and capabilities
  verify    Run engine integrity checks
`;

async function main() {
  const argv = process.argv.slice(2);
  const command = String(argv[0] || '').trim().toLowerCase();
  const args = parseArgs(argv.slice(1));

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  if (command === 'init') return runInit(args);
  if (command === 'ui') return runUi(args);
  if (command === 'diff') return runDiff(args);
  if (command === 'apply') return runApply(args);
  if (command === 'upgrade') return runUpgrade(args);
  if (command === 'doctor') return runDoctor(args);
  if (command === 'verify') return runVerify(args);

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`[baseline-engine] ${String(error && error.message ? error.message : error)}\n`);
  process.exit(1);
});
