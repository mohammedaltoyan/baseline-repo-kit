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
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

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

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
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

function installBaseline({ sourceRoot, targetRoot, mode, overwrite }) {
  const args = [
    path.join(sourceRoot, 'scripts', 'tooling', 'baseline-install.js'),
    '--to',
    targetRoot,
    '--mode',
    mode,
  ];
  if (overwrite) args.push('--overwrite');
  run(process.execPath, args, { cwd: sourceRoot, label: `baseline-install (${mode}${overwrite ? ', overwrite' : ''})` });
}

function runNpmTest({ targetRoot, useCi }) {
  if (useCi) {
    run(npmCmd(), ['ci', '--no-audit', '--no-fund'], { cwd: targetRoot, label: 'npm ci' });
  } else {
    run(npmCmd(), ['install', '--no-audit', '--no-fund'], { cwd: targetRoot, label: 'npm install' });
  }
  run(npmCmd(), ['test'], { cwd: targetRoot, label: 'npm test' });
}

function main() {
  const sourceRoot = path.resolve(__dirname, '..', '..');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-kit-deep-verify-'));
  console.log(`[deep-verify] tmp=${tmpRoot}`);

  try {
    // Scenario A: init mode into an empty repo
    const initTarget = path.join(tmpRoot, 'target-init');
    installBaseline({ sourceRoot, targetRoot: initTarget, mode: 'init', overwrite: false });
    assertNoInstalledArtifacts(initTarget);
    runNpmTest({ targetRoot: initTarget, useCi: true });

    // Scenario B: overlay into a minimal Node repo (no conflicting scripts)
    const overlayClean = path.join(tmpRoot, 'target-overlay-clean');
    fs.mkdirSync(overlayClean, { recursive: true });
    writeJson(path.join(overlayClean, 'package.json'), {
      name: 'target-overlay-clean',
      version: '0.0.0',
      private: true,
      scripts: {},
      dependencies: {},
    });
    installBaseline({ sourceRoot, targetRoot: overlayClean, mode: 'overlay', overwrite: false });
    assertNoInstalledArtifacts(overlayClean);
    runNpmTest({ targetRoot: overlayClean, useCi: false });

    // Scenario C: overlay with overwrite into a repo that has conflicting scripts/deps
    const overlayOverwrite = path.join(tmpRoot, 'target-overlay-overwrite');
    fs.mkdirSync(overlayOverwrite, { recursive: true });
    writeJson(path.join(overlayOverwrite, 'package.json'), {
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
    installBaseline({ sourceRoot, targetRoot: overlayOverwrite, mode: 'overlay', overwrite: true });
    assertNoInstalledArtifacts(overlayOverwrite);
    runNpmTest({ targetRoot: overlayOverwrite, useCi: false });

    console.log('[deep-verify] OK');
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  }
}

if (require.main === module) {
  main();
}

