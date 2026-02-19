#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { readJsonSafe } = require('../utils/json');
const { defaultConfig } = require('../../tooling/apps/baseline-engine/lib/config');
const { CAPABILITY_KEYS } = require('../../tooling/apps/baseline-engine/lib/capabilities/github');
const { loadModules } = require('../../tooling/apps/baseline-engine/lib/modules');
const {
  BASE_CONTENT_FILE,
  CAPABILITIES_FILE,
  CONFIG_FILE,
  DEFAULT_ENVIRONMENTS,
  DEFAULT_MODULES,
  MANAGED_FILES_FILE,
  STATE_FILE,
} = require('../../tooling/apps/baseline-engine/lib/constants');

const CONTRACT_FILE = path.join('config', 'policy', 'baseline-v22-contract.json');

function getAtPath(value, dottedPath) {
  const parts = String(dottedPath || '').split('.').filter(Boolean);
  let current = value;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function arraysEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeContract(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    version: Number(source.version || 0),
    required_paths: Array.isArray(source.required_paths) ? source.required_paths : [],
    required_cli_commands: Array.isArray(source.required_cli_commands) ? source.required_cli_commands : [],
    required_target_state_files: Array.isArray(source.required_target_state_files) ? source.required_target_state_files : [],
    required_capability_keys: Array.isArray(source.required_capability_keys) ? source.required_capability_keys : [],
    required_default_values: source.required_default_values && typeof source.required_default_values === 'object'
      ? source.required_default_values
      : {},
    required_default_environments: Array.isArray(source.required_default_environments)
      ? source.required_default_environments
      : [],
    required_default_modules: Array.isArray(source.required_default_modules) ? source.required_default_modules : [],
    require_non_core_modules_opt_in: source.require_non_core_modules_opt_in !== false,
    required_module_contract_files: Array.isArray(source.required_module_contract_files)
      ? source.required_module_contract_files
      : [],
  };
}

function loadContract(repoRoot) {
  const filePath = path.join(repoRoot, CONTRACT_FILE);
  const parsed = readJsonSafe(filePath, null);
  return normalizeContract(parsed);
}

