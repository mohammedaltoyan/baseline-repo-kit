'use strict';

const { buildContext } = require('../context');
const { applyArtifacts, printOutput } = require('./shared');
const { isTruthy } = require('../util/args');

async function runInit(args) {
  const context = await buildContext(args);
  const dryRun = isTruthy(args && (args['dry-run'] || args.dryRun));
  const applied = applyArtifacts({ context, dryRun });

  const payload = {
    command: 'init',
    target: context.targetRoot,
    dry_run: dryRun,
    engine_version: context.engineVersion,
    maintainer_count: context.capabilities && context.capabilities.collaborators && context.capabilities.collaborators.maintainer_count || 0,
    module_count: context.modules.length,
    change_count: context.changes.length,
    written_files: applied.length,
    warnings: context.capabilities.warnings || [],
  };

  printOutput(payload, args);
  return payload;
}

module.exports = {
  runInit,
};
