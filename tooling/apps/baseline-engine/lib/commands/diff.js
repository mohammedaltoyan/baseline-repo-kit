'use strict';

const { buildContext } = require('../context');
const { printOutput } = require('./shared');

async function runDiff(args) {
  const context = await buildContext(args);

  const payload = {
    command: 'diff',
    target: context.targetRoot,
    engine_version: context.engineVersion,
    change_count: context.changes.length,
    changes: context.changes,
    warnings: context.capabilities.warnings || [],
  };

  printOutput(payload, args);
  return payload;
}

module.exports = {
  runDiff,
};
