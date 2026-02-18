'use strict';

const path = require('path');
const { ENGINE_VERSION } = require('./constants');
const { detectGithubCapabilities } = require('./capabilities/github');
const { ensureConfig, loadConfig, saveConfigArtifacts } = require('./config');
const { loadModules, assertEnabledModulesExist } = require('./modules');
const { detectComponents } = require('./policy/deployments');
const { isTruthy } = require('./util/args');
const { readTextSafe, writeText, writeYaml, writeJson } = require('./util/fs');
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

  const artifacts = buildGeneratedArtifacts({
    config,
    capabilities: caps,
    state,
    modules,
  });

  const changes = computeDiff({ targetRoot, artifacts, readTextSafe });

  return {
    args,
    targetRoot,
    modules,
    capabilities: caps,
    config,
    state,
    artifacts,
    changes,
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
