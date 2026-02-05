/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const path = require('path');
const {
  buildRulesetBody,
  deriveRequiredCheckContexts,
  loadBootstrapPolicy,
  parseRemoteRepoSlug,
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

  // Required check contexts derived from baseline workflows.
  const repoRoot = path.resolve(__dirname, '..', '..');
  const policy = loadBootstrapPolicy(repoRoot).config;
  const contexts = deriveRequiredCheckContexts({
    repoRoot,
    workflowPaths: policy.github.required_check_workflows,
  });
  assert.ok(contexts.includes('CI / test'), `expected required checks to include "CI / test" (got: ${contexts.join(', ')})`);
  assert.ok(contexts.includes('PR Policy / validate'), `expected required checks to include "PR Policy / validate" (got: ${contexts.join(', ')})`);

  // Ruleset body shape.
  const ruleset = buildRulesetBody({
    name: 'baseline: integration',
    branch: 'dev',
    enforcement: 'active',
    requiredContexts: ['CI / test'],
    includeMergeQueue: true,
    policy,
  });
  assert.strictEqual(ruleset.target, 'branch');
  assert.strictEqual(ruleset.enforcement, 'active');
  assert.deepStrictEqual(ruleset.conditions.ref_name.include, ['refs/heads/dev']);
  assert.ok(Array.isArray(ruleset.rules) && ruleset.rules.length >= 2);

  console.log('[baseline-bootstrap:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };

