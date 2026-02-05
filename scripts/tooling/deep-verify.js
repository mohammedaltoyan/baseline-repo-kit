#!/usr/bin/env node
/**
 * deep-verify.js
 *
 * Optional deeper verification for the baseline kit:
 * - Installs the baseline into fresh temp repos (init + overlay)
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
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: needsShell });
  if (res.error) die(`${label} error: ${res.error.message}`);
  if (res.status !== 0) die(`${label} failed (exit ${res.status})`);
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
    runNpmTest({ targetRoot: overlayOverwrite, useCi: false });

    console.log('[deep-verify] OK');
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  }
}

if (require.main === module) {
  main();
}
