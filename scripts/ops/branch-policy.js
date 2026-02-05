'use strict';

const fs = require('fs');
const path = require('path');
const { readJsonSafe } = require('../utils/json');

function defaultConfig() {
  return {
    version: 1,
    integration_branch: 'dev',
    production_branch: 'main',
    hotfix_branch_prefixes: ['hotfix/'],
    require_hotfix_backport_note: true,
    hotfix_backport_markers: ['Backport:', 'Dev PR:'],
  };
}

function toString(value) {
  return String(value == null ? '' : value).trim();
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => toString(v))
    .filter(Boolean);
}

function normalizeConfig(raw) {
  const d = defaultConfig();
  const r = raw && typeof raw === 'object' ? raw : {};

  const integrationBranch = toString(r.integration_branch) || d.integration_branch;
  const productionBranch = toString(r.production_branch) || d.production_branch;
  const hotfixPrefixes = toStringArray(r.hotfix_branch_prefixes);
  const requireHotfixBackportNote =
    typeof r.require_hotfix_backport_note === 'boolean'
      ? r.require_hotfix_backport_note
      : d.require_hotfix_backport_note;
  const backportMarkers = toStringArray(r.hotfix_backport_markers);

  return {
    ...d,
    ...r,
    integration_branch: integrationBranch,
    production_branch: productionBranch,
    hotfix_branch_prefixes: hotfixPrefixes.length ? hotfixPrefixes : d.hotfix_branch_prefixes,
    require_hotfix_backport_note: requireHotfixBackportNote,
    hotfix_backport_markers: backportMarkers.length ? backportMarkers : d.hotfix_backport_markers,
  };
}

function loadBranchPolicyConfig(repoRoot) {
  const root = repoRoot ? path.resolve(String(repoRoot)) : process.cwd();
  const cfgPath = path.join(root, 'config', 'policy', 'branch-policy.json');
  const raw = fs.existsSync(cfgPath) ? readJsonSafe(cfgPath) : null;
  return {
    path: cfgPath,
    loaded: !!raw,
    config: normalizeConfig(raw),
  };
}

function escapeRegExp(input) {
  return String(input || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function startsWithAnyPrefix(value, prefixes) {
  const v = toString(value);
  if (!v) return false;
  const list = Array.isArray(prefixes) ? prefixes : [];
  return list.some((p) => {
    const pref = toString(p);
    return pref ? v.startsWith(pref) : false;
  });
}

function hasAnyMarker(body, markers) {
  const text = String(body || '');
  const list = Array.isArray(markers) ? markers : [];
  return list.some((m) => {
    const marker = toString(m);
    if (!marker) return false;
    const re = new RegExp(`(^|\\n)\\s*${escapeRegExp(marker)}\\s*\\S+`, 'i');
    return re.test(text);
  });
}

function validateBranchPolicy({ baseRef, headRef, prBody, config }) {
  const cfg = normalizeConfig(config);
  const base = toString(baseRef);
  const head = toString(headRef);

  if (!base || !head) {
    return { skipped: true, reason: 'missing base/head ref', integration: cfg.integration_branch, production: cfg.production_branch };
  }

  const integration = cfg.integration_branch;
  const production = cfg.production_branch;

  if (base === integration) {
    if (head === production && production && production !== integration) {
      throw new Error(
        `PRs into ${integration} must not come from ${production} directly. ` +
        `Use a backport branch (e.g., backport/*) so ${production} is never the PR head.`
      );
    }
    return { ok: true, base, head, integration, production };
  }

  if (base === production) {
    if (head === integration) {
      return { ok: true, base, head, integration, production, reason: 'release-from-integration' };
    }

    const isHotfix = startsWithAnyPrefix(head, cfg.hotfix_branch_prefixes);
    if (!isHotfix) {
      throw new Error(
        `PRs into ${production} must come from ${integration} or a hotfix branch (${cfg.hotfix_branch_prefixes.join(', ') || 'hotfix/'}). Found head=${head}.`
      );
    }

    if (cfg.require_hotfix_backport_note) {
      const ok = hasAnyMarker(prBody, cfg.hotfix_backport_markers);
      if (!ok) {
        throw new Error(
          `Hotfix PRs into ${production} must include a backport note so the fix is reflected in ${integration}. Add one of: ${cfg.hotfix_backport_markers.join(', ')}`
        );
      }
    }

    return { ok: true, base, head, integration, production, reason: 'hotfix' };
  }

  throw new Error(
    `PRs must target the integration branch (${integration}). Production (${production}) is allowed only for release (from ${integration}) or hotfix branches. Found base=${base}.`
  );
}

module.exports = {
  defaultConfig,
  loadBranchPolicyConfig,
  normalizeConfig,
  validateBranchPolicy,
};
