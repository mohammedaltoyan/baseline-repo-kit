'use strict';

const { buildContext } = require('../context');
const { ENGINE_VERSION } = require('../constants');
const { loadMigrations, resolvePendingMigrations } = require('../migrations');
const { buildGeneratedArtifacts, computeDiff } = require('../managed-files');
const { readTextSafe } = require('../util/fs');
const { isTruthy } = require('../util/args');
const { applyArtifacts, printOutput } = require('./shared');

async function runUpgrade(args) {
  const context = await buildContext(args);
  const dryRun = isTruthy(args && (args['dry-run'] || args.dryRun));
  const targetVersion = String(args && (args['target-version'] || args.targetVersion || ENGINE_VERSION) || ENGINE_VERSION).trim();
  const currentVersion = String(context.state && context.state.installed_version || '0.0.0').trim();

  const migrations = loadMigrations();
  const pending = resolvePendingMigrations({
    currentVersion,
    targetVersion,
    migrations,
  });

  const notes = [];
  if (!dryRun) {
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

    context.state.installed_version = targetVersion;
    context.state.last_applied_at = new Date().toISOString();
  }

  const artifacts = buildGeneratedArtifacts({
    config: context.config,
    capabilities: context.capabilities,
    state: context.state,
    modules: context.modules,
  });

  const changes = computeDiff({
    targetRoot: context.targetRoot,
    artifacts,
    readTextSafe,
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
    change_count: changes.length,
    written_files: applied.length,
  };

  printOutput(payload, args);
  return payload;
}

module.exports = {
  runUpgrade,
};
