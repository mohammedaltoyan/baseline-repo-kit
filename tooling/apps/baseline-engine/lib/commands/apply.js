'use strict';

const { buildContext } = require('../context');
const { buildGeneratedArtifacts, computeDiff } = require('../managed-files');
const { readTextSafe } = require('../util/fs');
const { applyArtifacts, printOutput, tryPrFirstCommit } = require('./shared');
const { isTruthy } = require('../util/args');

function resolveIntegrationBranch(config) {
  const branches = Array.isArray(config && config.branching && config.branching.branches)
    ? config.branching.branches
    : [];
  const integration = branches.find((branch) => String(branch && branch.role || '').trim() === 'integration');
  return String(integration && integration.name || 'dev').replace(/\/$/, '');
}

async function runApply(args) {
  const context = await buildContext(args);
  const dryRun = isTruthy(args && (args['dry-run'] || args.dryRun));
  const forceDirect = isTruthy(args && (args.direct || args['apply-direct']));

  const configuredMode = String(context.config && context.config.updates && context.config.updates.apply_mode || 'pr_first');
  const mode = forceDirect ? 'direct' : configuredMode;

  if (!dryRun && context.state) {
    context.state.last_applied_at = new Date().toISOString();
    context.artifacts = buildGeneratedArtifacts({
      config: context.config,
      capabilities: context.capabilities,
      state: context.state,
      modules: context.modules,
    });
    context.changes = computeDiff({
      targetRoot: context.targetRoot,
      artifacts: context.artifacts,
      readTextSafe,
    });
  }

  const applied = applyArtifacts({ context, dryRun });

  let prSummary = {
    attempted: false,
    branch: '',
    committed: false,
    prOpened: false,
    warnings: [],
  };

  if (!dryRun && mode === 'pr_first') {
    const integrationBranch = resolveIntegrationBranch(context.config);
    prSummary = tryPrFirstCommit({
      targetRoot: context.targetRoot,
      changes: context.changes,
      integrationBranch,
      title: 'chore: baseline v2.2 apply',
      body: [
        'Automated baseline engine apply.',
        '',
        '- Engine: 2.2.0',
        `- Changes: ${context.changes.length}`,
        '- Mode: pr_first',
      ].join('\n'),
    });
  }

  if (!dryRun && context.state) {
    context.saveConfigArtifacts({
      targetRoot: context.targetRoot,
      config: context.config,
      state: context.state,
      capabilities: context.capabilities,
    });
  }

  const payload = {
    command: 'apply',
    target: context.targetRoot,
    dry_run: dryRun,
    apply_mode: mode,
    change_count: context.changes.length,
    written_files: applied.length,
    pr_first: prSummary,
    warnings: (context.capabilities.warnings || []).concat(prSummary.warnings || []),
  };

  printOutput(payload, args);
  return payload;
}

module.exports = {
  runApply,
};
