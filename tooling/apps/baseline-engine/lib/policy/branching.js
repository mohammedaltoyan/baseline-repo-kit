'use strict';

function twoBranchTopology() {
  return [
    {
      name: 'dev',
      role: 'integration',
      protected: true,
      allowed_sources: ['feature/*', 'fix/*', 'backport/*', 'automation/*'],
    },
    {
      name: 'main',
      role: 'production',
      protected: true,
      allowed_sources: ['dev', 'hotfix/*'],
    },
    {
      name: 'hotfix/*',
      role: 'hotfix',
      protected: false,
      allowed_sources: ['main'],
    },
  ];
}

function threeBranchTopology() {
  return [
    {
      name: 'develop',
      role: 'integration',
      protected: true,
      allowed_sources: ['feature/*', 'fix/*', 'automation/*'],
    },
    {
      name: 'release',
      role: 'release',
      protected: true,
      allowed_sources: ['develop', 'hotfix/*'],
    },
    {
      name: 'main',
      role: 'production',
      protected: true,
      allowed_sources: ['release', 'hotfix/*'],
    },
    {
      name: 'hotfix/*',
      role: 'hotfix',
      protected: false,
      allowed_sources: ['main'],
    },
  ];
}

function trunkTopology() {
  return [
    {
      name: 'main',
      role: 'production',
      protected: true,
      allowed_sources: ['feature/*', 'fix/*', 'hotfix/*', 'automation/*'],
    },
    {
      name: 'hotfix/*',
      role: 'hotfix',
      protected: false,
      allowed_sources: ['main'],
    },
  ];
}

function resolveTopology(mode) {
  const topology = String(mode || '').trim().toLowerCase();
  if (topology === 'three_branch') return threeBranchTopology();
  if (topology === 'trunk') return trunkTopology();
  if (topology === 'custom') return twoBranchTopology();
  return twoBranchTopology();
}

function resolveBranchRoles(branches) {
  const list = Array.isArray(branches) ? branches : [];
  const roles = new Map();
  for (const branch of list) {
    const name = String(branch && branch.name || '').trim();
    const role = String(branch && branch.role || '').trim();
    if (!name || !role) continue;
    roles.set(role, name);
  }
  return Object.fromEntries(roles.entries());
}

module.exports = {
  resolveBranchRoles,
  resolveTopology,
  threeBranchTopology,
  trunkTopology,
  twoBranchTopology,
};
