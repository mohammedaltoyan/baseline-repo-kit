'use strict';

const { buildContext } = require('../context');
const { loadSchema, loadUiMetadata, validateConfig } = require('../schema');
const { printOutput } = require('./shared');

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

  const moduleEvaluation = context.moduleEvaluation || { modules: [], warnings: [], errors: [], github_app: {} };
  const degraded = moduleEvaluation.modules.filter((entry) => entry.enabled && entry.degraded);

  const payload = {
    command: 'doctor',
    target: context.targetRoot,
    schema_loaded: !!schema,
    metadata_loaded: !!metadata,
    config_valid: true,
    module_count: context.modules.length,
    invalid_module_count: invalidModules.length,
    capability_degraded_modules: degraded.map((entry) => ({
      module: entry.id,
      strategy: entry.strategy,
      missing: entry.missing,
      skipped: entry.skipped,
    })),
    required_capabilities: moduleEvaluation.required_capabilities || [],
    missing_required_capabilities: moduleEvaluation.missing_required_capabilities || [],
    github_app: moduleEvaluation.github_app || {},
    warnings: context.warnings || [],
  };

  if (invalidModules.length > 0) {
    payload.config_valid = false;
  }

  printOutput(payload, args);

  if (invalidModules.length > 0 || (moduleEvaluation.errors && moduleEvaluation.errors.length > 0)) {
    const invalidMessage = invalidModules.length > 0
      ? `invalid modules (${invalidModules.map((m) => m.id).join(', ')})`
      : '';
    const capabilityMessage = moduleEvaluation.errors && moduleEvaluation.errors.length > 0
      ? `capability enforcement (${moduleEvaluation.errors.join(' | ')})`
      : '';
    throw new Error(`Doctor failed: ${[invalidMessage, capabilityMessage].filter(Boolean).join(' ; ')}`);
  }

  return payload;
}

module.exports = {
  runDoctor,
};
