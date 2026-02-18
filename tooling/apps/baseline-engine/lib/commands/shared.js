'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { CONFIG_FILE } = require('../constants');
const { isTruthy } = require('../util/args');

function printOutput(payload, args) {
  if (isTruthy(args && args.silent)) return;
  if (isTruthy(args && args.json)) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (payload && typeof payload === 'object') {
    for (const [key, value] of Object.entries(payload)) {
      if (Array.isArray(value)) {
        process.stdout.write(`${key}: ${value.length}\n`);
        continue;
      }
      if (value && typeof value === 'object') {
        process.stdout.write(`${key}: ${JSON.stringify(value)}\n`);
        continue;
      }
      process.stdout.write(`${key}: ${String(value)}\n`);
    }
  }
}

function applyArtifacts({ context, dryRun }) {
  const applied = [];

  const configPath = path.join(context.targetRoot, CONFIG_FILE);
  if (!dryRun) {
    context.writeYaml(configPath, context.config);
  }
  applied.push({ path: CONFIG_FILE, type: fs.existsSync(configPath) ? 'update' : 'create' });

  for (const artifact of context.artifacts) {
    if (artifact.path === CONFIG_FILE) continue;
    const abs = path.join(context.targetRoot, artifact.path);
    const exists = fs.existsSync(abs);
    if (!dryRun) {
      context.writeText(abs, artifact.content || '');
    }
    applied.push({
      path: artifact.path,
      type: exists ? 'update' : 'create',
      owner: artifact.owner,
      strategy: artifact.strategy,
    });
  }

  return applied;
}

function tryPrFirstCommit({ targetRoot, changes, integrationBranch, title, body }) {
  const summary = {
    attempted: false,
    branch: '',
    committed: false,
    prOpened: false,
    warnings: [],
  };

  if (!Array.isArray(changes) || changes.length === 0) {
    return summary;
  }

  const inGit = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: targetRoot, encoding: 'utf8' });
  if (inGit.status !== 0) {
    summary.warnings.push('PR-first skipped: target is not a git worktree.');
    return summary;
  }

  summary.attempted = true;
  const branch = `automation/baseline-apply-${new Date().toISOString().replace(/[:.]/g, '-').toLowerCase()}`;
  summary.branch = branch;

  const checkout = spawnSync('git', ['checkout', '-b', branch], { cwd: targetRoot, encoding: 'utf8' });
  if (checkout.status !== 0) {
    summary.warnings.push(`Unable to create branch ${branch}: ${String(checkout.stderr || '').trim()}`);
    return summary;
  }

  const paths = changes.map((change) => change.path);
  const add = spawnSync('git', ['add', ...paths], { cwd: targetRoot, encoding: 'utf8' });
  if (add.status !== 0) {
    summary.warnings.push(`git add failed: ${String(add.stderr || '').trim()}`);
    return summary;
  }

  const commit = spawnSync('git', ['commit', '-m', title], { cwd: targetRoot, encoding: 'utf8' });
  if (commit.status !== 0) {
    summary.warnings.push(`git commit failed: ${String(commit.stderr || '').trim()}`);
    return summary;
  }
  summary.committed = true;

  const push = spawnSync('git', ['push', '-u', 'origin', branch], { cwd: targetRoot, encoding: 'utf8' });
  if (push.status !== 0) {
    summary.warnings.push(`git push failed: ${String(push.stderr || '').trim()}`);
    return summary;
  }

  const gh = spawnSync('gh', [
    'pr',
    'create',
    '--title',
    title,
    '--body',
    body,
    '--base',
    integrationBranch,
    '--head',
    branch,
  ], { cwd: targetRoot, encoding: 'utf8' });

  if (gh.status !== 0) {
    summary.warnings.push(`gh pr create failed: ${String(gh.stderr || '').trim()}`);
    return summary;
  }

  summary.prOpened = true;
  return summary;
}

module.exports = {
  applyArtifacts,
  printOutput,
  tryPrFirstCommit,
};
