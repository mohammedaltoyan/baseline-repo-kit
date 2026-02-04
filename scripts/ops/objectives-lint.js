#!/usr/bin/env node
/**
 * Objectives Lint
 * Verifies code changes comply with project objectives:
 * - Zero hardcoding (no hard-coded DSNs/URLs in source or migrations)
 * - SIMPLE / best practice / SCALABLE / DYNAMIC (heuristic hints only)
 *
 * This is a heuristic scanner intended to catch obvious violations early.
 * It scans source (e.g., `scripts/` and other repo code) and SQL files (if present),
 * and ignores tests, docs, and environment templates.
 */

/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const root = process.cwd();

function readJsonSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((s) => String(s || '').trim())
    .filter(Boolean);
}

function escapeRegExp(input) {
  return String(input || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadObjectivesLintConfig() {
  const defaults = { version: 1, id_literal_fields: [] };
  const cfgPath = path.join(root, 'config', 'lint', 'objectives-lint.json');
  const cfg = readJsonSafe(cfgPath);
  if (!cfg || typeof cfg !== 'object') return defaults;
  return {
    ...defaults,
    ...cfg,
    id_literal_fields: Array.isArray(cfg.id_literal_fields) ? cfg.id_literal_fields : defaults.id_literal_fields,
  };
}

const objectivesCfg = loadObjectivesLintConfig();
const idLiteralFields = (() => {
  const fromEnv = parseCsv(process.env.OBJECTIVES_ID_LITERAL_FIELDS);
  if (fromEnv.length) return fromEnv;
  return (objectivesCfg.id_literal_fields || []).map((s) => String(s || '').trim()).filter(Boolean);
})();

const idLiteralSqlRe = idLiteralFields.length
  ? new RegExp(
      `\\b(${idLiteralFields.map(escapeRegExp).join('|')})\\b\\s*(=|,|::)\\s*('?[0-9a-fA-F-]{36}'?|\\d+)`,
      'i'
    )
  : null;

const idLiteralJsRe = idLiteralFields.length
  ? new RegExp(
      `\\b(${idLiteralFields.map(escapeRegExp).join('|')})\\b\\s*[:=]\\s*['\"][0-9a-fA-F-]{10,}['\"]`,
      'i'
    )
  : null;

function shouldSkipDir(relPosix) {
  const parts = relPosix.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  const lastLower = last.toLowerCase();
  if (parts.includes('node_modules') || parts.includes('.git')) return true;
  // Skip generated build artifacts (e.g., Vite build/, dist/) which can include
  // inlined localhost/external URL literals and are not source-of-truth.
  if (last === 'build' || last === 'dist') return true;
  if (relPosix === 'docs' || relPosix.startsWith('docs/')) return true;
  if (relPosix === 'tests' || relPosix.startsWith('tests/')) return true;
  if (relPosix === 'config/env' || relPosix.startsWith('config/env/')) return true;
  // Preserve prior behavior: ignore only root-level temp dirs (and variants),
  // not nested scripts/tmp used by unit tests.
  if (
    parts.length === 1
    && (
      lastLower === 'tmp'
      || lastLower === 'temp'
      || lastLower.startsWith('tmp-')
      || lastLower.startsWith('temp-')
    )
  ) return true;
  return false;
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    const rel = path.relative(root, p).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (shouldSkipDir(rel)) continue;
      acc = walk(p, acc);
    } else {
      acc.push(rel);
    }
  }
  return acc;
}

function readSafe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

