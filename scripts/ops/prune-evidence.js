#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

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
  }
  return defaultValue;
}

function toInt(value, defaultValue) {
  const n = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(n)) return defaultValue;
  return n;
}

function normalizeRel(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function parseArgs(argv) {
  const args = {
    dryRun: true,
    bucket: '',
    maxActions: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = String(argv[i] || '').trim();
    if (!token) continue;

    if (token === '--apply') {
      args.dryRun = false;
      continue;
    }

    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (token === '--bucket') {
      args.bucket = String(argv[i + 1] || '').trim();
      i++;
      continue;
    }

    if (token === '--max-actions') {
      args.maxActions = argv[i + 1];
      i++;
      continue;
    }

    if (token === '-h' || token === '--help') {
      args.help = true;
      continue;
    }

    throw new Error(`Unknown arg: ${token}`);
  }

  return args;
}

function isWithinRoot(rootDir, candidatePath) {
  const rel = path.relative(rootDir, candidatePath);
  if (!rel) return true;
  if (rel.startsWith('..')) return false;
  return !path.isAbsolute(rel);
}

function listTimestampDirs(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/.test(name))
    .sort();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/ops/prune-evidence.js [--dry-run|--apply] [--bucket <name>] [--max-actions <n>]');
    process.exit(0);
  }

  const configPath = path.join(repoRoot, 'config', 'lint', 'structure-rules.json');
  const config = readJsonSafe(configPath) || {};
  const evidenceCfg = (config && typeof config === 'object') ? (config.evidence || {}) : {};
  const evidenceDirRel = normalizeRel(evidenceCfg.dir || 'docs/ops/evidence');
  const evidenceRoot = path.join(repoRoot, ...evidenceDirRel.split('/').filter(Boolean));

  const retentionCfg = (evidenceCfg && typeof evidenceCfg === 'object') ? (evidenceCfg.retention || {}) : {};
  const enabled = toBool(retentionCfg.enabled, false);
  if (!enabled) {
    console.log('[prune-evidence] retention disabled; exiting');
    return;
  }

  const bucketConfigs = Array.isArray(retentionCfg.buckets) ? retentionCfg.buckets : [];
  const maxActions = toInt(args.maxActions, toInt(retentionCfg.max_actions, 50));
  const bucketFilter = String(args.bucket || '').trim();

  if (!fs.existsSync(evidenceRoot)) {
    console.log(`[prune-evidence] evidence dir missing: ${evidenceDirRel}`);
    return;
  }

  const pendingDeletes = [];
  for (const cfg of bucketConfigs) {
    if (!cfg || typeof cfg !== 'object') continue;
    const bucketName = String(cfg.bucket || cfg.path || '').trim();
    if (!bucketName) continue;
    if (bucketFilter && bucketName !== bucketFilter) continue;

    const maxEntries = toInt(cfg.max_entries, -1);
    if (!Number.isFinite(maxEntries) || maxEntries < 0) continue;

    const bucketRoot = path.join(evidenceRoot, bucketName);
    const dirs = listTimestampDirs(bucketRoot);
    const excess = dirs.length - maxEntries;
    if (excess <= 0) continue;

    for (const dirName of dirs.slice(0, excess)) {
      const abs = path.join(bucketRoot, dirName);
      if (!isWithinRoot(evidenceRoot, abs)) {
        throw new Error(`Refusing to prune outside evidence root: ${abs}`);
      }
      pendingDeletes.push({
        bucket: bucketName,
        dirName,
        abs,
        rel: `${evidenceDirRel}/${bucketName}/${dirName}`,
      });
      if (pendingDeletes.length >= maxActions) break;
    }

    if (pendingDeletes.length >= maxActions) break;
  }

  if (!pendingDeletes.length) {
    console.log('[prune-evidence] no evidence folders to prune');
    return;
  }

  const byBucket = pendingDeletes.reduce((acc, entry) => {
    acc[entry.bucket] = (acc[entry.bucket] || 0) + 1;
    return acc;
  }, {});

  console.log(`[prune-evidence] mode=${args.dryRun ? 'dry-run' : 'apply'} maxActions=${maxActions}`);
  for (const [bucket, count] of Object.entries(byBucket)) {
    console.log(`[prune-evidence] bucket=${bucket} prune=${count}`);
  }

  for (const entry of pendingDeletes) {
    if (args.dryRun) {
      console.log('[prune-evidence] would delete', entry.rel);
      continue;
    }
    fs.rmSync(entry.abs, { recursive: true, force: true });
    console.log('[prune-evidence] deleted', entry.rel);
  }

  console.log(`[prune-evidence] done: ${args.dryRun ? 'would prune' : 'pruned'} ${pendingDeletes.length} folder(s)`);
}

try {
  main();
} catch (err) {
  console.error('[prune-evidence] failed:', err && err.message ? err.message : err);
  process.exit(1);
}

