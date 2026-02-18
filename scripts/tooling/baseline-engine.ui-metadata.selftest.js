/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const { defaultConfig } = require('../../tooling/apps/baseline-engine/lib/config');
const { loadUiMetadata } = require('../../tooling/apps/baseline-engine/lib/schema');

function listLeafPaths(value, prefix = '') {
  if (Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return prefix ? [prefix] : [];
    let out = [];
    for (const key of keys) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      out = out.concat(listLeafPaths(value[key], nextPrefix));
    }
    return out;
  }
  return prefix ? [prefix] : [];
}

function hasCoverage(fields, path) {
  const map = fields && typeof fields === 'object' ? fields : {};
  if (map[path]) return true;
  const parts = String(path || '').split('.');
  while (parts.length > 1) {
    parts.pop();
    if (map[parts.join('.')]) return true;
  }
  return false;
}

function run() {
  const config = defaultConfig({
    maintainersCount: 3,
    components: [{ id: 'application', name: 'application', path: 'apps', enabled: true }],
    profile: 'strict',
  });
  const metadata = loadUiMetadata();
  const fields = metadata && metadata.fields && typeof metadata.fields === 'object' ? metadata.fields : {};
  const leaves = listLeafPaths(config).sort();

  for (const path of leaves) {
    assert.strictEqual(
      hasCoverage(fields, path),
      true,
      `UI metadata must explain setting path: ${path}`
    );
  }

  const requiredMetaKeys = [
    'what_this_controls',
    'why_it_matters',
    'default_behavior',
    'tradeoffs',
    'prerequisites',
    'apply_impact',
    'fallback_or_remediation',
  ];
  const allowedCapabilityKeys = new Set([
    'rulesets',
    'merge_queue',
    'environments',
    'code_scanning',
    'dependency_review',
    'repo_variables',
    'github_app_required',
  ]);
  for (const [path, meta] of Object.entries(fields)) {
    for (const key of requiredMetaKeys) {
      const value = String(meta && meta[key] || '').trim();
      assert.strictEqual(value.length > 0, true, `Metadata field ${path}.${key} must be non-empty`);
    }
    const capabilityKey = String(meta && meta.capability_key || '').trim();
    if (capabilityKey) {
      assert.strictEqual(
        allowedCapabilityKeys.has(capabilityKey),
        true,
        `Metadata field ${path}.capability_key must be one of: ${Array.from(allowedCapabilityKeys).join(', ')}`
      );
    }
  }

  const expectedCapabilityMappings = [
    'policy.profile',
    'policy.require_github_app',
    'branching.topology',
    'branching.branches',
    'branching.review_thresholds',
    'ci.mode',
    'ci.action_refs',
    'ci.change_profiles',
    'ci.full_lane_triggers',
    'deployments.environments',
    'deployments.components',
    'deployments.approval_matrix',
    'deployments.oidc',
    'security.codeql',
    'security.dependency_review',
    'security.secret_scanning',
    'modules.enabled',
  ];
  for (const path of expectedCapabilityMappings) {
    assert.strictEqual(
      String(fields[path] && fields[path].capability_key || '').trim().length > 0,
      true,
      `Metadata field ${path} must declare capability_key for UI capability labeling`
    );
  }

  console.log('[baseline-engine:ui-metadata-selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
