#!/usr/bin/env node
/* eslint-disable no-console */
const { spawnSync } = require('child_process');

function getChangedFiles() {
  const override = process.env.CHANGE_GUARD_FILES;
  if (override && override.trim()) {
    return override
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  const resUnstaged = spawnSync('git', ['diff', '--name-only'], { encoding: 'utf8' });
  if (resUnstaged.status !== 0) {
    throw new Error(`git diff failed: ${resUnstaged.stderr || resUnstaged.status}`);
  }
  const resStaged = spawnSync('git', ['diff', '--name-only', '--cached'], { encoding: 'utf8' });
  if (resStaged.status !== 0) {
    throw new Error(`git diff --cached failed: ${resStaged.stderr || resStaged.status}`);
  }
  const resUntracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' });
  if (resUntracked.status !== 0) {
    throw new Error(`git ls-files failed: ${resUntracked.stderr || resUntracked.status}`);
  }

  const all = `${resUnstaged.stdout || ''}\n${resStaged.stdout || ''}\n${resUntracked.stdout || ''}`;
  const out = [];
  const seen = new Set();
  for (const line of String(all).split(/\r?\n/)) {
    const f = String(line || '').trim();
    if (!f || seen.has(f)) continue;
    seen.add(f);
    out.push(f);
  }
  return out;
}

function isTestFile(p) {
  return (
    /^tests\//.test(p) ||
    /\.selftest\./.test(p) ||
    /\.test\./.test(p)
  );
}

function isDocFile(p) {
  return /^docs\//.test(p) || /\.md$/i.test(p);
}

function isCodeFile(p) {
  if (isTestFile(p) || isDocFile(p)) return false;
  return (
    /^scripts\//.test(p) ||
    /^config\//.test(p) ||
    /^tooling\//.test(p) ||
    /^package(-lock)?\.json$/.test(p)
  );
}

function checkChangeGuard(files) {
  const code = [];
  const docs = [];
  const tests = [];
  for (const f of files) {
    if (isDocFile(f)) docs.push(f);
    if (isTestFile(f)) tests.push(f);
    if (isCodeFile(f)) code.push(f);
  }
  if (code.length === 0) {
    return { code, docs, tests, enforced: false };
  }
  if (docs.length === 0) {
    throw new Error(
      `[change-guard] Code changes detected without docs updates. Add docs for: ${code.slice(0, 5).join(', ')}`
    );
  }
  if (tests.length === 0) {
    throw new Error(
      `[change-guard] Code changes detected without tests. Add tests for: ${code.slice(0, 5).join(', ')}`
    );
  }
  return { code, docs, tests, enforced: true };
}

function main() {
  const files = getChangedFiles();
  const res = checkChangeGuard(files);
  if (res.code.length === 0) {
    console.log('[change-guard] No code changes detected; skipping docs/tests requirement.');
  } else {
    console.log(`[change-guard] Code changes: ${res.code.length}, docs: ${res.docs.length}, tests: ${res.tests.length}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

module.exports = { checkChangeGuard, getChangedFiles, isCodeFile, isDocFile, isTestFile };
