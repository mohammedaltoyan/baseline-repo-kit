'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULT_ENVIRONMENTS } = require('../constants');
const { toPosix, walkFiles } = require('../util/fs');

function detectComponents(targetRoot) {
  const root = path.resolve(String(targetRoot || process.cwd()));
  const components = [];
  const seen = new Set();

  function pushComponent(component) {
    if (!component || typeof component !== 'object') return;
    const id = String(component.id || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    components.push({
      id,
      name: String(component.name || id),
      path: toPosix(String(component.path || '.')),
      enabled: component.enabled !== false,
    });
  }

  const appsDir = path.join(root, 'apps');
  if (fs.existsSync(appsDir) && fs.statSync(appsDir).isDirectory()) {
    const entries = fs.readdirSync(appsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;
      pushComponent({
        id: entry.name,
        name: entry.name,
        path: `apps/${entry.name}`,
        enabled: true,
      });
    }
  }

  const workflowsDir = path.join(root, '.github', 'workflows');
  if (fs.existsSync(workflowsDir) && fs.statSync(workflowsDir).isDirectory()) {
    const files = walkFiles(workflowsDir);
    for (const rel of files) {
      const lower = rel.toLowerCase();
      if (!lower.endsWith('.yml') && !lower.endsWith('.yaml')) continue;
      if (!lower.includes('deploy')) continue;
      const stem = lower
        .replace(/\.ya?ml$/i, '')
        .replace(/^deploy[-_]?/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const id = stem || 'application';
      pushComponent({
        id,
        name: id.replace(/-/g, ' '),
        path: `.github/workflows/${rel}`,
        enabled: true,
      });
    }
  }

  if (components.length === 0) {
    pushComponent({ id: 'application', name: 'application', path: 'apps', enabled: true });
  }

  return components;
}

function defaultEnvironments() {
  return DEFAULT_ENVIRONMENTS.map((name) => ({
    name,
    branch_roles: name === 'production' ? ['production'] : name === 'staging' ? ['integration', 'release'] : ['integration', 'feature'],
    default: true,
  }));
}

function buildApprovalMatrix({ environments, components, policyProfile }) {
  const envs = Array.isArray(environments) ? environments : [];
  const comps = Array.isArray(components) ? components : [];
  const profile = String(policyProfile || 'strict').trim().toLowerCase();

  const rows = [];
  for (const env of envs) {
    const envName = String(env && env.name || '').trim();
    if (!envName) continue;

    for (const comp of comps) {
      const compId = String(comp && comp.id || '').trim();
      if (!compId) continue;

      const isProd = envName === 'production';
      const baseApprovers = isProd ? 2 : envName === 'staging' ? 1 : 0;
      const adjusted = profile === 'advisory' ? 0 : profile === 'moderate' ? Math.max(0, baseApprovers - 1) : baseApprovers;

      rows.push({
        environment: envName,
        component: compId,
        approval_required: adjusted > 0,
        min_approvers: adjusted,
        allow_self_approval: adjusted === 0,
        allowed_roles: adjusted > 0 ? ['maintain', 'admin'] : ['write', 'maintain', 'admin'],
      });
    }
  }

  return rows;
}

module.exports = {
  buildApprovalMatrix,
  defaultEnvironments,
  detectComponents,
};
