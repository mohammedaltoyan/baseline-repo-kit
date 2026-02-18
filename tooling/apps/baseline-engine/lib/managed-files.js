'use strict';

const path = require('path');
const {
  CAPABILITIES_FILE,
  CONFIG_FILE,
  ENGINE_VERSION,
  MANAGED_FILES_FILE,
  STATE_FILE,
} = require('./constants');
const { sha256 } = require('./util/fs');
const { mergeManagedContent } = require('./merge');

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function normalizeArtifactRecord(record, ownerFallback) {
  const base = record && typeof record === 'object' ? record : {};
  const pathValue = String(base.path || '').trim();
  if (!pathValue) {
    throw new Error('Module generator artifact is missing path');
  }
  const strategy = String(base.strategy || 'replace').trim().toLowerCase();
  const supportedStrategies = new Set(['replace', 'json_merge', 'yaml_merge', 'three_way']);
  if (!supportedStrategies.has(strategy)) {
    throw new Error(`Unsupported managed-file strategy "${strategy}" for ${pathValue}`);
  }
  return {
    path: pathValue,
    owner: String(base.owner || ownerFallback || 'engine-core').trim(),
    strategy,
    preserve_user_blocks: base.preserve_user_blocks !== false,
    content: String(base.content || ''),
  };
}

function buildModuleArtifacts({ config, capabilities, state, modules, moduleEvaluation }) {
  const moduleMap = new Map((moduleEvaluation && Array.isArray(moduleEvaluation.modules) ? moduleEvaluation.modules : [])
    .map((entry) => [entry.id, entry]));
  const artifacts = [];
  const errors = [];

  for (const mod of (Array.isArray(modules) ? modules : [])) {
    const evaluation = moduleMap.get(mod.id);
    if (!evaluation || !evaluation.enabled || evaluation.skipped) continue;
    if (!mod.generator || typeof mod.generator.generate !== 'function') continue;

    let generated = [];
    try {
      generated = mod.generator.generate({
        module: mod,
        config,
        capabilities,
        state,
        evaluation,
      });
    } catch (error) {
      errors.push(`Module ${mod.id} generation failed: ${String(error && error.message || error)}`);
      continue;
    }

    if (!Array.isArray(generated)) {
      errors.push(`Module ${mod.id} generator must return an array`);
      continue;
    }

    for (const artifact of generated) {
      try {
        artifacts.push(normalizeArtifactRecord(artifact, mod.id));
      } catch (error) {
        errors.push(`Module ${mod.id}: ${String(error && error.message || error)}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(' | '));
  }

  return artifacts;
}

function ensureUniquePaths(artifacts) {
  const seen = new Map();
  for (const artifact of artifacts) {
    const key = String(artifact && artifact.path || '').trim();
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, artifact.owner);
      continue;
    }
    const firstOwner = seen.get(key);
    throw new Error(`Duplicate generated artifact path "${key}" from owners "${firstOwner}" and "${artifact.owner}"`);
  }
}

function buildGeneratedArtifacts({ config, capabilities, state, modules, moduleEvaluation }) {
  const generationStamp = String(state && (state.last_applied_at || state.installed_at) || '').trim();
  const enabled = new Set(Array.isArray(config && config.modules && config.modules.enabled)
    ? config.modules.enabled
    : []);
  const evaluated = Array.isArray(moduleEvaluation && moduleEvaluation.modules) ? moduleEvaluation.modules : [];
  const moduleMeta = new Map((Array.isArray(modules) ? modules : []).map((entry) => [entry.id, entry]));
  const activeModules = evaluated.filter((entry) => entry.enabled && !entry.skipped);
  const degradedModules = activeModules.filter((entry) => entry.degraded);

  const artifacts = [];

  artifacts.push({
    path: CONFIG_FILE,
    owner: 'engine-core',
    strategy: 'yaml_merge',
    content: null,
  });

  artifacts.push({
    path: STATE_FILE,
    owner: 'engine-core',
    strategy: 'json_merge',
    content: stableJson(state),
  });

  artifacts.push({
    path: CAPABILITIES_FILE,
    owner: 'engine-core',
    strategy: 'json_merge',
    content: stableJson(capabilities),
  });

  const moduleArtifacts = buildModuleArtifacts({
    config,
    capabilities,
    state,
    modules,
    moduleEvaluation,
  });
  artifacts.push(...moduleArtifacts);

  artifacts.push({
    path: 'config/policy/baseline-modules.json',
    owner: 'engine-core',
    strategy: 'replace',
    content: stableJson({
      version: 1,
      engine_version: ENGINE_VERSION,
      enabled_modules: Array.from(enabled),
      active_modules: activeModules.map((entry) => ({
        id: entry.id,
        name: String(moduleMeta.get(entry.id) && moduleMeta.get(entry.id).name || entry.id),
        version: String(moduleMeta.get(entry.id) && moduleMeta.get(entry.id).version || ''),
        degraded: entry.degraded,
        skipped: entry.skipped,
        missing_capabilities: entry.missing,
      })),
      degraded_modules: degradedModules.map((entry) => ({
        id: entry.id,
        missing_capabilities: entry.missing,
      })),
      github_app: moduleEvaluation && moduleEvaluation.github_app ? moduleEvaluation.github_app : {
        required_for_full_feature_set: false,
        policy_requires_app: false,
        effective_required: false,
        reason: 'unknown',
      },
    }),
  });

  ensureUniquePaths(artifacts);

  const manifest = {
    version: 1,
    engine_version: ENGINE_VERSION,
    generated_at: generationStamp,
    files: artifacts
      .filter((item) => item.path !== CONFIG_FILE)
      .map((item) => ({
        path: item.path,
        owner: item.owner,
        strategy: item.strategy,
        preserve_user_blocks: item.preserve_user_blocks !== false,
        checksum: sha256(item.content || ''),
      })),
  };

  artifacts.push({
    path: MANAGED_FILES_FILE,
    owner: 'engine-core',
    strategy: 'replace',
    content: stableJson(manifest),
  });

  return artifacts;
}

function computeDiff({ targetRoot, artifacts, readTextSafe, baseContentMap }) {
  const baseMap = baseContentMap && typeof baseContentMap === 'object' ? baseContentMap : {};
  const changes = [];
  for (const artifact of artifacts) {
    if (artifact.path === CONFIG_FILE) continue;
    const abs = path.join(targetRoot, artifact.path);
    const current = readTextSafe(abs, null);
    const next = String(artifact.content || '');

    if (current == null) {
      changes.push({ path: artifact.path, type: 'create', owner: artifact.owner, strategy: artifact.strategy });
      continue;
    }

    const merged = mergeManagedContent({
      strategy: artifact.strategy,
      current,
      next,
      base: baseMap[artifact.path] || '',
      filePath: artifact.path,
      preserveUserBlocks: artifact.preserve_user_blocks !== false,
    });

    if (merged.changed) {
      changes.push({
        path: artifact.path,
        type: 'update',
        owner: artifact.owner,
        strategy: artifact.strategy,
        conflicted: !!merged.conflicted,
      });
    }
  }

  return changes;
}

module.exports = {
  buildGeneratedArtifacts,
  computeDiff,
};
