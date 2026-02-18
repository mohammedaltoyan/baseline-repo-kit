'use strict';

const fs = require('fs');
const path = require('path');
const { MODULES_DIR } = require('./constants');
const { readJsonSafe, toPosix } = require('./util/fs');

function normalizeCapabilityRequirements(value) {
  const source = value && typeof value === 'object' ? value : {};
  const requires = Array.isArray(source.requires)
    ? source.requires.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const degradeStrategy = String(source.degrade_strategy || 'warn').trim().toLowerCase();
  return {
    requires,
    degrade_strategy: ['warn', 'skip', 'fail'].includes(degradeStrategy) ? degradeStrategy : 'warn',
    remediation: source.remediation && typeof source.remediation === 'object' ? source.remediation : {},
  };
}

function loadRuntimeModule(filePath, exportName) {
  if (!fs.existsSync(filePath)) return null;
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const loaded = require(filePath);
  if (!loaded || typeof loaded !== 'object') {
    return {
      valid: false,
      error: `Invalid ${exportName} module export (${toPosix(filePath)})`,
      module: null,
    };
  }
  return {
    valid: true,
    error: '',
    module: loaded,
  };
}

function loadModule(moduleDir) {
  const root = path.join(MODULES_DIR, moduleDir);
  const manifestPath = path.join(root, 'module.json');
  const schemaFragmentPath = path.join(root, 'schema.fragment.json');
  const capabilityRequirementsPath = path.join(root, 'capability_requirements.json');
  const generatorPath = path.join(root, 'generators', 'index.js');
  const migrationsPath = path.join(root, 'migrations', 'index.js');

  const manifest = readJsonSafe(manifestPath, null);
  const schemaFragment = readJsonSafe(schemaFragmentPath, null);
  const capabilityRequirements = normalizeCapabilityRequirements(readJsonSafe(capabilityRequirementsPath, null));

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
  if (!fs.existsSync(capabilityRequirementsPath)) {
    errors.push(`Missing or invalid capability_requirements.json (${toPosix(path.relative(process.cwd(), capabilityRequirementsPath))})`);
  }

  const generatorRuntime = loadRuntimeModule(generatorPath, 'generator');
  const migrationRuntime = loadRuntimeModule(migrationsPath, 'migration');
  if (generatorRuntime && !generatorRuntime.valid) {
    errors.push(generatorRuntime.error);
  }
  if (migrationRuntime && !migrationRuntime.valid) {
    errors.push(migrationRuntime.error);
  }

  if (!generatorRuntime || !generatorRuntime.module || typeof generatorRuntime.module.generate !== 'function') {
    errors.push(`Module generator missing generate() (${toPosix(path.relative(process.cwd(), generatorPath))})`);
  }

  const id = String(manifest.id || moduleDir).trim();
  if (generatorRuntime && generatorRuntime.module && generatorRuntime.module.id) {
    const generatorId = String(generatorRuntime.module.id || '').trim();
    if (generatorId && generatorId !== id) {
      errors.push(`Generator id mismatch for ${id}: expected ${id}, received ${generatorId}`);
    }
  }
  if (migrationRuntime && migrationRuntime.module && migrationRuntime.module.id) {
    const migrationId = String(migrationRuntime.module.id || '').trim();
    if (migrationId && migrationId !== id) {
      errors.push(`Migration id mismatch for ${id}: expected ${id}, received ${migrationId}`);
    }
  }

  return {
    ...manifest,
    id,
    root,
    schema_fragment: schemaFragment,
    capability_requirements: capabilityRequirements,
    generators_dir: path.join(root, 'generators'),
    migrations_dir: path.join(root, 'migrations'),
    generator: generatorRuntime && generatorRuntime.module ? generatorRuntime.module : null,
    migrations: migrationRuntime && migrationRuntime.module ? migrationRuntime.module : null,
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

  modules.sort((a, b) => String(a && a.id || '').localeCompare(String(b && b.id || '')));
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

function evaluateModuleCapabilities({ modules, enabled, capabilities, config }) {
  const enabledSet = new Set((Array.isArray(enabled) ? enabled : []).map((value) => String(value || '').trim()).filter(Boolean));
  const moduleList = Array.isArray(modules) ? modules : [];
  const capMap = capabilities && capabilities.capabilities && typeof capabilities.capabilities === 'object'
    ? capabilities.capabilities
    : {};
  const requiredSet = new Set();
  const missingSet = new Set();
  const warnings = [];
  const errors = [];

  const results = moduleList.map((moduleDef) => {
    const moduleId = String(moduleDef && moduleDef.id || '').trim();
    const isEnabled = enabledSet.has(moduleId);
    const staticRequirements = moduleDef && moduleDef.capability_requirements && Array.isArray(moduleDef.capability_requirements.requires)
      ? moduleDef.capability_requirements.requires
      : [];
    let requirements = [...staticRequirements];
    let degradeStrategy = String(moduleDef && moduleDef.capability_requirements && moduleDef.capability_requirements.degrade_strategy || 'warn')
      .trim()
      .toLowerCase();
    let remediationMap = moduleDef && moduleDef.capability_requirements && moduleDef.capability_requirements.remediation
      ? moduleDef.capability_requirements.remediation
      : {};

    if (
      moduleDef
      && moduleDef.generator
      && typeof moduleDef.generator.resolve_capability_requirements === 'function'
    ) {
      const dynamic = moduleDef.generator.resolve_capability_requirements({
        module: moduleDef,
        config,
        capabilities,
      });
      if (dynamic && typeof dynamic === 'object') {
        if (Array.isArray(dynamic.requires)) {
          requirements = dynamic.requires.map((entry) => String(entry || '').trim()).filter(Boolean);
        }
        if (typeof dynamic.degrade_strategy === 'string') {
          degradeStrategy = String(dynamic.degrade_strategy).trim().toLowerCase();
        }
        if (dynamic.remediation && typeof dynamic.remediation === 'object') {
          remediationMap = dynamic.remediation;
        }
      }
    }

    const missing = [];
    const supported = [];
    for (const requirement of requirements) {
      const capability = String(requirement || '').trim();
      if (!capability) continue;
      requiredSet.add(capability);
      const detected = capMap[capability];
      const ok = !!(detected && detected.supported === true);
      if (ok) {
        supported.push(capability);
        continue;
      }
      missing.push({
        capability,
        state: detected && detected.state || 'unknown',
        reason: detected && detected.reason || 'unavailable',
        remediation: remediationMap && remediationMap[capability] ? String(remediationMap[capability]) : '',
      });
      missingSet.add(capability);
    }

    const strategy = ['warn', 'skip', 'fail'].includes(degradeStrategy) ? degradeStrategy : 'warn';
    const degraded = isEnabled && missing.length > 0;
    const skipped = degraded && strategy === 'skip';
    const hardError = degraded && strategy === 'fail';

    if (isEnabled && degraded) {
      const capList = missing.map((entry) => entry.capability).join(', ');
      const msg = `Module ${moduleId} missing capabilities: ${capList}`;
      if (hardError) {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }

    return {
      id: moduleId,
      enabled: isEnabled,
      valid: !!(moduleDef && moduleDef.valid),
      strategy,
      degraded,
      skipped,
      hard_error: hardError,
      requirements,
      supported,
      missing,
    };
  });

  const requiredCapabilities = Array.from(requiredSet).sort();
  const missingRequiredCapabilities = Array.from(missingSet).sort();

  const requireAppPolicy = !!(config && config.policy && config.policy.require_github_app);
  const requiresAppForFullFeatureSet = missingRequiredCapabilities.length > 0;
  const appEnforced = requireAppPolicy && requiresAppForFullFeatureSet;

  if (appEnforced) {
    errors.push(`GitHub App required by policy: missing capabilities (${missingRequiredCapabilities.join(', ')})`);
  }

  return {
    modules: results,
    required_capabilities: requiredCapabilities,
    missing_required_capabilities: missingRequiredCapabilities,
    warnings,
    errors,
    github_app: {
      required_for_full_feature_set: requiresAppForFullFeatureSet,
      policy_requires_app: requireAppPolicy,
      effective_required: appEnforced,
      reason: requiresAppForFullFeatureSet
        ? 'missing_capabilities_for_enabled_modules'
        : 'all_required_capabilities_supported',
    },
  };
}

module.exports = {
  assertEnabledModulesExist,
  evaluateModuleCapabilities,
  loadModules,
};
