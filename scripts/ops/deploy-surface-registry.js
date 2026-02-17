'use strict';

const fs = require('fs');
const path = require('path');
const { readJsonSafe, stripBom } = require('../utils/json');

function toString(value) {
  return String(value == null ? '' : value).trim();
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => toString(v)).filter(Boolean);
}

function normalizePath(p) {
  return toString(p).replace(/\\/g, '/').replace(/^\/+/, '');
}

function normalizeTier(raw) {
  const v = toString(raw).toLowerCase();
  if (!v) return '';
  if (v === 'staging' || v === 'production') return v;
  return '';
}

function normalizeApprovalMode(raw) {
  const v = toString(raw).toLowerCase();
  if (!v) return '';
  if (v === 'commit' || v === 'surface') return v;
  return '';
}

function normalizeSurfaceId(raw) {
  const v = toString(raw).toLowerCase().replace(/_/g, '-');
  if (!v) return '';
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(v)) return '';
  return v;
}

function parseRegexString(raw) {
  const text = toString(raw);
  if (!text) throw new Error('regex pattern must be a non-empty string');

  // Support both plain patterns (`^apps/`) and JS-style literals (`/^apps\\//i`).
  if (text.startsWith('/') && text.lastIndexOf('/') > 0) {
    const last = text.lastIndexOf('/');
    const body = text.slice(1, last);
    const flags = text.slice(last + 1);
    try {
      return new RegExp(body, flags);
    } catch (e) {
      throw new Error(`invalid regex literal "${text}": ${e.message || e}`);
    }
  }

  try {
    return new RegExp(text);
  } catch (e) {
    throw new Error(`invalid regex "${text}": ${e.message || e}`);
  }
}

function defaultRegistry() {
  return {
    version: 1,
    defaults: {
      approval_mode_by_tier: { staging: 'commit', production: 'commit' },
      approval_env_commit_by_tier: { staging: 'staging-approval', production: 'production-approval' },
      approval_env_surface_prefix_by_tier: { staging: 'staging-approval-', production: 'production-approval-' },
      deploy_env_suffix_by_tier: { staging: 'staging', production: 'production' },
      deploy_env_template: '{surface}-{suffix}',
    },
    surfaces: [],
  };
}

function normalizeDefaults(raw) {
  const d = defaultRegistry().defaults;
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};

  function readTierMapString(obj, fallback) {
    const out = { staging: fallback.staging, production: fallback.production };
    const v = obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
    for (const tier of ['staging', 'production']) {
      const val = toString(v[tier]);
      if (val) out[tier] = val;
    }
    return out;
  }

  function readTierMapMode(obj, fallback) {
    const out = { staging: fallback.staging, production: fallback.production };
    const v = obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
    for (const tier of ['staging', 'production']) {
      const val = normalizeApprovalMode(v[tier]);
      if (val) out[tier] = val;
    }
    return out;
  }

  const approvalModeByTier = readTierMapMode(r.approval_mode_by_tier, d.approval_mode_by_tier);
  const approvalEnvCommitByTier = readTierMapString(r.approval_env_commit_by_tier, d.approval_env_commit_by_tier);
  const approvalEnvSurfacePrefixByTier = readTierMapString(
    r.approval_env_surface_prefix_by_tier,
    d.approval_env_surface_prefix_by_tier
  );
  const deployEnvSuffixByTier = readTierMapString(r.deploy_env_suffix_by_tier, d.deploy_env_suffix_by_tier);
  const deployEnvTemplate = toString(r.deploy_env_template) || d.deploy_env_template;

  return {
    approval_mode_by_tier: approvalModeByTier,
    approval_env_commit_by_tier: approvalEnvCommitByTier,
    approval_env_surface_prefix_by_tier: approvalEnvSurfacePrefixByTier,
    deploy_env_suffix_by_tier: deployEnvSuffixByTier,
    deploy_env_template: deployEnvTemplate,
  };
}

