'use strict';

const fs = require('fs');
const path = require('path');
const { MIGRATIONS_DIR } = require('./constants');

function parseSemver(value) {
  const m = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(String(value || '').trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function semverCompare(a, b) {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  if (!va || !vb) return 0;
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  return va.patch - vb.patch;
}

function loadMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];

  const entries = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
  const migrations = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const version = String(entry.name || '').trim();
    if (!parseSemver(version)) continue;

    const modPath = path.join(MIGRATIONS_DIR, version, 'index.js');
    if (!fs.existsSync(modPath)) continue;

    // eslint-disable-next-line global-require, import/no-dynamic-require
    const migration = require(modPath);
    migrations.push({
      version,
      description: String(migration && migration.description || ''),
      apply: migration && migration.apply,
    });
  }

  migrations.sort((a, b) => semverCompare(a.version, b.version));
  return migrations;
}

function resolvePendingMigrations({ currentVersion, targetVersion, migrations }) {
  const current = String(currentVersion || '0.0.0');
  const target = String(targetVersion || current);
  const list = Array.isArray(migrations) ? migrations : [];

  return list.filter((migration) => (
    semverCompare(migration.version, current) > 0 &&
    semverCompare(migration.version, target) <= 0
  ));
}

module.exports = {
  loadMigrations,
  parseSemver,
  resolvePendingMigrations,
  semverCompare,
};
