const fs = require('fs');
const path = require('path');
const { readJsonSafe, writeJson } = require('../utils/json');

function toString(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeProfileName(raw) {
  const v = toString(raw).toLowerCase();
  if (!v) return '';
  // Keep it filesystem- and flag-friendly.
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(v)) return '';
  return v;
}

function defaultInstallProfilesPolicy() {
  return {
    version: 1,
    default_profile: 'standard',
    lock_path: 'config/baseline/baseline.lock.json',
    profiles: {
      standard: {
        description:
          'Default baseline: governance + plans + docs templates + monorepo scaffolding + optional security/deploy templates (opt-in by vars).',
        file_filters: { deny: [] },
        bootstrap_defaults: {
          enableBackport: 1,
          enableSecurity: 0,
          enableDeploy: 0,
          hardeningLabels: 1,
          hardeningSecurity: 1,
          hardeningEnvironments: 1,
        },
      },
    },
  };
}

function loadInstallProfilesPolicy(sourceRoot) {
  const root = path.resolve(String(sourceRoot || process.cwd()));
  const policyPath = path.join(root, 'config', 'policy', 'install-profiles.json');
  const defaults = defaultInstallProfilesPolicy();
  const raw = readJsonSafe(policyPath);
  if (!raw || typeof raw !== 'object') return { path: policyPath, loaded: false, config: defaults };

  const next = { ...defaults, ...raw };
  const profiles = raw.profiles && typeof raw.profiles === 'object' ? raw.profiles : {};
  next.profiles = { ...defaults.profiles, ...profiles };
  return { path: policyPath, loaded: true, config: next };
}

function readBaselineLock({ targetRoot, lockRelPath }) {
  const root = path.resolve(String(targetRoot || process.cwd()));
  const rel = toString(lockRelPath || '').replace(/\\/g, '/');
  if (!rel) return null;
  const p = path.join(root, ...rel.split('/').filter(Boolean));
  if (!fs.existsSync(p)) return null;
  const raw = readJsonSafe(p);
  if (!raw || typeof raw !== 'object') return null;
  return { path: p, data: raw };
}

function resolveInstallProfile({ policy, profileArg, targetLock }) {
  const cfg = policy && typeof policy === 'object' ? policy : defaultInstallProfilesPolicy();
  const profiles = cfg.profiles && typeof cfg.profiles === 'object' ? cfg.profiles : {};

  const requested = normalizeProfileName(profileArg);
  const fromLock = normalizeProfileName(targetLock && targetLock.profile);
  const fallback = normalizeProfileName(cfg.default_profile) || 'standard';

  const pick = (name) => (name && Object.prototype.hasOwnProperty.call(profiles, name) ? name : '');

  const name = pick(requested) || pick(fromLock) || pick(fallback) || pick(Object.keys(profiles)[0] || '') || 'standard';
  return { name, profile: profiles[name] || {} };
}

function compileProfileFilters(profile) {
  const p = profile && typeof profile === 'object' ? profile : {};
  const filters = p.file_filters && typeof p.file_filters === 'object' ? p.file_filters : {};
  const denyRaw = Array.isArray(filters.deny) ? filters.deny : [];
  const deny = [];
  for (const raw of denyRaw) {
    const s = toString(raw);
    if (!s) continue;
    try {
      deny.push(new RegExp(s));
    } catch {
      // ignore invalid rules; keep installer resilient
    }
  }
  return { deny };
}

function profileAllowsPath(relPosix, compiledFilters) {
  const rel = toString(relPosix).replace(/\\/g, '/');
  if (!rel) return true;
  const filters = compiledFilters && typeof compiledFilters === 'object' ? compiledFilters : { deny: [] };
  return !filters.deny.some((re) => re.test(rel));
}

function writeBaselineLock({ targetRoot, lockRelPath, profileName, policyRelPath, dryRun }) {
  const root = path.resolve(String(targetRoot || process.cwd()));
  const rel = toString(lockRelPath || '').replace(/\\/g, '/');
  if (!rel) return { path: '', wrote: false };

  const outPath = path.join(root, ...rel.split('/').filter(Boolean));
  const payload = {
    version: 1,
    profile: normalizeProfileName(profileName) || 'standard',
    updated_utc: new Date().toISOString().slice(0, 10),
  };

  const policyRel = toString(policyRelPath || '').replace(/\\/g, '/');
  if (policyRel) payload.policy_rel_path = policyRel;

  if (dryRun) return { path: outPath, wrote: true, dryRun: true, payload };
  writeJson(outPath, payload);
  return { path: outPath, wrote: true, payload };
}

module.exports = {
  compileProfileFilters,
  defaultInstallProfilesPolicy,
  loadInstallProfilesPolicy,
  normalizeProfileName,
  profileAllowsPath,
  readBaselineLock,
  resolveInstallProfile,
  toString,
  writeBaselineLock,
};
