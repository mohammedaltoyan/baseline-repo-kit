'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const YAML = require('yaml');
const { CONFIG_FILE, BASE_CONTENT_FILE, SNAPSHOT_DIR } = require('../constants');
const { isTruthy } = require('../util/args');
const { mergeManagedContent } = require('../merge');
const { ensureDir, toPosix, writeJson } = require('../util/fs');

const GIT_TIMEOUT = 5000;

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

function runGit(targetRoot, args) {
  return spawnSync('git', args, {
    cwd: targetRoot,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT,
  });
}

function applyArtifacts({ context, dryRun }) {
  const applied = [];
  const baseMap = {
    ...(context.baseContentMap && typeof context.baseContentMap === 'object' ? context.baseContentMap : {}),
  };
  const trackedPaths = new Set();

  const configPath = path.join(context.targetRoot, CONFIG_FILE);
  const configExists = fs.existsSync(configPath);
  const currentConfigText = configExists ? fs.readFileSync(configPath, 'utf8') : '';
  const nextConfigText = YAML.stringify(context.config || {});
  const configChanged = !configExists || currentConfigText !== nextConfigText;
  if (!dryRun && configChanged) {
    context.writeYaml(configPath, context.config);
  }
  if (configChanged) {
    applied.push({
      path: CONFIG_FILE,
      type: configExists ? 'update' : 'create',
      strategy: 'yaml_merge',
      changed: true,
    });
  }

  for (const artifact of context.artifacts) {
    if (artifact.path === CONFIG_FILE) continue;
    trackedPaths.add(artifact.path);
    const abs = path.join(context.targetRoot, artifact.path);
    const exists = fs.existsSync(abs);
    const current = exists ? fs.readFileSync(abs, 'utf8') : '';
    const merged = mergeManagedContent({
      strategy: artifact.strategy,
      current,
      next: artifact.content || '',
      base: baseMap[artifact.path] || '',
      filePath: artifact.path,
      preserveUserBlocks: artifact.preserve_user_blocks !== false,
    });

    if (!dryRun) {
      if (!exists || merged.changed) {
        context.writeText(abs, merged.content || '');
      }
    }

    if (!exists || merged.changed) {
      applied.push({
        path: artifact.path,
        type: exists ? 'update' : 'create',
        owner: artifact.owner,
        strategy: artifact.strategy,
        changed: true,
        conflicted: !!merged.conflicted,
      });
    }

    baseMap[artifact.path] = String(artifact.content || '');
  }

  for (const stalePath of Object.keys(baseMap)) {
    if (!trackedPaths.has(stalePath)) {
      delete baseMap[stalePath];
    }
  }

  if (!dryRun) {
    context.writeJson(path.join(context.targetRoot, BASE_CONTENT_FILE), baseMap);
  }
  context.baseContentMap = baseMap;

  return applied;
}

function readSnapshotFilePayload(targetRoot, relPath) {
  const abs = path.join(targetRoot, relPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return { path: relPath, existed: false, content: '' };
  }
  return {
    path: relPath,
    existed: true,
    content: fs.readFileSync(abs, 'utf8'),
  };
}

function createRollbackSnapshot({ targetRoot, files, label }) {
  const uniqueFiles = Array.from(new Set((Array.isArray(files) ? files : []).map((value) => String(value || '').trim()).filter(Boolean)));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').toLowerCase();
  const safeLabel = String(label || 'apply').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '') || 'apply';
  const rel = path.posix.join(SNAPSHOT_DIR, `${timestamp}-${safeLabel}.json`);
  const abs = path.join(targetRoot, rel);
  ensureDir(path.dirname(abs));

  const payload = {
    version: 1,
    created_at: new Date().toISOString(),
    label: safeLabel,
    files: uniqueFiles.map((entry) => readSnapshotFilePayload(targetRoot, entry)),
  };
  writeJson(abs, payload);

  return {
    snapshot_file: toPosix(rel),
    file_count: payload.files.length,
  };
}

function resolveCurrentBranch(targetRoot) {
  const head = runGit(targetRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (head.status !== 0) return '';
  return String(head.stdout || '').trim();
}

function hasRemoteOrigin(targetRoot) {
  const remote = runGit(targetRoot, ['remote', 'get-url', 'origin']);
  return remote.status === 0;
}

function createBranchWithRetries(targetRoot, base) {
  const candidates = [base, `${base}-1`, `${base}-2`, `${base}-3`];
  for (const branch of candidates) {
    const checkout = runGit(targetRoot, ['checkout', '-b', branch]);
    if (checkout.status === 0) return { ok: true, branch };
  }
  return { ok: false, branch: '' };
}

function tryPrFirstCommit({ targetRoot, changes, integrationBranch, title, body }) {
  const summary = {
    attempted: false,
    branch: '',
    committed: false,
    prOpened: false,
    prUrl: '',
    warnings: [],
  };

  if (!Array.isArray(changes) || changes.length === 0) {
    return summary;
  }

  const inGit = runGit(targetRoot, ['rev-parse', '--is-inside-work-tree']);
  if (inGit.status !== 0) {
    summary.warnings.push('PR-first skipped: target is not a git worktree.');
    return summary;
  }
  if (!hasRemoteOrigin(targetRoot)) {
    summary.warnings.push('PR-first skipped: origin remote is not configured.');
    return summary;
  }

  summary.attempted = true;
  const originalBranch = resolveCurrentBranch(targetRoot);
  const desiredBranch = `automation/baseline-apply-${new Date().toISOString().replace(/[:.]/g, '-').toLowerCase()}`;
  const created = createBranchWithRetries(targetRoot, desiredBranch);
  if (!created.ok) {
    summary.warnings.push(`Unable to create apply branch from ${desiredBranch}`);
    return summary;
  }

  summary.branch = created.branch;

  const paths = changes.map((change) => change.path);
  const add = runGit(targetRoot, ['add', ...paths]);
  if (add.status !== 0) {
    summary.warnings.push(`git add failed: ${String(add.stderr || '').trim()}`);
    if (originalBranch) runGit(targetRoot, ['checkout', originalBranch]);
    return summary;
  }

  const commit = runGit(targetRoot, ['commit', '-m', title]);
  if (commit.status !== 0) {
    summary.warnings.push(`git commit failed: ${String(commit.stderr || '').trim()}`);
    if (originalBranch) runGit(targetRoot, ['checkout', originalBranch]);
    return summary;
  }
  summary.committed = true;

  const push = runGit(targetRoot, ['push', '-u', 'origin', created.branch]);
  if (push.status !== 0) {
    summary.warnings.push(`git push failed: ${String(push.stderr || '').trim()}`);
    if (originalBranch) runGit(targetRoot, ['checkout', originalBranch]);
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
    created.branch,
  ], {
    cwd: targetRoot,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT,
    env: {
      ...process.env,
      GH_PROMPT_DISABLED: '1',
    },
  });

  if (gh.status !== 0) {
    summary.warnings.push(`gh pr create failed: ${String(gh.stderr || '').trim()}`);
    if (originalBranch) runGit(targetRoot, ['checkout', originalBranch]);
    return summary;
  }

  summary.prOpened = true;
  summary.prUrl = String(gh.stdout || '').trim();
  if (originalBranch) runGit(targetRoot, ['checkout', originalBranch]);
  return summary;
}

module.exports = {
  applyArtifacts,
  createRollbackSnapshot,
  printOutput,
  tryPrFirstCommit,
};
