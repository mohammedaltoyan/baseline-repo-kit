'use strict';

const { buildContext } = require('../context');
const { loadSchema, loadUiMetadata, validateConfig } = require('../schema');
const { printOutput } = require('./shared');

function evaluateModuleCapabilities(context) {
  const enabled = new Set(Array.isArray(context.config && context.config.modules && context.config.modules.enabled)
    ? context.config.modules.enabled
    : []);

  const results = [];
  for (const mod of context.modules) {
    if (!enabled.has(mod.id)) continue;
    const reqs = mod.capability_requirements && mod.capability_requirements.requires || [];
    const missing = [];
    for (const req of reqs) {
      const key = String(req || '').trim();
      if (!key) continue;
      const cap = context.capabilities && context.capabilities.capabilities && context.capabilities.capabilities[key];
      if (!cap || cap.supported !== true) {
        missing.push({ capability: key, reason: cap && cap.reason || 'unavailable' });
      }
    }

    results.push({
      module: mod.id,
      ok: missing.length === 0,
      missing,
    });
  }

  return results;
}

async function runDoctor(args) {
  const context = await buildContext(args);
  const schema = loadSchema();
  const metadata = loadUiMetadata();

  validateConfig(context.config);

  const moduleIntegrity = context.modules.map((mod) => ({
    id: mod.id,
    valid: mod.valid,
    errors: mod.errors || [],
  }));
  const invalidModules = moduleIntegrity.filter((mod) => !mod.valid);

  const capabilityResults = evaluateModuleCapabilities(context);
  const degraded = capabilityResults.filter((entry) => !entry.ok);

  const payload = {
    command: 'doctor',
    target: context.targetRoot,
    schema_loaded: !!schema,
    metadata_loaded: !!metadata,
    config_valid: true,
    module_count: context.modules.length,
    invalid_module_count: invalidModules.length,
    capability_degraded_modules: degraded,
    warnings: (context.capabilities.warnings || []).concat(
      degraded.map((entry) => `Module ${entry.module} degraded: ${entry.missing.map((m) => m.capability).join(', ')}`)
    ),
  };

  if (invalidModules.length > 0) {
    payload.config_valid = false;
  }

  printOutput(payload, args);

  if (invalidModules.length > 0) {
    throw new Error(`Doctor failed: invalid modules detected (${invalidModules.map((m) => m.id).join(', ')})`);
  }

  return payload;
}

module.exports = {
  runDoctor,
};
