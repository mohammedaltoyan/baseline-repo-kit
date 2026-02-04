#!/usr/bin/env node
/**
 * baseline-install.js
 *
 * Copies this baseline kit into a target repository folder.
 *
 * Usage:
 *   npm run baseline:install -- <path> [overlay|init] [overwrite] [dry-run] [verbose]
 *   npm run baseline:install -- --to <path> [--mode overlay|init] [--overwrite] [--dry-run] [--verbose]
 *
 * Modes:
 * - overlay (default): copy baseline folders/files without overwriting project identity
 *   (skips existing files unless --overwrite). Merges baseline scripts/deps into an
 *   existing package.json when present.
 * - init: copy everything (except excluded artifacts) into the target.
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { parseFlagArgs } = require('../utils/cli-args');
const { isTruthy } = require('../utils/is-truthy');
const { readJson, writeJson } = require('../utils/json');

function die(msg) {
  console.error(`[baseline-install] ${msg}`);
  process.exit(1);
}

function normalizeMode(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 'overlay';
  if (v === 'overlay' || v === 'init') return v;
  return '';
}

function normalizeRel(p) {
  return String(p || '').replace(/\\/g, '/');
}

function ensureDir(dirPath, dryRun) {
  if (dryRun) return;
  fs.mkdirSync(dirPath, { recursive: true });
}

function isExcludedPath(relPosix) {
  const rel = normalizeRel(relPosix);
  if (!rel || rel === '.' || rel === './') return false;

  // Keep the directory contract docs, but never copy generated artifacts.
  if (rel === 'docs/ops/plans/review/README.md') return false;
  if (rel === 'docs/ops/plans/archive/README.md') return false;
  if (rel === 'docs/ops/plans/README.md') return false;
  if (rel === 'docs/ops/plans/TEMPLATE.md') return false;

  const parts = rel.split('/').filter(Boolean);
  if (parts[0] === '.git') return true;
  if (parts.includes('node_modules')) return true;
  if (parts[0] === '.vscode') return true;
  if (parts[0] === 'tmp' || parts[0] === 'temp' || parts[0] === 'logs' || parts[0] === 'secrets') return true;
  if (rel === 'docs/ops/plans/FOCUS.json') return true;
  if (rel === 'docs/ops/plans/INDEX.md') return true;
  if (rel === 'docs/ops/plans/review' || rel.startsWith('docs/ops/plans/review/')) return true;
  // Never copy plan instances from the baseline kit into target repos.
  // Targets should create their own plan(s) via `npm run plans:new`.
  if (/^docs\/ops\/plans\/(?:archive\/)?PLAN-\d{6}-[A-Za-z0-9_.-]+\.md$/i.test(rel)) return true;
  if (rel === 'docs/ops/plans/archive/duplicates' || rel.startsWith('docs/ops/plans/archive/duplicates/')) return true;

  // Never copy real env secret files; examples are fine.
  if (rel === '.env') return true;
  if (rel.startsWith('.env.')) {
    if (rel.endsWith('.example')) return false;
    return true;
  }
  if (rel.startsWith('config/env/')) {
    const base = path.posix.basename(rel);
    if (base.startsWith('.env') && !base.endsWith('.example') && base !== 'README.md') return true;
  }

  return false;
}

function allowedByMode(relPosix, mode) {
  if (mode === 'init') return true;
  // overlay: only copy baseline-kit components + minimal root policy files
  const rel = normalizeRel(relPosix);
  const top = rel.split('/')[0] || '';
  const allowedTop = new Set([
    '.github',
    'config',
    'docs',
    'scripts',
    'tooling',
  ]);
  const allowedRootFiles = new Set([
    'AGENTS.md',
    'README_BASELINE.md',
    '.nvmrc',
    '.gitignore',
    '.gitattributes',
  ]);
  if (allowedTop.has(top)) return true;
  return allowedRootFiles.has(rel);
}

function walkFiles(rootDir) {
  const out = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      const rel = path.relative(rootDir, full);
      const relPosix = normalizeRel(rel);
      if (isExcludedPath(relPosix)) continue;
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      out.push({ full, relPosix });
    }
  }
  walk(rootDir);
  return out;
}

function copyFile({ from, to, relPosix, overwrite, dryRun, stats }) {
  const exists = fs.existsSync(to);
  if (exists && !overwrite) {
    stats.skipped += 1;
    return { action: 'skip' };
  }
  if (exists && overwrite) stats.overwritten += 1;
  else stats.copied += 1;
  if (!dryRun) {
    ensureDir(path.dirname(to), dryRun);
    fs.copyFileSync(from, to);
  }
  return { action: exists && overwrite ? 'overwrite' : 'copy' };
}

function mergePackageJson({ sourceRoot, targetRoot, overwrite, dryRun, verbose, stats }) {
  const src = path.join(sourceRoot, 'package.json');
  const dst = path.join(targetRoot, 'package.json');
  if (!fs.existsSync(src)) return;

  if (!fs.existsSync(dst)) {
    // No target package.json, copy baseline's as-is (unless already copied by file walker).
    const res = copyFile({ from: src, to: dst, relPosix: 'package.json', overwrite, dryRun, stats });
    if (verbose) console.log(`[baseline-install] package.json: ${res.action}`);
    return;
  }

  let srcJson;
  let dstJson;
  try {
    srcJson = readJson(src);
  } catch (e) {
    die(`Failed to parse source package.json: ${e.message || e}`);
  }
  try {
    dstJson = readJson(dst);
  } catch (e) {
    die(`Failed to parse target package.json: ${e.message || e}`);
  }

  const changes = { scriptsAdded: 0, scriptsConflicts: 0, depsAdded: 0, depsConflicts: 0 };
  dstJson.scripts = dstJson.scripts && typeof dstJson.scripts === 'object' ? dstJson.scripts : {};
  const srcScripts = srcJson.scripts && typeof srcJson.scripts === 'object' ? srcJson.scripts : {};
  for (const [k, v] of Object.entries(srcScripts)) {
    if (Object.prototype.hasOwnProperty.call(dstJson.scripts, k)) {
      if (dstJson.scripts[k] === v) continue;
      if (overwrite) {
        dstJson.scripts[k] = v;
        changes.scriptsOverwritten = (changes.scriptsOverwritten || 0) + 1;
      } else {
        changes.scriptsConflicts += 1;
      }
      continue;
    }
    dstJson.scripts[k] = v;
    changes.scriptsAdded += 1;
  }

  dstJson.dependencies = dstJson.dependencies && typeof dstJson.dependencies === 'object' ? dstJson.dependencies : {};
  const srcDeps = srcJson.dependencies && typeof srcJson.dependencies === 'object' ? srcJson.dependencies : {};
  for (const [k, v] of Object.entries(srcDeps)) {
    if (Object.prototype.hasOwnProperty.call(dstJson.dependencies, k)) {
      if (dstJson.dependencies[k] === v) continue;
      if (overwrite) {
        dstJson.dependencies[k] = v;
        changes.depsOverwritten = (changes.depsOverwritten || 0) + 1;
      } else {
        changes.depsConflicts += 1;
      }
      continue;
    }
    dstJson.dependencies[k] = v;
    changes.depsAdded += 1;
  }

  // Optional: merge devDependencies when present in the baseline.
  dstJson.devDependencies =
    dstJson.devDependencies && typeof dstJson.devDependencies === 'object' ? dstJson.devDependencies : {};
  const srcDev = srcJson.devDependencies && typeof srcJson.devDependencies === 'object' ? srcJson.devDependencies : {};
  for (const [k, v] of Object.entries(srcDev)) {
    if (Object.prototype.hasOwnProperty.call(dstJson.devDependencies, k)) {
      if (dstJson.devDependencies[k] === v) continue;
      if (overwrite) {
        dstJson.devDependencies[k] = v;
        changes.devDepsOverwritten = (changes.devDepsOverwritten || 0) + 1;
      } else {
        changes.devDepsConflicts = (changes.devDepsConflicts || 0) + 1;
      }
      continue;
    }
    dstJson.devDependencies[k] = v;
    changes.devDepsAdded = (changes.devDepsAdded || 0) + 1;
  }

  const changed =
    changes.scriptsAdded > 0 ||
    changes.depsAdded > 0 ||
    (changes.scriptsOverwritten || 0) > 0 ||
    (changes.depsOverwritten || 0) > 0 ||
    (changes.devDepsAdded || 0) > 0 ||
    (changes.devDepsOverwritten || 0) > 0;

  if (!changed) {
    if (verbose) console.log('[baseline-install] package.json: no merge changes needed');
    return;
  }

  stats.packageJsonMerged += 1;
  if (verbose) {
    console.log(
      `[baseline-install] package.json merged: +${changes.scriptsAdded} scripts, +${changes.depsAdded} deps` +
      ((changes.devDepsAdded || 0) ? `, +${changes.devDepsAdded} devDeps` : '') +
      ((changes.scriptsOverwritten || 0) ? `, ~${changes.scriptsOverwritten} scripts` : '') +
      ((changes.depsOverwritten || 0) ? `, ~${changes.depsOverwritten} deps` : '') +
      ((changes.devDepsOverwritten || 0) ? `, ~${changes.devDepsOverwritten} devDeps` : '') +
      (changes.scriptsConflicts || changes.depsConflicts || changes.devDepsConflicts
        ? ` (conflicts: scripts=${changes.scriptsConflicts}, deps=${changes.depsConflicts}, devDeps=${changes.devDepsConflicts || 0})`
        : '')
    );
  }

  if (!dryRun) writeJson(dst, dstJson);
}

function main() {
  const args = parseFlagArgs(process.argv.slice(2));
  const positionals = Array.isArray(args._) ? args._.map((v) => String(v || '').trim()).filter(Boolean) : [];
  const targetRaw = String(args.to || args.t || args._[0] || '').trim();
  if (!targetRaw) {
    die('Missing target. Usage: baseline:install -- <path> [overlay|init] [overwrite] [dry-run] [verbose]');
  }

  let mode = 'overlay';
  const modeFlag = String(args.mode || '').trim();
  if (modeFlag) {
    mode = normalizeMode(modeFlag);
    if (!mode) die(`Invalid --mode ${modeFlag}; expected overlay|init`);
  } else {
    const posModeCandidate = String(positionals[1] || '').trim();
    const posMode = normalizeMode(posModeCandidate);
    if (posModeCandidate && posMode) mode = posMode;
  }

  const posFlags = positionals.slice(1).map((p) => String(p || '').trim().toLowerCase()).filter(Boolean);
  const overwrite = isTruthy(args.overwrite) || posFlags.includes('overwrite');
  const dryRun =
    isTruthy(args['dry-run'] || args.dryRun) ||
    posFlags.includes('dry-run') ||
    posFlags.includes('dryrun') ||
    posFlags.includes('dry_run');
  const verbose = isTruthy(args.verbose) || posFlags.includes('verbose');

  const sourceRoot = path.resolve(__dirname, '..', '..');
  const targetRoot = path.resolve(process.cwd(), targetRaw);
  const targetHasPackageJson = fs.existsSync(path.join(targetRoot, 'package.json'));

  if (!fs.existsSync(targetRoot)) {
    ensureDir(targetRoot, dryRun);
  } else if (!fs.statSync(targetRoot).isDirectory()) {
    die(`Target is not a directory: ${targetRoot}`);
  }

  const stats = { copied: 0, overwritten: 0, skipped: 0, packageJsonMerged: 0 };
  const files = walkFiles(sourceRoot).filter((f) => allowedByMode(f.relPosix, mode));

  if (verbose) {
    console.log(`[baseline-install] mode=${mode} overwrite=${overwrite ? '1' : '0'} dryRun=${dryRun ? '1' : '0'}`);
    console.log(`[baseline-install] from=${sourceRoot}`);
    console.log(`[baseline-install] to=${targetRoot}`);
  }

  for (const f of files) {
    const rel = f.relPosix;
    // Overlay safety: do not overwrite identity files by default.
    if (mode === 'overlay' && !overwrite) {
      if (rel === 'README.md') continue;
    }
    // Overlay safety: do not copy a baseline lockfile onto an existing Node repo.
    if (mode === 'overlay' && rel === 'package-lock.json' && targetHasPackageJson) {
      stats.skipped += 1;
      if (verbose) console.log('[baseline-install] skip: package-lock.json (target has package.json)');
      continue;
    }

    const dest = path.join(targetRoot, ...rel.split('/'));
    const res = copyFile({ from: f.full, to: dest, relPosix: rel, overwrite, dryRun, stats });
    if (verbose) console.log(`[baseline-install] ${res.action}: ${rel}`);
  }

  // In overlay mode, merge package.json rather than replacing it (when present).
  if (mode === 'overlay') {
    mergePackageJson({ sourceRoot, targetRoot, overwrite, dryRun, verbose, stats });

    // If the target did not have a Node toolchain yet, copy the baseline lockfile.
    if (!targetHasPackageJson) {
      const srcLock = path.join(sourceRoot, 'package-lock.json');
      const dstLock = path.join(targetRoot, 'package-lock.json');
      if (fs.existsSync(srcLock)) {
        const res = copyFile({ from: srcLock, to: dstLock, relPosix: 'package-lock.json', overwrite, dryRun, stats });
        if (verbose) console.log(`[baseline-install] ${res.action}: package-lock.json`);
      }
    }
  }

  console.log(
    `[baseline-install] Done (${mode}${dryRun ? ', dry-run' : ''}): copied=${stats.copied}, overwritten=${stats.overwritten}, skipped=${stats.skipped}, packageJsonMerged=${stats.packageJsonMerged}`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  isExcludedPath,
  allowedByMode,
  normalizeMode,
};
