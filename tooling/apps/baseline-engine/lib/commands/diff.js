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
    conflict_count: context.changes.filter((entry) => entry && entry.conflicted).length,
    changes: context.changes,
    warnings: context.warnings || [],
  };

  printOutput(payload, args);
  return payload;
}

module.exports = {
  runDiff,
};
