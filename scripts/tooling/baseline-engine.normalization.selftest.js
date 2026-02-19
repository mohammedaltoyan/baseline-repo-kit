/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const { defaultConfig } = require('../../tooling/apps/baseline-engine/lib/config');
const { normalizeDynamicConfig } = require('../../tooling/apps/baseline-engine/lib/policy/normalization');

function findMatrixRow(rows, environment, component) {
  return (Array.isArray(rows) ? rows : []).find((entry) => (
    String(entry && entry.environment) === String(environment)
    && String(entry && entry.component) === String(component)
  ));
}

function run() {
  const base = defaultConfig({
    maintainersCount: 3,
    components: [{ id: 'application', name: 'application', path: 'apps', enabled: true }],
    profile: 'strict',
  });

  const trunk = JSON.parse(JSON.stringify(base));
  trunk.branching.topology = 'trunk';
  trunk.branching.branches = [
    { name: 'dev', role: 'integration', protected: true, allowed_sources: ['feature/*'] },
    { name: 'main', role: 'production', protected: true, allowed_sources: ['dev'] },
  ];
  const trunkNormalized = normalizeDynamicConfig(trunk).config;
  assert.deepStrictEqual(
    trunkNormalized.branching.branches.map((entry) => entry.name),
    ['main', 'hotfix/*'],
    'non-custom topology should always materialize preset branch graph'
  );

  const custom = JSON.parse(JSON.stringify(base));
  custom.branching.topology = 'custom';
  custom.branching.branches = [
    { name: 'integration', role: 'integration', protected: true, allowed_sources: ['feature/*'] },
    { name: 'production', role: 'production', protected: true, allowed_sources: ['integration'] },
  ];
  const customNormalized = normalizeDynamicConfig(custom).config;
  assert.deepStrictEqual(
    customNormalized.branching.branches.map((entry) => entry.name),
    ['integration', 'production'],
    'custom topology should preserve caller-defined branches'
  );

  const matrix = JSON.parse(JSON.stringify(base));
  matrix.deployments.environments = [
    { name: 'dev', branch_roles: ['integration'], default: true },
    { name: 'staging', branch_roles: ['integration'], default: true },
    { name: 'production', branch_roles: ['production'], default: true },
  ];
  matrix.deployments.components = [
    { id: 'api', name: 'api', path: 'apps/api', enabled: true },
    { id: 'web', name: 'web', path: 'apps/web', enabled: true },
  ];
  matrix.deployments.approval_matrix = [
    {
      environment: 'production',
      component: 'api',
      approval_required: true,
      min_approvers: 3,
      allow_self_approval: false,
      allowed_roles: ['admin'],
    },
    {
      environment: 'production',
      component: 'api',
      approval_required: true,
      min_approvers: 1,
      allow_self_approval: false,
      allowed_roles: ['maintain'],
    },
    {
      environment: 'obsolete',
      component: 'api',
      approval_required: false,
      min_approvers: 0,
      allow_self_approval: true,
      allowed_roles: ['write'],
    },
  ];
  const matrixNormalized = normalizeDynamicConfig(matrix).config;
  const rows = matrixNormalized.deployments.approval_matrix;
  assert.strictEqual(rows.length, 6, 'matrix should include every environment/component pair');
  assert.strictEqual(
    Number(findMatrixRow(rows, 'production', 'api').min_approvers),
    3,
    'existing matching rows should be retained as explicit overrides'
  );
  assert.strictEqual(
    rows.some((entry) => String(entry.environment) === 'obsolete'),
    false,
    'stale rows should be removed when they no longer match configured environments/components'
  );

  console.log('[baseline-engine:normalization-selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
