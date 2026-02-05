#!/usr/bin/env node
/**
 * deep-verify.js
 *
 * Optional deeper verification for the baseline kit:
 * - Installs the baseline into fresh temp repos (init + overlay)
 * - Runs the baseline bootstrap locally to validate end-to-end behavior (git + env scaffold + idempotence)
 * - Runs dependency install and `npm test` in the installed copies
 * - Asserts excluded artifacts are not installed (plans, dashboards, secrets)
 *
 * Designed to be generic and safe to run locally or in CI.
 */
/* eslint-disable no-console */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { readJson, writeJson: writeJsonFile } = require('../utils/json');

function die(msg) {
  console.error(`[deep-verify] ${msg}`);
  process.exit(1);
}

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function run(cmd, args, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const label = opts.label || `${cmd} ${args.join(' ')}`;
  console.log(`[deep-verify] ${label}`);
  const needsShell = process.platform === 'win32' && (cmd === 'npm' || /\.cmd$/i.test(cmd));
  const env = opts.env || process.env;
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: needsShell, env });
  if (res.error) die(`${label} error: ${res.error.message}`);
  if (res.status !== 0) die(`${label} failed (exit ${res.status})`);
}

function capture(cmd, args, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const label = opts.label || `${cmd} ${args.join(' ')}`;
  const needsShell = process.platform === 'win32' && (cmd === 'npm' || /\.cmd$/i.test(cmd));
  const env = opts.env || process.env;
  const res = spawnSync(cmd, args, { cwd, shell: needsShell, env, encoding: 'utf8' });
  if (res.error) die(`${label} error: ${res.error.message}`);
  if (res.status !== 0) die(`${label} failed (exit ${res.status})\n${String(res.stderr || '').trim()}`);
  return { stdout: String(res.stdout || ''), stderr: String(res.stderr || '') };
}

function walkFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      const rel = path.relative(rootDir, full).replace(/\\/g, '/');
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === '.git') continue;
        stack.push(full);
        continue;
      }
      out.push(rel);
    }
  }
  return out;
}

function assertNoInstalledArtifacts(targetRoot) {
  const files = walkFiles(targetRoot);

  const hasPlanInstances = files.some((rel) => /^docs\/ops\/plans\/(?:archive\/)?PLAN-\d{6}-/i.test(rel));
  if (hasPlanInstances) {
    die(`Installed repo contains PLAN-* artifacts (should be excluded).`);
  }

  const forbidden = [
    'docs/ops/plans/FOCUS.json',
    'docs/ops/plans/INDEX.md',
    'config/env/.env',
    'config/env/.env.local',
    'config/env/.env.cloud',
    '.env',
  ];
  for (const rel of forbidden) {
    if (files.includes(rel)) {
      die(`Installed repo contains forbidden artifact: ${rel}`);
    }
  }
}

function withGitIdentityEnv(baseEnv) {
  const env = { ...(baseEnv || process.env) };
  // Ensure `git commit` works in bootstrap E2E scenarios even when user.name/email is not configured.
  env.GIT_AUTHOR_NAME = env.GIT_AUTHOR_NAME || 'baseline-kit';
  env.GIT_AUTHOR_EMAIL = env.GIT_AUTHOR_EMAIL || 'baseline-kit@example.invalid';
  env.GIT_COMMITTER_NAME = env.GIT_COMMITTER_NAME || env.GIT_AUTHOR_NAME;
  env.GIT_COMMITTER_EMAIL = env.GIT_COMMITTER_EMAIL || env.GIT_AUTHOR_EMAIL;
  return env;
}

