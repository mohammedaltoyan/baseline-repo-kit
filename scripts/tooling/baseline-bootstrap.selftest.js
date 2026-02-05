/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const path = require('path');
const {
  buildRulesetBody,
  deriveRequiredCheckContexts,
  loadBootstrapPolicy,
  normalizeEnvironmentReviewerSpecs,
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
    ''
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

  // Required check contexts derived from baseline workflows.
  const repoRoot = path.resolve(__dirname, '..', '..');
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

  console.log('[baseline-bootstrap:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
