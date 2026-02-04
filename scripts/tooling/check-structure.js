#!/usr/bin/env node

/**
 * Repository structure guard.
 * Ensures we keep a clean baseline layout without stray artefacts or
 * accidentally tracked backups/secrets.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const errors = [];
const warnings = [];

function readJsonSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (_) {
    return null;
  }
}

function toBool(value, defaultValue) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return defaultValue;
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
    return defaultValue;
  }
  return defaultValue;
}

function gitLsFiles(patterns) {
  const args = ['ls-files', '--', ...patterns];
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function gitLsAllFiles() {
  const result = spawnSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, '/'));
}

function isGitWorkTree() {
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0 && String(result.stdout || '').trim() === 'true';
}

function loadStructureRules() {
  const defaults = {
    forbidden_paths: [
      { path: 'docs/product/Exmaples', message: 'Remove docs/product/Exmaples; use docs/product/examples.' },
    ],
    forbidden_tracked_path_regexes: [],
    scripts_root_allowed_files: ['README.md'],
    scripts_root_message: 'scripts/ root must contain only README.md; move ad-hoc scripts into a subfolder under scripts/.',
  };

  const rulesPath = path.join(repoRoot, 'config', 'lint', 'structure-rules.json');
  if (!fs.existsSync(rulesPath)) {
    return defaults;
  }

  const loaded = readJsonSafe(rulesPath);
  if (!loaded || typeof loaded !== 'object') {
    warnings.push(`Unable to parse config/lint/structure-rules.json; using defaults.`);
    return defaults;
  }

  return {
    ...defaults,
    ...loaded,
    forbidden_paths: Array.isArray(loaded.forbidden_paths) ? loaded.forbidden_paths : defaults.forbidden_paths,
    forbidden_tracked_path_regexes: Array.isArray(loaded.forbidden_tracked_path_regexes)
      ? loaded.forbidden_tracked_path_regexes
      : defaults.forbidden_tracked_path_regexes,
    scripts_root_allowed_files: Array.isArray(loaded.scripts_root_allowed_files)
      ? loaded.scripts_root_allowed_files
      : defaults.scripts_root_allowed_files,
  };
}

const structureRules = loadStructureRules();

const forbiddenPaths = (structureRules.forbidden_paths || [])
  .map((entry) => {
    if (!entry) return null;
    if (typeof entry === 'string') return { path: entry, message: '' };
    if (typeof entry === 'object') {
      return { path: String(entry.path || '').trim(), message: String(entry.message || '').trim() };
    }
    return null;
  })
  .filter((entry) => entry && entry.path);

for (const relPath of forbiddenPaths) {
  const fullPath = path.join(repoRoot, relPath.path);
  if (fs.existsSync(fullPath)) {
    errors.push(relPath.message || `Remove ${relPath.path}; use the canonical directories instead.`);
  }
}

// Root scripts folder should stay layout-only; keep real scripts under subfolders.
try {
  const scriptsDir = path.join(repoRoot, 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const allowed = new Set(
      (structureRules.scripts_root_allowed_files || [])
        .map((name) => String(name || '').trim())
        .filter(Boolean)
    );
    const rootFiles = fs.readdirSync(scriptsDir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name);
    const extras = rootFiles.filter((name) => !allowed.has(name));
    if (extras.length > 0) {
      const msg = String(structureRules.scripts_root_message || '').trim()
        || 'scripts/ root must contain only README.md; move ad-hoc scripts into a subfolder under scripts/.';
      errors.push(`${msg} Found: ${extras.slice(0, 10).join(', ')}${extras.length > 10 ? ` (+${extras.length - 10} more)` : ''}`);
    }
  }
} catch (_) {
  // ignore
}

// Guard against tracked backup artefacts (keep them untracked under tmp/ when needed).
try {
  const tracked = gitLsAllFiles();
  const rules = (structureRules.forbidden_tracked_path_regexes || [])
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const id = String(r.id || '').trim() || 'rule';
      const reRaw = String(r.regex || '').trim();
      if (!reRaw) return null;
      let re;
      try { re = new RegExp(reRaw, 'i'); } catch (_) { return null; }
      const message = String(r.message || '').trim() || `Tracked files match forbidden pattern (${id}).`;
      return { id, re, message };
    })
    .filter(Boolean);

  for (const rule of rules) {
    const matches = tracked.filter((p) => rule.re.test(p));
    if (!matches.length) continue;
    errors.push(
      `${rule.message} Files: ${matches.slice(0, 20).join(', ')}${matches.length > 20 ? ` (+${matches.length - 20} more)` : ''}`
    );
  }
} catch (_) {
  // ignore
}

const trackedLogs = gitLsFiles(['logs', 'logs/**']);
if (trackedLogs.length > 0) {
  errors.push(`Logs directory must stay untracked. Files: ${trackedLogs.join(', ')}`);
}

const trackedTemp = gitLsFiles(['temp', 'temp/**', 'tmp', 'tmp/**', 'temp.txt']);
if (trackedTemp.length > 0) {
  errors.push(`Temporary artefacts detected: ${trackedTemp.join(', ')}`);
}

const trackedRootArtifacts = gitLsFiles([':(top)tmp-*', ':(top)temp-*', ':(top)-']);
if (trackedRootArtifacts.length > 0) {
  errors.push(
    `Root-level debug artefacts must not be tracked (use tmp/ or docs/ops/evidence instead). Files: ${trackedRootArtifacts.join(', ')}`
  );
}

const lockfilePath = path.join(repoRoot, 'package-lock.json');
if (!fs.existsSync(lockfilePath)) {
  errors.push('package-lock.json must exist to guarantee deterministic installs.');
} else if (isGitWorkTree()) {
  const lockfileTracked = gitLsFiles(['package-lock.json']);
  if (lockfileTracked.length === 0) {
    errors.push('package-lock.json must be tracked to guarantee deterministic installs.');
  }
} else {
  warnings.push('Not a git worktree; skipping tracked-file checks (package-lock.json).');
}

// docs/ops/evidence: keep bucket naming stable (no duplicates per day; no new YYYYMMDD buckets).
try {
  const evidenceCfg = (structureRules && typeof structureRules === 'object')
    ? (structureRules.evidence || {})
    : {};
  const evidenceDirRel = String(evidenceCfg.dir || 'docs/ops/evidence').trim().replace(/\\/g, '/');
  const canonicalFormat = String(evidenceCfg.canonical_date_format || 'YYYY-MM-DD').trim() || 'YYYY-MM-DD';
  const forbidDuplicateDayBuckets = toBool(evidenceCfg.forbid_duplicate_day_buckets, true);
  const forbidCompactBuckets = toBool(evidenceCfg.forbid_compact_buckets, false);
  const forbidNewCompactBuckets = toBool(evidenceCfg.forbid_new_compact_buckets, true);
  const forbidRedundantArtifactZips = toBool(evidenceCfg.forbid_redundant_artifact_zips, false);

  const evidenceDir = path.join(repoRoot, ...evidenceDirRel.split('/').filter(Boolean));
  if (!fs.existsSync(evidenceDir)) {
    // No evidence directory; nothing to validate.
  } else {

  const normalizeBucket = (name) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(name)) return name;
    if (/^\d{8}$/.test(name)) return `${name.slice(0, 4)}-${name.slice(4, 6)}-${name.slice(6, 8)}`;
    return '';
  };

  const buckets = fs.readdirSync(evidenceDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const byDay = new Map();
  for (const bucket of buckets) {
    const day = normalizeBucket(bucket);
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(bucket);
  }

  for (const [day, names] of byDay.entries()) {
    if (names.length <= 1) continue;
    const msg = `${evidenceDirRel} has multiple buckets for ${day}: ${names.sort().join(', ')}`;
    if (forbidDuplicateDayBuckets) errors.push(msg);
    else warnings.push(msg);
  }

  if (forbidCompactBuckets) {
    const compact = buckets.filter((bucket) => /^\d{8}$/.test(bucket));
    if (compact.length) {
      errors.push(
        `Evidence buckets must use ${canonicalFormat} format. Found: ${compact.sort().join(', ')}`
      );
    }
  } else if (forbidNewCompactBuckets) {
    const trackedEvidenceFiles = gitLsFiles([`${evidenceDirRel}/**`]);
    const prefixParts = evidenceDirRel.split('/').filter(Boolean);
    const trackedBuckets = new Set();

    for (const filePath of trackedEvidenceFiles) {
      const norm = String(filePath || '').replace(/\\/g, '/');
      const parts = norm.split('/').filter(Boolean);
      if (parts.length <= prefixParts.length) continue;
      let matches = true;
      for (let i = 0; i < prefixParts.length; i++) {
        if (parts[i] !== prefixParts[i]) { matches = false; break; }
      }
      if (!matches) continue;
      trackedBuckets.add(parts[prefixParts.length]);
    }

    const newCompact = buckets
      .filter((bucket) => /^\d{8}$/.test(bucket))
      .filter((bucket) => !trackedBuckets.has(bucket));

    if (newCompact.length) {
      errors.push(
        `New evidence buckets must use ${canonicalFormat} format. Found: ${newCompact.sort().join(', ')}`
      );
    }
  }

  if (forbidRedundantArtifactZips) {
    const trackedEvidenceFiles = gitLsFiles([`${evidenceDirRel}/**`])
      .map((p) => String(p || '').replace(/\\/g, '/'));
    const zipFiles = trackedEvidenceFiles.filter((p) => p.toLowerCase().endsWith('.zip'));

    if (zipFiles.length) {
      const dirSet = new Set();
      for (const filePath of trackedEvidenceFiles) {
        const parts = filePath.split('/').filter(Boolean);
        parts.pop(); // remove filename
        while (parts.length) {
          dirSet.add(parts.join('/'));
          parts.pop();
        }
      }

      const redundant = [];
      for (const zipPath of zipFiles) {
        const extractedDir = zipPath.replace(/\.zip$/i, '');
        if (dirSet.has(extractedDir)) redundant.push(zipPath);
      }

      if (redundant.length) {
        errors.push(
          `Evidence artifacts must not be stored as both zip and extracted folder. Remove redundant zips: ${redundant
            .slice(0, 20)
            .join(', ')}${redundant.length > 20 ? ` (+${redundant.length - 20} more)` : ''}`
        );
      }
    }
  }
  }
} catch (_) {
  // ignore
}

if (warnings.length) {
  console.warn('[lint:structure] Warnings (non-blocking):');
  for (const w of warnings) console.warn(`  - ${w}`);
}

if (errors.length) {
  console.error('[lint:structure] Errors:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log('[lint:structure] Repository layout is clean.');
