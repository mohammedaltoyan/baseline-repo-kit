/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  buildRulesetBody,
  codeownersHasActiveRules,
  detectCodeownersSelfReviewDeadlock,
  deriveRequiredCheckContexts,
  ensureCodeownersFile,
  loadBootstrapPolicy,
  normalizeCodeownerHandles,
  normalizeEnvironmentReviewerSpecs,
  parseCodeownerHandlesFromContent,
  parseArgs,
  parseRemoteRepoSlug,
  resolvePolicyTemplateToken,
} = require('./baseline-bootstrap');

function run() {
  // Remote URL parsing (ssh + https).
  assert.deepStrictEqual(
    parseRemoteRepoSlug('git@github.com:acme/example.git'),
    { host: 'github.com', owner: 'acme', repo: 'example' }
  );
  assert.deepStrictEqual(
    parseRemoteRepoSlug('https://github.com/acme/example.git'),
    { host: 'github.com', owner: 'acme', repo: 'example' }
  );
  assert.deepStrictEqual(
    parseRemoteRepoSlug('ssh://git@github.com/acme/example.git'),
    { host: 'github.com', owner: 'acme', repo: 'example' }
  );

  // Policy template tokens and reviewer normalization.
  assert.strictEqual(
    resolvePolicyTemplateToken('$repo_owner_user', { owner: 'octocat', personalLogin: 'octocat' }),
    'octocat'
  );
  assert.strictEqual(
    resolvePolicyTemplateToken('$repo_owner_user', { owner: 'acme', personalLogin: 'octocat' }),
    'octocat'
  );
  assert.deepStrictEqual(
    normalizeEnvironmentReviewerSpecs(
      ['$repo_owner_user', 'acme/release-team', { type: 'user', login: '@octocat' }],
      { owner: 'octocat', personalLogin: 'octocat' }
    ),
    [
      { kind: 'user', login: 'octocat' },
      { kind: 'team', org: 'acme', slug: 'release-team' },
    ]
  );
  assert.deepStrictEqual(
    normalizeCodeownerHandles(['$repo_owner_user', '@acme/platform', 'octocat', '@acme/platform'], { owner: 'acme', personalLogin: 'octocat' }),
    ['@octocat', '@acme/platform']
  );
  assert.strictEqual(
    codeownersHasActiveRules('# comments only\n# /docs/** @docs-team\n'),
    false
  );
  assert.strictEqual(
    codeownersHasActiveRules('* @octocat\n'),
    true
  );
  assert.deepStrictEqual(
    parseCodeownerHandlesFromContent('/docs/** @acme/docs\n* @octocat # trailing comment', { owner: 'acme', personalLogin: 'octocat' }),
    ['@acme/docs', '@octocat']
  );
  assert.deepStrictEqual(
    detectCodeownersSelfReviewDeadlock({
      policy: {
        github: {
          rules: {
            pull_request: {
              require_code_owner_review: true,
              required_approving_review_count: 1,
            },
          },
        },
      },
      handles: ['@octocat'],
      actorLogin: 'octocat',
    }),
    { deadlock: true, reason: 'single-owner-is-pr-author:octocat' }
  );
  assert.strictEqual(
    detectCodeownersSelfReviewDeadlock({
      policy: {
        github: {
          rules: {
            pull_request: {
              require_code_owner_review: true,
              required_approving_review_count: 1,
            },
          },
        },
      },
      handles: ['@octocat', '@hubot'],
      actorLogin: 'octocat',
    }).deadlock,
    false
  );

  const repoRoot = path.resolve(__dirname, '..', '..');

  // CODEOWNERS provisioning: create missing file with resolved default owners.
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-codeowners-'));
  try {
    const result = ensureCodeownersFile({
      repoRoot: tmpRoot,
      policy: loadBootstrapPolicy(repoRoot).config,
      owner: 'acme',
      personalLogin: 'octocat',
      codeownersOverride: '',
      dryRun: false,
    });
    assert.strictEqual(result.wrote, true);
    const generated = fs.readFileSync(path.join(tmpRoot, '.github', 'CODEOWNERS'), 'utf8');
    assert.ok(/\* @octocat\b/.test(generated), 'expected generated CODEOWNERS to contain fallback owner @octocat');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  // Required check contexts derived from baseline workflows.
  const policy = loadBootstrapPolicy(repoRoot).config;
  const contexts = deriveRequiredCheckContexts({
    repoRoot,
    workflowPaths: policy.github.required_check_workflows,
  });
  assert.ok(contexts.includes('test'), `expected required checks to include "test" (got: ${contexts.join(', ')})`);
  assert.ok(contexts.includes('validate'), `expected required checks to include "validate" (got: ${contexts.join(', ')})`);
  assert.ok(
    contexts.includes('release-main-policy'),
    `expected required checks to include "release-main-policy" (got: ${contexts.join(', ')})`
  );

  // Deploy environment mapping SSOT (must be valid JSON; used by deploy workflow).
  const deployEnvMapRaw = policy.github && policy.github.repo_variables && policy.github.repo_variables.DEPLOY_ENV_MAP_JSON;
  assert.ok(deployEnvMapRaw, 'expected DEPLOY_ENV_MAP_JSON to exist in bootstrap policy repo_variables');
  const deployEnvMap = JSON.parse(deployEnvMapRaw);
  assert.ok(deployEnvMap && typeof deployEnvMap === 'object' && !Array.isArray(deployEnvMap), 'DEPLOY_ENV_MAP_JSON should parse to an object');
  assert.strictEqual(
    deployEnvMap?.application?.production,
    'application-production',
    `expected DEPLOY_ENV_MAP_JSON.application.production to be application-production (got: ${JSON.stringify(deployEnvMap?.application?.production || null)})`
  );
  assert.strictEqual(
    String(policy.github && policy.github.repo_variables && policy.github.repo_variables.AUTOPR_ENABLED || ''),
    '1',
    'expected AUTOPR_ENABLED repo variable to default to 1 in bootstrap policy'
  );
  assert.strictEqual(
    String(policy.github && policy.github.repo_variables && policy.github.repo_variables.AUTOPR_ENFORCE_BOT_AUTHOR || ''),
    '1',
    'expected AUTOPR_ENFORCE_BOT_AUTHOR repo variable to default to 1 in bootstrap policy'
  );
  assert.strictEqual(
    String(policy.github && policy.github.repo_variables && policy.github.repo_variables.AUTOPR_ALLOWED_AUTHORS || ''),
    'github-actions[bot]',
    'expected AUTOPR_ALLOWED_AUTHORS repo variable default to github-actions[bot] in bootstrap policy'
  );
  assert.strictEqual(
    String(policy.github && policy.github.repo_variables && policy.github.repo_variables.AUTOPR_ENFORCE_HEAD_PREFIXES || ''),
    'codex/',
    'expected AUTOPR_ENFORCE_HEAD_PREFIXES repo variable default to codex/ in bootstrap policy'
  );
  assert.strictEqual(
    String(policy.github && policy.github.workflow_permissions && policy.github.workflow_permissions.default_workflow_permissions || ''),
    'read',
    'expected workflow_permissions.default_workflow_permissions to default to read in bootstrap policy'
  );
  assert.strictEqual(
    !!(policy.github && policy.github.workflow_permissions && policy.github.workflow_permissions.can_approve_pull_request_reviews),
    true,
    'expected workflow_permissions.can_approve_pull_request_reviews=true in bootstrap policy'
  );

  // Ruleset body shape.
  const ruleset = buildRulesetBody({
    name: 'baseline: integration',
    branch: 'dev',
    enforcement: 'active',
    requiredContexts: ['test'],
    includeMergeQueue: true,
    policy,
    scope: 'integration',
  });
  assert.strictEqual(ruleset.target, 'branch');
  assert.strictEqual(ruleset.enforcement, 'active');
  assert.deepStrictEqual(ruleset.conditions.ref_name.include, ['refs/heads/dev']);
  assert.ok(Array.isArray(ruleset.rules) && ruleset.rules.length >= 3);
  assert.ok(
    ruleset.rules.some((r) => String(r?.type || '') === 'merge_queue'),
    'expected ruleset to include merge_queue rule when includeMergeQueue=true'
  );

  const integrationPr = ruleset.rules.find((r) => String(r?.type || '') === 'pull_request');
  assert.deepStrictEqual(
    integrationPr?.parameters?.allowed_merge_methods,
    ['squash'],
    `expected integration allowed_merge_methods=['squash'] (got: ${JSON.stringify(integrationPr?.parameters?.allowed_merge_methods || null)})`
  );

  const productionRuleset = buildRulesetBody({
    name: 'baseline: production',
    branch: 'main',
    enforcement: 'active',
    requiredContexts: ['test'],
    includeMergeQueue: false,
    policy,
    scope: 'production',
  });
  const productionPr = productionRuleset.rules.find((r) => String(r?.type || '') === 'pull_request');
  assert.deepStrictEqual(
    productionPr?.parameters?.allowed_merge_methods,
    ['merge'],
    `expected production allowed_merge_methods=['merge'] (got: ${JSON.stringify(productionPr?.parameters?.allowed_merge_methods || null)})`
  );

  // npm flag passthrough compatibility: newer npm may place unknown flags into npm_config_* env.
  const previous = {
    to: process.env.npm_config_to,
    mode: process.env.npm_config_mode,
    github: process.env.npm_config_github,
    mainApprovers: process.env.npm_config_main_approvers,
    profile: process.env.npm_config_profile,
    dryRun: process.env.npm_config_dry_run,
    overwrite: process.env.npm_config_overwrite,
    codeowners: process.env.npm_config_codeowners,
  };
  try {
    process.env.npm_config_to = 'C:\\temp\\target';
    process.env.npm_config_mode = 'overlay';
    process.env.npm_config_github = 'true';
    process.env.npm_config_main_approvers = 'octocat,hubot';
    process.env.npm_config_profile = 'enterprise';
    process.env.npm_config_dry_run = '1';
    process.env.npm_config_overwrite = '1';
    process.env.npm_config_codeowners = 'octocat,acme/platform';

    const parsed = parseArgs([]);
    assert.strictEqual(parsed.to, 'C:\\temp\\target');
    assert.strictEqual(parsed.mode, 'overlay');
    assert.strictEqual(parsed.github, true);
    assert.strictEqual(parsed.mainApprovers, 'octocat,hubot');
    assert.strictEqual(parsed.profile, 'enterprise');
    assert.strictEqual(parsed.dryRun, true);
    assert.strictEqual(parsed.overwrite, true);
    assert.strictEqual(parsed.codeowners, 'octocat,acme/platform');

    process.env.npm_config_to = 'true';
    process.env.npm_config_mode = 'true';
    const positionalFallback = parseArgs(['C:\\positional\\target', 'overlay']);
    assert.strictEqual(positionalFallback.to, 'C:\\positional\\target');
    assert.strictEqual(positionalFallback.mode, 'overlay');
  } finally {
    if (previous.to === undefined) delete process.env.npm_config_to;
    else process.env.npm_config_to = previous.to;

    if (previous.mode === undefined) delete process.env.npm_config_mode;
    else process.env.npm_config_mode = previous.mode;

    if (previous.github === undefined) delete process.env.npm_config_github;
    else process.env.npm_config_github = previous.github;

    if (previous.mainApprovers === undefined) delete process.env.npm_config_main_approvers;
    else process.env.npm_config_main_approvers = previous.mainApprovers;

    if (previous.profile === undefined) delete process.env.npm_config_profile;
    else process.env.npm_config_profile = previous.profile;

    if (previous.dryRun === undefined) delete process.env.npm_config_dry_run;
    else process.env.npm_config_dry_run = previous.dryRun;

    if (previous.overwrite === undefined) delete process.env.npm_config_overwrite;
    else process.env.npm_config_overwrite = previous.overwrite;

    if (previous.codeowners === undefined) delete process.env.npm_config_codeowners;
    else process.env.npm_config_codeowners = previous.codeowners;
  }

  console.log('[baseline-bootstrap:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