function validateAndNormalizeRegistry(raw) {
  const d = defaultRegistry();
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  if (!r) throw new Error('registry must be a JSON object');

  const version = Number(r.version);
  if (version !== 1) throw new Error(`Unsupported registry version "${toString(r.version)}" (expected 1).`);

  const defaults = normalizeDefaults(r.defaults);
  const surfacesRaw = Array.isArray(r.surfaces) ? r.surfaces : null;
  if (!surfacesRaw) throw new Error('registry.surfaces must be an array');
  if (surfacesRaw.length < 1) throw new Error('registry.surfaces must include at least 1 surface row');

  const seen = new Set();
  const surfaces = [];
  for (const row of surfacesRaw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('surface row must be an object');

    const surfaceId = normalizeSurfaceId(row.surface_id);
    if (!surfaceId) throw new Error(`Invalid surface_id "${toString(row.surface_id)}" (expected [a-z0-9][a-z0-9-]{0,63}).`);
    if (seen.has(surfaceId)) throw new Error(`Duplicate surface_id "${surfaceId}".`);
    seen.add(surfaceId);

    const description = toString(row.description);
    const includePatterns = toStringArray(row.paths_include_re);
    if (includePatterns.length < 1) throw new Error(`Surface "${surfaceId}" must define paths_include_re (at least 1 regex).`);
    const excludePatterns = toStringArray(row.paths_exclude_re);

    const include = includePatterns.map((p) => {
      try {
        return parseRegexString(p);
      } catch (e) {
        throw new Error(`Surface "${surfaceId}" invalid paths_include_re regex "${toString(p)}": ${e.message || e}`);
      }
    });
    const exclude = excludePatterns.map((p) => {
      try {
        return parseRegexString(p);
      } catch (e) {
        throw new Error(`Surface "${surfaceId}" invalid paths_exclude_re regex "${toString(p)}": ${e.message || e}`);
      }
    });

    const deployEnvByTier = row.deploy_env_by_tier && typeof row.deploy_env_by_tier === 'object' && !Array.isArray(row.deploy_env_by_tier)
      ? {
        staging: toString(row.deploy_env_by_tier.staging),
        production: toString(row.deploy_env_by_tier.production),
      }
      : null;

    const allowedSecretKeys = toStringArray(row.allowed_secret_keys);
    const allowedVarKeys = toStringArray(row.allowed_var_keys);

    surfaces.push({
      surface_id: surfaceId,
      description,
      paths_include_re: includePatterns,
      paths_exclude_re: excludePatterns,
      paths_include: include,
      paths_exclude: exclude,
      deploy_env_by_tier: deployEnvByTier || undefined,
      allowed_secret_keys: allowedSecretKeys,
      allowed_var_keys: allowedVarKeys,
    });
  }

  return {
    ...d,
    ...r,
    version: 1,
    defaults,
    surfaces,
  };
}

function loadRegistryFromFile(absPath) {
  const p = path.resolve(String(absPath || ''));
  if (!p) throw new Error('registry path is required');
  if (!fs.existsSync(p)) return { loaded: false, path: p, registry: null };
  const rawText = fs.readFileSync(p, 'utf8');
  const parsed = JSON.parse(stripBom(rawText));
  const registry = validateAndNormalizeRegistry(parsed);
  return { loaded: true, path: p, registry };
}

