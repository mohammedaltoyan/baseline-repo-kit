/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const path = require('path');
const {
  buildScenarioMatrix,
  classifyScenarioOutcome,
  hasUnsupportedRulesetSignal,
  normalizeOwnerToken,
  parseCliArgs,
  parseScopesFromAuthStatus,
  parseWarnings,
} = require('./github-live-provisioning-verify');

function run() {
  const parsed = parseCliArgs(
    [
      '--execute',
      '--all-orgs',
      '--owners', 'user,org:acme,org:acme',
      '--artifact-path', 'tmp/live/report.json',
      '--repo-prefix', 'baseline-check',
      '--host', 'github.enterprise.local',
      '--keep-repos',
      '--allow-failures',
    ],
    { cwd: '/repo' }
  );
  assert.strictEqual(parsed.execute, true);
  assert.strictEqual(parsed.allOrgs, true);
  assert.strictEqual(parsed.cleanup, false);
  assert.strictEqual(parsed.failOnScenarioError, false);
  assert.strictEqual(parsed.host, 'github.enterprise.local');
  assert.strictEqual(parsed.repoPrefix, 'baseline-check');
  assert.strictEqual(parsed.artifactPath, path.resolve('/repo', 'tmp/live/report.json'));

  assert.deepStrictEqual(
    normalizeOwnerToken('org:MasarX', { userLogin: 'octocat' }),
    { kind: 'org', owner: 'MasarX' }
  );
  assert.deepStrictEqual(
    normalizeOwnerToken('user', { userLogin: 'octocat' }),
    { kind: 'user', owner: 'octocat' }
  );

  assert.deepStrictEqual(
    buildScenarioMatrix({
      userLogin: 'octocat',
      orgLogins: ['acme', 'beta'],
      owners: [],
      includeOrgs: true,
      allOrgs: false,
    }),
    [
      { kind: 'user', owner: 'octocat' },
      { kind: 'org', owner: 'acme' },
    ]
  );

  assert.deepStrictEqual(
    buildScenarioMatrix({
      userLogin: 'octocat',
      orgLogins: ['acme', 'beta'],
      owners: ['org:beta', 'user'],
      includeOrgs: true,
      allOrgs: true,
    }),
    [
      { kind: 'org', owner: 'beta' },
      { kind: 'user', owner: 'octocat' },
    ]
  );

  const warnings = parseWarnings(`
[baseline-bootstrap] WARN: merge queue unsupported
[baseline-bootstrap] info: complete
WARN: another warning
`);
  assert.deepStrictEqual(warnings, [
    '[baseline-bootstrap] WARN: merge queue unsupported',
    'WARN: another warning',
  ]);

  const scopes = parseScopesFromAuthStatus(`
github.com
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'
`);
  assert.deepStrictEqual(scopes, ['gist', 'read:org', 'repo', 'workflow']);

  const degraded = {
    bootstrap: {
      exit_code: 1,
      summary_found: true,
      warnings: ['[baseline-bootstrap] WARN: ...'],
      stdout_tail: ['Upgrade to GitHub Pro or make this repository public to enable this feature.'],
      stderr_tail: [],
    },
    capabilities: {
      rulesets: { ok: false, count: null, error: '403' },
    },
  };
  assert.strictEqual(hasUnsupportedRulesetSignal(degraded), true);
  assert.deepStrictEqual(classifyScenarioOutcome(degraded), {
    status: 'degraded_success',
    reason: 'ruleset capability unavailable for this entitlement; bootstrap emitted explicit remediation',
  });

  const failed = {
    bootstrap: { exit_code: 1, summary_found: false, warnings: [], stdout_tail: [], stderr_tail: [] },
    capabilities: { rulesets: { ok: true, count: 2, error: '' } },
  };
  assert.deepStrictEqual(classifyScenarioOutcome(failed), {
    status: 'failed',
    reason: 'bootstrap_exit_1',
  });

  console.log('[github-live-provisioning-verify:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
