#!/usr/bin/env node
/*
 * docs-clean.js
 * Scans docs/ for common encoding artifacts and optionally cleans them.
 *
 * Usage:
 *   node scripts/tooling/docs-clean.js                 # report only
 *   DOCS_CLEAN_WRITE=1 node scripts/tooling/docs-clean.js  # fix in place
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const docsDir = path.join(root, 'docs');
const write = String(process.env.DOCS_CLEAN_WRITE || '0') === '1';

const scanExtensions = new Set(['.md']);
if (String(process.env.DOCS_CLEAN_INCLUDE_MMD || '0') === '1') {
  scanExtensions.add('.mmd');
}

// Historical artefacts are integrity-bound (review digests, evidence bundles).
// Avoid rewriting them by default.
const skipPathPrefixes = [
  'docs/ops/plans',
  'docs/ops/evidence',
];

function normalizeRel(p) {
  return path.relative(root, p).replace(/\\/g, '/');
}

function shouldSkipDir(dirPath) {
  const rel = normalizeRel(dirPath);
  return skipPathPrefixes.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`));
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDir(fullPath)) continue;
      acc = walk(fullPath, acc);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (scanExtensions.has(ext)) acc.push(fullPath);
  }
  return acc;
}

function cleanContent(input) {
  let out = String(input || '');

  // Remove control chars commonly introduced by broken terminals/editors.
  out = out.replace(/\u001a/g, ''); // SUB control

  // Normalize common mojibake markers we never want in docs.
  out = out.replace(/\uFFFD/g, ''); // replacement char
  out = out.replace(/\u00A0/g, ' '); // NBSP -> space

  // Replace common emoji markers with ASCII labels.
  out = out.replace(/\u2705/g, '[OK]'); // U+2705
  out = out.replace(/\u26A0\uFE0F?/g, '[WARN]'); // U+26A0 (+ optional U+FE0F)

  // Normalize punctuation to ASCII to avoid Windows codepage rendering issues.
  out = out.replace(/[\u201C\u201D]/g, '"'); // U+201C/U+201D
  out = out.replace(/[\u2018\u2019]/g, "'"); // U+2018/U+2019
  out = out.replace(/\u2026/g, '...'); // U+2026
  out = out.replace(/\u2192/g, ' -> '); // U+2192
  out = out.replace(/[\u2013\u2014]/g, '-'); // U+2013/U+2014

  // Trim trailing whitespace.
  out = out.replace(/[ \t]+$/gm, '');

  // Ensure newline at EOF.
  if (out && !out.endsWith('\n')) out += '\n';
  return out;
}

function main() {
  if (!fs.existsSync(docsDir)) {
    console.log('[docs-clean] No docs/ directory');
    process.exit(0);
  }

  const files = walk(docsDir);
  let changed = 0;
  let reported = 0;

  for (const filePath of files) {
    const original = fs.readFileSync(filePath, 'utf8');
    const cleaned = cleanContent(original);
    if (original === cleaned) continue;

    reported++;
    if (!write) {
      console.log('[docs-clean] Needs clean:', path.relative(root, filePath));
      continue;
    }

    fs.writeFileSync(filePath, cleaned, 'utf8');
    changed++;
    console.log('[docs-clean] Fixed', path.relative(root, filePath));
  }

  if (!write && reported) {
    console.log(`[docs-clean] ${reported} file(s) need clean. Run with DOCS_CLEAN_WRITE=1 to fix.`);
    return;
  }

  if (!reported) {
    console.log('[docs-clean] OK - no issues found');
    return;
  }

  console.log(`[docs-clean] Cleaned ${changed} file(s)`);
}

main();