function resolveDeployEnvName({ registry, surfaceId, tier }) {
  if (!registry) throw new Error('registry is required');
  const t = normalizeTier(tier);
  if (!t) throw new Error(`invalid tier "${toString(tier)}" (expected staging|production)`);
  const surface = normalizeSurfaceId(surfaceId);
  if (!surface) throw new Error(`invalid surface_id "${toString(surfaceId)}"`);

  const row = (registry.surfaces || []).find((s) => s && s.surface_id === surface);
  if (!row) throw new Error(`unknown surface_id "${surface}"`);

  const explicit = row.deploy_env_by_tier && toString(row.deploy_env_by_tier[t]);
  if (explicit) return explicit;

  const suffix = toString(registry.defaults && registry.defaults.deploy_env_suffix_by_tier && registry.defaults.deploy_env_suffix_by_tier[t]);
  if (!suffix) throw new Error(`registry defaults missing deploy_env_suffix_by_tier.${t}`);

  const template = toString(registry.defaults && registry.defaults.deploy_env_template);
  if (!template) throw new Error('registry defaults missing deploy_env_template');

  return template.replaceAll('{surface}', surface).replaceAll('{suffix}', suffix);
}

function resolveApprovalEnvName({ registry, tier, approvalMode, surfaceId }) {
  if (!registry) throw new Error('registry is required');
  const t = normalizeTier(tier);
  if (!t) throw new Error(`invalid tier "${toString(tier)}" (expected staging|production)`);

  const mode = normalizeApprovalMode(approvalMode);
  if (!mode) throw new Error(`invalid approval_mode "${toString(approvalMode)}" (expected commit|surface)`);

  const defs = registry.defaults || {};
  if (mode === 'commit') {
    const name = toString(defs.approval_env_commit_by_tier && defs.approval_env_commit_by_tier[t]);
    if (!name) throw new Error(`registry defaults missing approval_env_commit_by_tier.${t}`);
    return name;
  }

  const surface = normalizeSurfaceId(surfaceId);
  if (!surface) throw new Error(`invalid surface_id "${toString(surfaceId)}"`);
  const pref = toString(defs.approval_env_surface_prefix_by_tier && defs.approval_env_surface_prefix_by_tier[t]);
  if (!pref) throw new Error(`registry defaults missing approval_env_surface_prefix_by_tier.${t}`);
  return `${pref}${surface}`;
}

function resolveApprovalMode({ tier, inputApprovalMode, repoVarApprovalMode, registry }) {
  const t = normalizeTier(tier);
  if (!t) throw new Error(`invalid tier "${toString(tier)}" (expected staging|production)`);

  const inputMode = normalizeApprovalMode(inputApprovalMode);
  if (inputMode) return inputMode;

  const repoVarMode = normalizeApprovalMode(repoVarApprovalMode);
  if (repoVarMode) return repoVarMode;

  const regMode = normalizeApprovalMode(
    registry && registry.defaults && registry.defaults.approval_mode_by_tier
      ? registry.defaults.approval_mode_by_tier[t]
      : ''
  );
  if (regMode) return regMode;

  return 'commit';
}

function matchSurfacesForPaths({ registry, paths }) {
  if (!registry) throw new Error('registry is required');
  const list = Array.isArray(paths) ? paths.map(normalizePath).filter(Boolean) : [];
  if (!list.length) return [];

  const out = [];
  for (const surface of registry.surfaces || []) {
    if (!surface || typeof surface !== 'object') continue;
    const include = Array.isArray(surface.paths_include) ? surface.paths_include : [];
    const exclude = Array.isArray(surface.paths_exclude) ? surface.paths_exclude : [];
    if (include.length < 1) continue;

    let matched = false;
    for (const p of list) {
      const inc = include.some((re) => re && re.test(p));
      if (!inc) continue;
      const exc = exclude.some((re) => re && re.test(p));
      if (exc) continue;
      matched = true;
      break;
    }

    if (matched) out.push(surface.surface_id);
  }
  return out;
}

module.exports = {
  defaultRegistry,
  normalizeTier,
  normalizeApprovalMode,
  normalizeSurfaceId,
  normalizePath,
  parseRegexString,
  validateAndNormalizeRegistry,
  loadRegistryFromFile,
  resolveDeployEnvName,
  resolveApprovalEnvName,
  resolveApprovalMode,
  matchSurfacesForPaths,
};

