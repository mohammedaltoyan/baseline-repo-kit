'use strict';

const path = require('path');
const { BASE_CONTENT_FILE, ENGINE_VERSION } = require('./constants');
const { detectGithubCapabilities } = require('./capabilities/github');
const { ensureConfig, loadConfig, saveConfigArtifacts } = require('./config');
const { loadModules, assertEnabledModulesExist, evaluateModuleCapabilities } = require('./modules');
const { detectComponents } = require('./policy/deployments');
const { isTruthy } = require('./util/args');
const { readJsonSafe, readTextSafe, writeText, writeYaml, writeJson } = require('./util/fs');
const { buildGeneratedArtifacts, computeDiff } = require('./managed-files');

function resolveTargetRoot(args) {
  const raw = String(args && (args.target || args.to || args.t || '') || '').trim();
  return raw ? path.resolve(process.cwd(), raw) : process.cwd();
}

async function buildContext(args = {}) {
  const targetRoot = resolveTargetRoot(args);
  const modules = loadModules();
  const current = loadConfig(targetRoot);
  const refreshCapabilities = isTruthy(args['refresh-capabilities'] || args.refreshCapabilities);
  const capabilities = (current.capabilities && !refreshCapabilities)
    ? current.capabilities
    : await detectGithubCapabilities({ targetRoot });
  const components = detectComponents(targetRoot);

  const ensured = ensureConfig({
    targetRoot,
    capabilities,
    components,
    profile: args.profile,
  });

  assertEnabledModulesExist(ensured.config.modules && ensured.config.modules.enabled, modules);

  const loaded = loadConfig(targetRoot);
  const config = loaded.config || ensured.config;
  const state = loaded.state || ensured.state;
  const caps = loaded.capabilities || capabilities;
  const moduleEvaluation = evaluateModuleCapabilities({
    modules,
    enabled: config && config.modules && config.modules.enabled,
    capabilities: caps,
    config,
  });

  if (caps && typeof caps === 'object') {
    caps.runtime = {
      required_capabilities: moduleEvaluation.required_capabilities,
      missing_required_capabilities: moduleEvaluation.missing_required_capabilities,
      modules: moduleEvaluation.modules.map((entry) => ({
        id: entry.id,
        enabled: entry.enabled,
        degraded: entry.degraded,
        skipped: entry.skipped,
        hard_error: entry.hard_error,
        missing: entry.missing,
      })),
      github_app: moduleEvaluation.github_app,
    };
    caps.capabilities = caps.capabilities && typeof caps.capabilities === 'object' ? caps.capabilities : {};
    caps.capabilities.github_app_required = {
      supported: !moduleEvaluation.github_app.required_for_full_feature_set,
      state: moduleEvaluation.github_app.required_for_full_feature_set ? 'unsupported' : 'supported',
      reason: moduleEvaluation.github_app.reason,
      effective_required: moduleEvaluation.github_app.effective_required,
      policy_requires_app: moduleEvaluation.github_app.policy_requires_app,
    };
  }

  const artifacts = buildGeneratedArtifacts({
    config,
    capabilities: caps,
    state,
    modules,
    moduleEvaluation,
  });

  const baseContentMap = readJsonSafe(path.join(targetRoot, BASE_CONTENT_FILE), {});

  const changes = computeDiff({
    targetRoot,
    artifacts,
    readTextSafe,
    baseContentMap,
  });

  const warnings = []
    .concat(caps && caps.warnings || [])
    .concat(moduleEvaluation.warnings || []);

  if (moduleEvaluation.errors && moduleEvaluation.errors.length > 0) {
    throw new Error(`Module capability enforcement failed: ${moduleEvaluation.errors.join(' | ')}`);
  }

  return {
    args,
    targetRoot,
    modules,
    moduleEvaluation,
    capabilities: caps,
    config,
    state,
    baseContentMap,
    artifacts,
    changes,
    warnings,
    engineVersion: ENGINE_VERSION,
    saveConfigArtifacts,
    writeText,
    writeYaml,
    writeJson,
  };
}

module.exports = {
  buildContext,
  resolveTargetRoot,
};