function lintContract({ repoRoot = process.cwd(), contract = null } = {}) {
  const root = path.resolve(repoRoot);
  const cfg = normalizeContract(contract || loadContract(root));
  const errors = [];
  const warnings = [];

  if (cfg.version !== 1) {
    errors.push(`Invalid contract version in ${CONTRACT_FILE}; expected 1, received ${cfg.version}`);
  }

  const contractPath = path.join(root, CONTRACT_FILE);
  if (!fs.existsSync(contractPath)) {
    errors.push(`Missing contract file: ${CONTRACT_FILE}`);
  }

  for (const rel of cfg.required_paths) {
    const abs = path.join(root, String(rel || ''));
    if (!fs.existsSync(abs)) {
      errors.push(`Missing required path from contract: ${rel}`);
    }
  }

  const packageJsonPath = path.join(root, 'package.json');
  const packageJson = readJsonSafe(packageJsonPath, {});
  const scripts = packageJson && packageJson.scripts && typeof packageJson.scripts === 'object'
    ? packageJson.scripts
    : {};

  for (const command of cfg.required_cli_commands) {
    if (typeof scripts[command] !== 'string' || !String(scripts[command]).trim()) {
      errors.push(`Missing package.json script required by contract: ${command}`);
    }
  }

  const expectedStateFiles = [CONFIG_FILE, STATE_FILE, MANAGED_FILES_FILE, CAPABILITIES_FILE];
  for (const rel of cfg.required_target_state_files) {
    if (!expectedStateFiles.includes(rel)) {
      errors.push(`required_target_state_files contains unsupported entry: ${rel}`);
    }
  }
  for (const rel of expectedStateFiles) {
    if (!cfg.required_target_state_files.includes(rel)) {
      errors.push(`required_target_state_files must include ${rel}`);
    }
  }

  const requiredCapabilities = new Set(cfg.required_capability_keys.map((entry) => String(entry || '').trim()).filter(Boolean));
  const runtimeCapabilities = new Set(CAPABILITY_KEYS.map((entry) => String(entry || '').trim()).filter(Boolean));
  for (const key of requiredCapabilities) {
    if (!runtimeCapabilities.has(key)) {
      errors.push(`Contract capability key is not available at runtime: ${key}`);
    }
  }
  for (const key of runtimeCapabilities) {
    if (!requiredCapabilities.has(key)) {
      warnings.push(`Runtime capability key missing from contract map: ${key}`);
    }
  }

  const defaults = defaultConfig({
    maintainersCount: 3,
    components: [{ id: 'application', name: 'application', path: 'apps', enabled: true }],
    profile: 'strict',
  });

  for (const [dottedPath, expected] of Object.entries(cfg.required_default_values)) {
    const actual = getAtPath(defaults, dottedPath);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push(`Default config mismatch for ${dottedPath}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  const defaultEnvNames = (defaults.deployments && Array.isArray(defaults.deployments.environments)
    ? defaults.deployments.environments
    : [])
    .map((entry) => String(entry && entry.name || '').trim())
    .filter(Boolean);

  if (!arraysEqual(DEFAULT_ENVIRONMENTS, cfg.required_default_environments)) {
    errors.push(
      `DEFAULT_ENVIRONMENTS drift: expected ${JSON.stringify(cfg.required_default_environments)}, got ${JSON.stringify(DEFAULT_ENVIRONMENTS)}`
    );
  }

  if (!arraysEqual(defaultEnvNames, cfg.required_default_environments)) {
    errors.push(
      `defaultConfig environments drift: expected ${JSON.stringify(cfg.required_default_environments)}, got ${JSON.stringify(defaultEnvNames)}`
    );
  }

  const defaultModules = Array.isArray(defaults.modules && defaults.modules.enabled) ? defaults.modules.enabled : [];
  if (!arraysEqual(DEFAULT_MODULES, cfg.required_default_modules)) {
    errors.push(
      `DEFAULT_MODULES drift: expected ${JSON.stringify(cfg.required_default_modules)}, got ${JSON.stringify(DEFAULT_MODULES)}`
    );
  }

  for (const moduleId of cfg.required_default_modules) {
    if (!defaultModules.includes(moduleId)) {
      errors.push(`defaultConfig.modules.enabled missing required default module: ${moduleId}`);
    }
  }

  if (cfg.require_non_core_modules_opt_in) {
    const allowed = new Set(cfg.required_default_modules);
    const nonCoreEnabled = defaultModules.filter((moduleId) => !allowed.has(moduleId));
    if (nonCoreEnabled.length > 0) {
      errors.push(`Non-core modules must be opt-in by default; unexpected default-enabled modules: ${nonCoreEnabled.join(', ')}`);
    }
  }

  const modules = loadModules();
  for (const mod of modules) {
    const moduleRoot = mod.root && String(mod.root).trim() ? mod.root : '';
    if (!moduleRoot) {
      errors.push(`Module ${mod.id} has invalid root path`);
      continue;
    }

    for (const rel of cfg.required_module_contract_files) {
      const abs = path.join(moduleRoot, rel);
      if (!fs.existsSync(abs)) {
        errors.push(`Module ${mod.id} missing required contract file: ${rel}`);
      }
    }

    if (!mod.valid) {
      errors.push(`Module ${mod.id} contract invalid: ${(mod.errors || []).join(' | ')}`);
    }
  }

  if (!BASE_CONTENT_FILE || !String(BASE_CONTENT_FILE).startsWith('.baseline/')) {
    errors.push(`BASE_CONTENT_FILE must remain in .baseline namespace; got ${BASE_CONTENT_FILE}`);
  }

  return {
    contract: cfg,
    errors,
    warnings,
  };
}

function run() {
  const result = lintContract({ repoRoot: process.cwd() });
  if (result.warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('[baseline-v22-contract-lint] Warnings:');
    for (const warning of result.warnings) {
      // eslint-disable-next-line no-console
      console.warn(` - ${warning}`);
    }
  }

  if (result.errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error('[baseline-v22-contract-lint] Errors:');
    for (const error of result.errors) {
      // eslint-disable-next-line no-console
      console.error(` - ${error}`);
    }
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log('[baseline-v22-contract-lint] OK');
}

if (require.main === module) {
  run();
}

module.exports = {
  loadContract,
  lintContract,
  run,
};
