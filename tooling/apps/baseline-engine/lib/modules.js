'use strict';

const fs = require('fs');
const path = require('path');
const { MODULES_DIR } = require('./constants');
const { readJsonSafe, toPosix } = require('./util/fs');

function loadModule(moduleDir) {
  const root = path.join(MODULES_DIR, moduleDir);
  const manifestPath = path.join(root, 'module.json');
  const schemaFragmentPath = path.join(root, 'schema.fragment.json');
  const capabilityRequirementsPath = path.join(root, 'capability_requirements.json');

  const manifest = readJsonSafe(manifestPath, null);
  const schemaFragment = readJsonSafe(schemaFragmentPath, null);
  const capabilityRequirements = readJsonSafe(capabilityRequirementsPath, null);

  if (!manifest) {
    return {
      id: moduleDir,
      valid: false,
      errors: [`Missing or invalid module.json (${toPosix(path.relative(process.cwd(), manifestPath))})`],
    };
  }

  const errors = [];
  if (!schemaFragment) {
    errors.push(`Missing or invalid schema.fragment.json (${toPosix(path.relative(process.cwd(), schemaFragmentPath))})`);
  }
  if (!capabilityRequirements) {
    errors.push(`Missing or invalid capability_requirements.json (${toPosix(path.relative(process.cwd(), capabilityRequirementsPath))})`);
  }

  const generatorsDir = path.join(root, 'generators');
  const migrationsDir = path.join(root, 'migrations');

  return {
    ...manifest,
    id: String(manifest.id || moduleDir),
    root,
    schema_fragment: schemaFragment,
    capability_requirements: capabilityRequirements,
    generators_dir: generatorsDir,
    migrations_dir: migrationsDir,
    valid: errors.length === 0,
    errors,
  };
}

function loadModules() {
  if (!fs.existsSync(MODULES_DIR)) {
    throw new Error(`Modules directory not found: ${MODULES_DIR}`);
  }

  const entries = fs.readdirSync(MODULES_DIR, { withFileTypes: true });
  const modules = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    modules.push(loadModule(entry.name));
  }

  return modules;
}

function assertEnabledModulesExist(enabled, modules) {
  const list = Array.isArray(enabled) ? enabled : [];
  const available = new Set((Array.isArray(modules) ? modules : []).map((m) => String(m && m.id || '').trim()));
  const missing = list.filter((id) => !available.has(String(id || '').trim()));
  if (missing.length > 0) {
    throw new Error(`Enabled modules not found: ${missing.join(', ')}`);
  }
}

module.exports = {
  assertEnabledModulesExist,
  loadModules,
};