function installBaseline({ sourceRoot, targetRoot, mode, overwrite, method }) {
  const m = String(method || 'node').trim().toLowerCase();
  const viaNpm = m === 'npm' || m === 'npm-positional' || m === 'npm-flag';
  const labelSuffix = `${mode}${overwrite ? ', overwrite' : ''}${viaNpm ? ', via npm' : ''}${m === 'npm-flag' ? ' (flags)' : ''}`;

  if (m === 'npm' || m === 'npm-positional') {
    const args = ['run', 'baseline:install', '--', targetRoot, mode];
    if (overwrite) args.push('overwrite');
    run(npmCmd(), args, { cwd: sourceRoot, label: `baseline-install (${labelSuffix})` });
    return;
  }
  if (m === 'npm-flag') {
    const args = ['run', 'baseline:install', '--', '--to', targetRoot, '--mode', mode];
    if (overwrite) args.push('--overwrite');
    run(npmCmd(), args, { cwd: sourceRoot, label: `baseline-install (${labelSuffix})` });
    return;
  }

  const args = [path.join(sourceRoot, 'scripts', 'tooling', 'baseline-install.js'), '--to', targetRoot, '--mode', mode];
  if (overwrite) args.push('--overwrite');
  run(process.execPath, args, { cwd: sourceRoot, label: `baseline-install (${labelSuffix})` });
}

function bootstrapBaseline({ sourceRoot, targetRoot, args = [], labelSuffix = '' }) {
  const a = Array.isArray(args) ? args : [];
  run(
    npmCmd(),
    ['run', 'baseline:bootstrap', '--', '--to', targetRoot, ...a],
    { cwd: sourceRoot, label: `baseline-bootstrap (${labelSuffix || 'local'})`, env: withGitIdentityEnv(process.env) }
  );
}

function runNpmTest({ targetRoot, useCi }) {
  if (useCi) {
    run(npmCmd(), ['ci', '--no-audit', '--no-fund'], { cwd: targetRoot, label: 'npm ci' });
  } else {
    run(npmCmd(), ['install', '--no-audit', '--no-fund'], { cwd: targetRoot, label: 'npm install' });
  }
  run(npmCmd(), ['test'], { cwd: targetRoot, label: 'npm test' });
}

function assertInstalledPackageJson({ sourceRoot, targetRoot }) {
  const baselinePkg = readJson(path.join(sourceRoot, 'package.json'));
  const targetPkg = readJson(path.join(targetRoot, 'package.json'));

  const baselineTest = String(baselinePkg?.scripts?.test || '').trim();
  assert.ok(baselineTest, '[deep-verify] baseline package.json is missing scripts.test');

  assert.strictEqual(
    String(targetPkg?.scripts?.test || '').trim(),
    baselineTest,
    '[deep-verify] expected target package.json scripts.test to match baseline'
  );

  const baselineDotenv = String(baselinePkg?.dependencies?.dotenv || '').trim();
  assert.ok(baselineDotenv, '[deep-verify] baseline package.json is missing dependencies.dotenv');
  assert.strictEqual(
    String(targetPkg?.dependencies?.dotenv || '').trim(),
    baselineDotenv,
    '[deep-verify] expected target package.json dependencies.dotenv to match baseline'
  );
}

function assertInstalledToolchain({ sourceRoot, targetRoot }) {
  const baselinePath = path.join(sourceRoot, '.nvmrc');
  const targetPath = path.join(targetRoot, '.nvmrc');

  if (!fs.existsSync(baselinePath)) return;
  assert.ok(fs.existsSync(targetPath), '[deep-verify] expected target repo to include .nvmrc');

  const baseline = String(fs.readFileSync(baselinePath, 'utf8') || '').trim();
  const target = String(fs.readFileSync(targetPath, 'utf8') || '').trim();
  assert.strictEqual(target, baseline, '[deep-verify] expected target .nvmrc to match baseline');
}

function assertInstalledRootPolicies({ sourceRoot, targetRoot }) {
  const mustMatchIfPresent = [
    '.editorconfig',
    'AGENTS.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
  ];

  for (const rel of mustMatchIfPresent) {
    const baselinePath = path.join(sourceRoot, rel);
    if (!fs.existsSync(baselinePath)) continue;
    const targetPath = path.join(targetRoot, rel);
    assert.ok(fs.existsSync(targetPath), `[deep-verify] expected target repo to include ${rel}`);
    assert.strictEqual(
      String(fs.readFileSync(targetPath, 'utf8') || ''),
      String(fs.readFileSync(baselinePath, 'utf8') || ''),
      `[deep-verify] expected target ${rel} to match baseline`
    );
  }
}