let files = walk(root)
  .filter((f) => /\.(js|ts|mjs|cjs|sql)$/i.test(f))
  .filter((f) => !/^(docs|tests|config\/env)\//.test(f));
const includeRe = process.env.OBJECTIVES_LINT_INCLUDE ? new RegExp(process.env.OBJECTIVES_LINT_INCLUDE) : null;
if (includeRe) files = files.filter((f) => includeRe.test(f.replace(/\\/g, '/')));

const violations = [];
const rlsMissing = [];
const policyMissing = [];

const RULES = {
  DSN_URL: { msg: 'Hard-coded DSN (postgres://) detected' },
  LOCALHOST: { msg: 'Localhost literal detected in source' },
  ID_LITERAL: { msg: 'Hard-coded identifier literal detected' },
  RLS_OFF: { msg: 'RLS disabled or bypass detected (row_security off / DISABLE RLS)' },
  RLS_MISSING: { msg: 'CREATE TABLE without ENABLE ROW LEVEL SECURITY detected' },
  POLICY_MISSING: { msg: 'CREATE TABLE without CREATE POLICY detected' },
};

function isSuppressed(lines, idx, code) {
  // Look on this line or up to 3 lines above for a suppression with justification
  // JS/TS: // objectives:allow <CODE> Justification: ...
  // SQL   : -- objectives:allow <CODE> Justification: ...
  const re = new RegExp(`objectives:allow\\s+${code}\\b.*Justification:`, 'i');
  for (let i = Math.max(0, idx - 3); i <= idx; i++) {
    const raw = lines[i] || '';
    const l = raw.trim();
    // Accept both line comments and inline markers after code
    if (re.test(l)) return true;
    const commentIdx = raw.indexOf('--');
    if (commentIdx >= 0) {
      const comment = raw.slice(commentIdx).trim();
      if (re.test(comment)) return true;
    }
    const jsCommentIdx = raw.indexOf('//');
    if (jsCommentIdx >= 0) {
      const comment = raw.slice(jsCommentIdx).trim();
      if (re.test(comment)) return true;
    }
  }
  return false;
}

for (const rel of files) {
  const relPosix = rel.replace(/\\/g, '/');
  if (relPosix === 'scripts/ops/objectives-lint.js' || relPosix.endsWith('/scripts/ops/objectives-lint.js')) continue;
  const full = path.join(root, rel);
  const content = readSafe(full);
  const lines = content.split(/\r?\n/);
  const createdTables = [];
  const rlsEnabledTables = new Set();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isSql = /\.(sql)$/i.test(rel);

    // DSN URL
    if (/postgres(ql)?:\/\//i.test(line) && !isSuppressed(lines, i, 'DSN_URL')) {
      violations.push({ file: relPosix, line: i + 1, rule: 'DSN_URL', msg: RULES.DSN_URL.msg });
    }
    // Localhost literals (tests excluded by path filter)
    if (/(127\.0\.0\.1|https?:\/\/localhost(?:\:\d{2,5})?|localhost:\d{2,5})/i.test(line) && !isSuppressed(lines, i, 'LOCALHOST')) {
      violations.push({ file: relPosix, line: i + 1, rule: 'LOCALHOST', msg: RULES.LOCALHOST.msg });
    }
    if (isSql) {
      // RLS off (session-level)
      if (/\bSET\s+row_security\s*=\s*off\b/i.test(line) && !isSuppressed(lines, i, 'RLS_OFF')) {
        violations.push({ file: relPosix, line: i + 1, rule: 'RLS_OFF', msg: RULES.RLS_OFF.msg });
      }
      // RLS disabled at table-level
      if (/\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i.test(line) && !isSuppressed(lines, i, 'RLS_OFF')) {
        violations.push({ file: relPosix, line: i + 1, rule: 'RLS_OFF', msg: RULES.RLS_OFF.msg });
      }
      // Track created tables (schema-qualified or plain)
      const mCreate = line.match(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?([A-Za-z0-9_]+)"?\.)?"?([A-Za-z0-9_]+)"?(?=\s|\(|$)/i);
      if (mCreate) {
        const schema = (mCreate[1] || '').replace(/"/g, '');
        const table = (mCreate[2] || '').replace(/"/g, '');
        if (table) createdTables.push({ schema, table });
      }
      // Track RLS enablement for created tables
      const mRls = line.match(/\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:"?([A-Za-z0-9_]+)"?\.)?"?([A-Za-z0-9_]+)"?(?=\s|\(|$)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\b/i);
      if (mRls) {
        const schema = (mRls[1] || '').replace(/"/g, '');
        const table = (mRls[2] || '').replace(/"/g, '');
        if (table) {
          const name = (schema ? `${schema}.` : '') + table;
          rlsEnabledTables.add(name);
          rlsEnabledTables.add(table);
        }
      }
      // Configured identifier literal fields (heuristic, SQL)
      if (idLiteralSqlRe && idLiteralSqlRe.test(line) && !isSuppressed(lines, i, 'ID_LITERAL')) {
        violations.push({ file: relPosix, line: i + 1, rule: 'ID_LITERAL', msg: RULES.ID_LITERAL.msg });
      }
    } else {
      // Configured identifier literal fields (heuristic, JS/TS)
      if (idLiteralJsRe && idLiteralJsRe.test(line) && !isSuppressed(lines, i, 'ID_LITERAL')) {
        violations.push({ file: relPosix, line: i + 1, rule: 'ID_LITERAL', msg: RULES.ID_LITERAL.msg });
      }
    }
  }
  // Post-file SQL enforcement for ENABLE RLS on created tables
  if (/\.(sql)$/i.test(rel) && createdTables.length) {
    for (const t of createdTables) {
      const tName = (t.schema ? `${t.schema}.` : '') + t.table;
      const suppressed = /objectives:allow\s+RLS_MISSING\b/i.test(content);
      if (!suppressed && !rlsEnabledTables.has(tName) && !rlsEnabledTables.has(t.table)) {
        rlsMissing.push({ file: relPosix, line: 1, rule: 'RLS_MISSING', msg: `${RULES.RLS_MISSING.msg} (${tName})` });
      }
      // Policy presence (non-fatal by default; suppress with objectives:allow POLICY_MISSING)
      const supPol = /objectives:allow\s+POLICY_MISSING\b/i.test(content);
      const esc = tName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rePolicy = new RegExp(`CREATE\\s+POLICY[\\s\\S]*?\\bON\\s+(?:ONLY\\s+)?(?:"?${esc}"?)`, 'i');
      if (!rePolicy.test(content) && !supPol) {
        const rePolAlt = new RegExp(`CREATE\\s+POLICY[\\s\\S]*?\\bON\\s+[\\"\\w.]*${t.table}\\b`, 'i');
        if (!rePolAlt.test(content)) {
          policyMissing.push({ file: relPosix, line: 1, rule: 'POLICY_MISSING', msg: `${RULES.POLICY_MISSING.msg} (${tName})` });
        }
      }
    }
  }
}

if (violations.length) {
  console.error('[objectives-lint] Violations found:');
  for (const v of violations) {
    const label = v.msg || v.rule;
    console.error(` - ${v.file}:${v.line}: [${v.rule}] ${label}`);
  }
  process.exit(1);
}
// Handle RLS_MISSING warnings (non-fatal by default)
if (rlsMissing.length) {
  const enforce =
    String(process.env.OBJECTIVES_ENFORCE_RLS_MISSING || '0') === '1' &&
    !!includeRe;
  const header = enforce
    ? '[objectives-lint] RLS Missing (enforced):'
    : '[objectives-lint] RLS Missing (warnings):';
  console.error(header);
  for (const v of rlsMissing) {
    console.error(` - ${v.file}:${v.line}: [${v.rule}] ${v.msg}`);
  }
  if (enforce) process.exit(1);
}

// Handle POLICY_MISSING warnings (non-fatal by default)
if (policyMissing.length) {
  const enforcePol =
    String(process.env.OBJECTIVES_ENFORCE_POLICY_MISSING || '0') === '1' &&
    !!includeRe;
  const headerPol = enforcePol
    ? '[objectives-lint] Policy Missing (enforced):'
    : '[objectives-lint] Policy Missing (warnings):';
  console.error(headerPol);
  for (const v of policyMissing) {
    console.error(` - ${v.file}:${v.line}: [${v.rule}] ${v.msg}`);
  }
  if (enforcePol) process.exit(1);
}

console.log('[objectives-lint] OK - no objective violations detected');
