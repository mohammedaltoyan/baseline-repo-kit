'use strict';

const { buildContext } = require('../context');
const { loadSchema, loadUiMetadata, validateConfig } = require('../schema');
const { printOutput } = require('./shared');

function isPinnedRef(value) {
  const raw = String(value || '').trim();
  return /@[0-9a-f]{40}$/i.test(raw);
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

  const moduleEvaluation = context.moduleEvaluation || { modules: [], warnings: [], errors: [], github_app: {} };
  const degraded = moduleEvaluation.modules.filter((entry) => entry.enabled && entry.degraded);
  const actionRefs = context.config
    && context.config.ci
    && context.config.ci.action_refs
    && typeof context.config.ci.action_refs === 'object'
    ? context.config.ci.action_refs
    : {};
  const unpinnedActionRefs = Object.entries(actionRefs)
    .filter(([, ref]) => !isPinnedRef(ref))
    .map(([name, ref]) => ({ name, ref: String(ref || '') }));
  const requirePinned = !!(
    context.config
    && context.config.security
    && context.config.security.require_pinned_action_refs
  );

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
    action_refs: actionRefs,
    unpinned_action_refs: unpinnedActionRefs,
    require_pinned_action_refs: requirePinned,
    warnings: []
      .concat(context.warnings || [])
      .concat(
        unpinnedActionRefs.length > 0
          ? [`Unpinned action refs detected: ${unpinnedActionRefs.map((entry) => `${entry.name}=${entry.ref}`).join(', ')}`]
          : []
      ),
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

  if (requirePinned && unpinnedActionRefs.length > 0) {
    throw new Error(
      `Doctor failed: security.require_pinned_action_refs=true but unpinned refs exist (${unpinnedActionRefs.map((entry) => entry.name).join(', ')})`
    );
  }

  return payload;
}

module.exports = {
  runDoctor,
};