function assertInstalledMonorepoScaffold({ targetRoot }) {
  const required = [
    'apps/README.md',
    'apps/backend/README.md',
    'apps/frontend/README.md',
    'packages/README.md',
    'packages/shared/README.md',
  ];
  for (const rel of required) {
    assert.ok(fs.existsSync(path.join(targetRoot, rel)), `[deep-verify] expected target repo to include ${rel}`);
  }
}

function assertInstalledBranchPolicyConfig({ sourceRoot, targetRoot }) {
  const rel = path.join('config', 'policy', 'branch-policy.json');
  const baselinePath = path.join(sourceRoot, rel);
  if (!fs.existsSync(baselinePath)) return;

  const targetPath = path.join(targetRoot, rel);
  assert.ok(fs.existsSync(targetPath), `[deep-verify] expected target repo to include ${rel}`);
  assert.strictEqual(
    String(fs.readFileSync(targetPath, 'utf8') || ''),
    String(fs.readFileSync(baselinePath, 'utf8') || ''),
    `[deep-verify] expected target ${rel} to match baseline`
  );
}

function assertBootstrappedRepo({ targetRoot }) {
  assert.ok(fs.existsSync(path.join(targetRoot, '.git')), '[deep-verify] expected bootstrapped repo to have .git');

  const policy = readJson(path.join(targetRoot, 'config', 'policy', 'branch-policy.json'));
  const integration = String(policy?.integration_branch || '').trim() || 'dev';
  const production = String(policy?.production_branch || '').trim() || 'main';

  // Assert branch refs exist.
  capture('git', ['show-ref', '--verify', `refs/heads/${production}`], { cwd: targetRoot, label: `git show-ref ${production}` });
  capture('git', ['show-ref', '--verify', `refs/heads/${integration}`], { cwd: targetRoot, label: `git show-ref ${integration}` });

  // Assert HEAD is on integration branch.
  const head = capture('git', ['branch', '--show-current'], { cwd: targetRoot, label: 'git branch --show-current' }).stdout.trim();
  assert.strictEqual(head, integration, `[deep-verify] expected HEAD to be on integration branch (${integration}); got ${head || '<empty>'}`);

  // Assert env scaffold exists but is not tracked.
  const envLocal = path.join(targetRoot, 'config', 'env', '.env.local');
  assert.ok(fs.existsSync(envLocal), '[deep-verify] expected bootstrap to create config/env/.env.local');
  const tracked = capture('git', ['ls-files', '--', 'config/env/.env.local'], { cwd: targetRoot, label: 'git ls-files config/env/.env.local' }).stdout.trim();
  assert.strictEqual(tracked, '', '[deep-verify] expected config/env/.env.local to be untracked');

  // Assert worktree is clean (ignores ignored files).
  const porcelain = capture('git', ['status', '--porcelain'], { cwd: targetRoot, label: 'git status --porcelain' }).stdout.trim();
  assert.strictEqual(porcelain, '', `[deep-verify] expected clean worktree; got:\n${porcelain}`);

  // Assert at least one commit exists.
  const sha = capture('git', ['rev-parse', 'HEAD'], { cwd: targetRoot, label: 'git rev-parse HEAD' }).stdout.trim();
  assert.ok(sha && /^[0-9a-f]{7,40}$/i.test(sha), `[deep-verify] expected HEAD sha; got ${sha || '<empty>'}`);
}

