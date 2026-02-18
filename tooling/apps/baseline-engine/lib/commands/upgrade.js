'use strict';

const { buildContext } = require('../context');
const { CAPABILITIES_FILE, CONFIG_FILE, ENGINE_VERSION, STATE_FILE } = require('../constants');
const { loadMigrations, resolvePendingMigrations } = require('../migrations');
const { buildGeneratedArtifacts, computeDiff } = require('../managed-files');
const { evaluateModuleCapabilities } = require('../modules');
const { readTextSafe } = require('../util/fs');
const { isTruthy } = require('../util/args');
const { applyArtifacts, createRollbackSnapshot, printOutput } = require('./shared');

function snapshotPolicy(config) {
  const keys = ['policy', 'branching', 'ci', 'deployments', 'planning', 'updates', 'modules'];
  const out = {};
  for (const key of keys) {
    out[key] = config && typeof config === 'object' ? config[key] : undefined;
  }
  return out;
}

function computePolicyImpact(beforeSnapshot, afterSnapshot) {
  const keys = Object.keys(beforeSnapshot || {});
  const impacts = [];
  for (const key of keys) {
    const beforeValue = beforeSnapshot ? beforeSnapshot[key] : undefined;
    const afterValue = afterSnapshot ? afterSnapshot[key] : undefined;
    if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) continue;
    impacts.push({
      section: key,
      before: beforeValue,
      after: afterValue,
    });
  }
  return impacts;
}

async function runUpgrade(args) {
  const context = await buildContext(args);
  const dryRun = isTruthy(args && (args['dry-run'] || args.dryRun));
  const targetVersion = String(args && (args['target-version'] || args.targetVersion || ENGINE_VERSION) || ENGINE_VERSION).trim();
  const currentVersion = String(context.state && context.state.installed_version || '0.0.0').trim();
  const policyBefore = snapshotPolicy(context.config);

  const migrations = loadMigrations();
  const pending = resolvePendingMigrations({
    currentVersion,
    targetVersion,
    migrations,
  });

  const notes = [];
  let rollback = null;
  if (!dryRun) {
    rollback = createRollbackSnapshot({
      targetRoot: context.targetRoot,
      label: 'upgrade',
      files: []
        .concat(context.artifacts.map((artifact) => artifact.path))
        .concat([CONFIG_FILE, STATE_FILE, CAPABILITIES_FILE]),
    });

    for (const migration of pending) {
      if (typeof migration.apply !== 'function') continue;
      // eslint-disable-next-line no-await-in-loop
      await migration.apply({
        targetRoot: context.targetRoot,
        config: context.config,
        state: context.state,
        capabilities: context.capabilities,
        notes,
      });

      context.state.migrations = Array.isArray(context.state.migrations) ? context.state.migrations : [];
      context.state.migrations.push({
        version: migration.version,
        description: migration.description,
        applied_at: new Date().toISOString(),
      });
    }

    for (const mod of context.modules) {
      if (!mod || !mod.migrations || typeof mod.migrations.migrate !== 'function') continue;
      // eslint-disable-next-line no-await-in-loop
      const result = await mod.migrations.migrate({
        targetRoot: context.targetRoot,
        config: context.config,
        state: context.state,
        capabilities: context.capabilities,
      });
      if (Array.isArray(result) && result.length > 0) {
        notes.push(...result.map((entry) => `${mod.id}: ${entry}`));
      }
    }

    context.state.installed_version = targetVersion;
    context.state.last_applied_at = new Date().toISOString();
  }

  context.moduleEvaluation = evaluateModuleCapabilities({
    modules: context.modules,
    enabled: context.config && context.config.modules && context.config.modules.enabled,
    capabilities: context.capabilities,
    config: context.config,
  });
  if (context.moduleEvaluation.errors && context.moduleEvaluation.errors.length > 0) {
    throw new Error(`Upgrade blocked by capability enforcement: ${context.moduleEvaluation.errors.join(' | ')}`);
  }
  const runtimeWarnings = []
    .concat(context.capabilities && context.capabilities.warnings || [])
    .concat(context.moduleEvaluation.warnings || []);

  const artifacts = buildGeneratedArtifacts({
    config: context.config,
    capabilities: context.capabilities,
    state: context.state,
    modules: context.modules,
    moduleEvaluation: context.moduleEvaluation,
  });

  const changes = computeDiff({
    targetRoot: context.targetRoot,
    artifacts,
    readTextSafe,
    baseContentMap: context.baseContentMap,
  });

  context.artifacts = artifacts;
  context.changes = changes;

  const applied = applyArtifacts({ context, dryRun });

  const payload = {
    command: 'upgrade',
    target: context.targetRoot,
    dry_run: dryRun,
    current_version: currentVersion,
    target_version: targetVersion,
    pending_migrations: pending.map((migration) => ({
      version: migration.version,
      description: migration.description,
    })),
    notes,
    policy_impact: computePolicyImpact(policyBefore, snapshotPolicy(context.config)),
    rollback_snapshot: rollback,
    change_count: changes.length,
    written_files: applied.length,
    conflict_count: applied.filter((entry) => entry && entry.conflicted).length,
    warnings: runtimeWarnings,
  };

  printOutput(payload, args);
  return payload;
}

module.exports = {
  runUpgrade,
};
