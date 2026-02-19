'use strict';

const { buildContext } = require('../context');
const { buildInsights } = require('../insights');
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

function buildEffectiveOverrideWarnings(context) {
  const insights = buildInsights({
    config: context.config,
    capabilities: context.capabilities,
    moduleEvaluation: context.moduleEvaluation,
  });
  const effectiveSettings = insights && insights.effective_settings && typeof insights.effective_settings === 'object'
    ? insights.effective_settings
    : {};
  const overrides = Array.isArray(effectiveSettings.overrides) ? effectiveSettings.overrides : [];
  return overrides.map((entry) => {
    const path = String(entry && entry.path || '').trim() || '<unknown>';
    const detail = String(entry && entry.detail || '').trim() || 'capability-driven override applied';
    const remediation = String(entry && entry.remediation || '').trim();
    return remediation
      ? `Auto-degraded setting ${path}: ${detail}. Remediation: ${remediation}`
      : `Auto-degraded setting ${path}: ${detail}.`;
  });
}

async function runApply(args) {
  const context = await buildContext(args);
  const dryRun = isTruthy(args && (args['dry-run'] || args.dryRun));
  const forceDirect = isTruthy(args && (args.direct || args['apply-direct']));

  const configuredMode = String(context.config && context.config.updates && context.config.updates.apply_mode || 'pr_first');
  const mode = forceDirect ? 'direct' : configuredMode;
  const autoPrEnabled = !!(context.config && context.config.updates && context.config.updates.auto_pr !== false);

  if (!dryRun && context.state) {
    context.state.last_applied_at = new Date().toISOString();
    context.artifacts = buildGeneratedArtifacts({
      config: context.config,
      capabilities: context.capabilities,
      state: context.state,
      modules: context.modules,
      moduleEvaluation: context.moduleEvaluation,
    });
    context.changes = computeDiff({
      targetRoot: context.targetRoot,
      artifacts: context.artifacts,
      readTextSafe,
      baseContentMap: context.baseContentMap,
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

  if (!dryRun && mode === 'pr_first' && autoPrEnabled) {
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
  } else if (!dryRun && mode === 'pr_first' && !autoPrEnabled) {
    prSummary.warnings.push('PR-first mode selected but updates.auto_pr=false; no PR automation attempted.');
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
    conflict_count: applied.filter((entry) => entry && entry.conflicted).length,
    pr_first: prSummary,
    warnings: []
      .concat(context.warnings || [])
      .concat(buildEffectiveOverrideWarnings(context))
      .concat(prSummary.warnings || []),
  };

  printOutput(payload, args);
  return payload;
}

module.exports = {
  runApply,
};