function main() {
  const sourceRoot = path.resolve(__dirname, '..', '..');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-kit-deep-verify-'));
  console.log(`[deep-verify] tmp=${tmpRoot}`);

  try {
    // Scenario A: init mode into an empty repo
    const initTarget = path.join(tmpRoot, 'target-init');
    installBaseline({ sourceRoot, targetRoot: initTarget, mode: 'init', overwrite: false, method: 'npm-flag' });
    assertNoInstalledArtifacts(initTarget);
    assertInstalledPackageJson({ sourceRoot, targetRoot: initTarget });
    assertInstalledToolchain({ sourceRoot, targetRoot: initTarget });
    assertInstalledRootPolicies({ sourceRoot, targetRoot: initTarget });
    assertInstalledMonorepoScaffold({ targetRoot: initTarget });
    assertInstalledBranchPolicyConfig({ sourceRoot, targetRoot: initTarget });
    runNpmTest({ targetRoot: initTarget, useCi: true });

    // Scenario B: overlay into a minimal Node repo (no conflicting scripts)
    const overlayClean = path.join(tmpRoot, 'target-overlay-clean');
    fs.mkdirSync(overlayClean, { recursive: true });
    writeJsonFile(path.join(overlayClean, 'package.json'), {
      name: 'target-overlay-clean',
      version: '0.0.0',
      private: true,
      scripts: {},
      dependencies: {},
    });
    installBaseline({ sourceRoot, targetRoot: overlayClean, mode: 'overlay', overwrite: false, method: 'npm' });
    assertNoInstalledArtifacts(overlayClean);
    assertInstalledPackageJson({ sourceRoot, targetRoot: overlayClean });
    assertInstalledToolchain({ sourceRoot, targetRoot: overlayClean });
    assertInstalledRootPolicies({ sourceRoot, targetRoot: overlayClean });
    assertInstalledMonorepoScaffold({ targetRoot: overlayClean });
    assertInstalledBranchPolicyConfig({ sourceRoot, targetRoot: overlayClean });
    runNpmTest({ targetRoot: overlayClean, useCi: false });

    // Scenario C: overlay with overwrite into a repo that has conflicting scripts/deps
    const overlayOverwrite = path.join(tmpRoot, 'target-overlay-overwrite');
    fs.mkdirSync(overlayOverwrite, { recursive: true });
    writeJsonFile(path.join(overlayOverwrite, 'package.json'), {
      name: 'target-overlay-overwrite',
      version: '0.0.0',
      private: true,
      scripts: {
        test: 'node -e \"console.log(\\\"original test\\\")\"',
      },
      dependencies: {
        dotenv: '^0.0.0',
      },
    });
    installBaseline({ sourceRoot, targetRoot: overlayOverwrite, mode: 'overlay', overwrite: true, method: 'npm' });
    assertNoInstalledArtifacts(overlayOverwrite);
    assertInstalledPackageJson({ sourceRoot, targetRoot: overlayOverwrite });
    assertInstalledToolchain({ sourceRoot, targetRoot: overlayOverwrite });
    assertInstalledRootPolicies({ sourceRoot, targetRoot: overlayOverwrite });
    assertInstalledMonorepoScaffold({ targetRoot: overlayOverwrite });
    assertInstalledBranchPolicyConfig({ sourceRoot, targetRoot: overlayOverwrite });
    runNpmTest({ targetRoot: overlayOverwrite, useCi: false });

    // Scenario D: baseline bootstrap (local-only) end-to-end: git + env scaffold + idempotence.
    const bootstrapLocal = path.join(tmpRoot, 'target-bootstrap-local');
    bootstrapBaseline({ sourceRoot, targetRoot: bootstrapLocal, args: [], labelSuffix: 'local-only (init)' });
    assertBootstrappedRepo({ targetRoot: bootstrapLocal });

    // Re-run with an explicit update mode to assert idempotence and overlay path.
    bootstrapBaseline({
      sourceRoot,
      targetRoot: bootstrapLocal,
      args: ['--mode', 'overlay', '--overwrite'],
      labelSuffix: 'local-only (overlay overwrite)',
    });
    assertBootstrappedRepo({ targetRoot: bootstrapLocal });

    console.log('[deep-verify] OK');
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  }
}

if (require.main === module) {
  main();
}
