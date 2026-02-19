'use strict';

const Ajv = require('ajv');
const { CAPABILITY_KEYS } = require('../capabilities/github');
const {
  EFFECTIVE_SETTINGS_RULES_FILE,
  EFFECTIVE_SETTINGS_RULES_SCHEMA_FILE,
} = require('../constants');
const { readJsonSafe } = require('../util/fs');

let rulesCache = null;
let rulesSchemaCache = null;
let rulesValidatorCache = null;

function cloneJson(value) {
  if (value == null) return value;
  if (typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function getPath(obj, path) {
  const parts = String(path || '').split('.').filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function setPath(obj, path, value) {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) return;
  let current = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!current[key] || typeof current[key] !== 'object') current[key] = {};
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
}

function getCapability(capabilities, key) {
  const map = capabilities && capabilities.capabilities && typeof capabilities.capabilities === 'object'
    ? capabilities.capabilities
    : {};
  const selected = map[String(key || '').trim()];
  return selected && typeof selected === 'object' ? selected : null;
}

function getModuleEntry(moduleEvaluation, moduleId) {
  const modules = Array.isArray(moduleEvaluation && moduleEvaluation.modules)
    ? moduleEvaluation.modules
    : [];
  return modules.find((entry) => String(entry && entry.id || '') === String(moduleId || '')) || null;
}

function getMissingCapability(moduleEntry, capability) {
  const missing = Array.isArray(moduleEntry && moduleEntry.missing) ? moduleEntry.missing : [];
  return missing.find((entry) => String(entry && entry.capability || '') === String(capability || '')) || null;
}

function createAjv() {
  return new Ajv({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
  });
}

function formatValidationErrors(errors) {
  const list = Array.isArray(errors) ? errors : [];
  if (list.length === 0) return 'unknown schema validation error';
  return list
    .map((error) => {
      const at = String(error && error.instancePath || '').trim() || '/';
      const message = String(error && error.message || 'validation failed').trim();
      return `${at} ${message}`.trim();
    })
    .join(' | ');
}

function loadRulesSchema() {
  if (!rulesSchemaCache) {
    rulesSchemaCache = readJsonSafe(EFFECTIVE_SETTINGS_RULES_SCHEMA_FILE, null);
    if (!rulesSchemaCache) {
      throw new Error(`Effective settings rules schema missing or invalid: ${EFFECTIVE_SETTINGS_RULES_SCHEMA_FILE}`);
    }
  }
  return rulesSchemaCache;
}

function getRulesValidator() {
  if (!rulesValidatorCache) {
    const ajv = createAjv();
    rulesValidatorCache = ajv.compile(loadRulesSchema());
  }
  return rulesValidatorCache;
}

function normalizeRule(rule) {
  const source = rule && typeof rule === 'object' ? rule : {};
  return {
    id: String(source.id || '').trim(),
    path: String(source.path || '').trim(),
    capability: String(source.capability || '').trim(),
    module: String(source.module || '').trim(),
    when_configured_equals: !!source.when_configured_equals,
    effective_value: source.effective_value,
    reason: String(source.reason || 'capability_auto_degrade').trim() || 'capability_auto_degrade',
    detail_template: String(source.detail_template || '').trim()
      || '{capability} capability is {capability_state} ({capability_reason})',
    remediation: String(source.remediation || '').trim(),
  };
}

function validateRuleSemantics(rules) {
  const list = Array.isArray(rules) ? rules : [];
  const capabilitySet = new Set(CAPABILITY_KEYS);
  const idSeen = new Set();
  const pathSeen = new Set();
  const duplicateIds = [];
  const duplicatePaths = [];
  const invalidCapabilities = [];

  for (const rule of list) {
    const id = String(rule && rule.id || '').trim();
    const path = String(rule && rule.path || '').trim();
    const capability = String(rule && rule.capability || '').trim();
    if (idSeen.has(id)) duplicateIds.push(id);
    idSeen.add(id);
    if (pathSeen.has(path)) duplicatePaths.push(path);
    pathSeen.add(path);
    if (!capabilitySet.has(capability)) invalidCapabilities.push(`${id}->${capability}`);
  }

  if (duplicateIds.length > 0) {
    throw new Error(`Invalid effective settings rules: duplicate id(s): ${duplicateIds.join(', ')}`);
  }
  if (duplicatePaths.length > 0) {
    throw new Error(`Invalid effective settings rules: duplicate path(s): ${duplicatePaths.join(', ')}`);
  }
  if (invalidCapabilities.length > 0) {
    throw new Error(`Invalid effective settings rules: unknown capability key(s): ${invalidCapabilities.join(', ')}`);
  }
}

function loadEffectiveSettingRules() {
  if (rulesCache) return rulesCache;

  const payload = readJsonSafe(EFFECTIVE_SETTINGS_RULES_FILE, null);
  if (!payload) {
    throw new Error(`Effective settings rules missing or invalid: ${EFFECTIVE_SETTINGS_RULES_FILE}`);
  }

  const validator = getRulesValidator();
  const ok = validator(payload);
  if (!ok) {
    throw new Error(`Invalid effective settings rules: ${formatValidationErrors(validator.errors)}`);
  }

  const normalized = {
    version: Number(payload.version || 1),
    rules: (Array.isArray(payload.rules) ? payload.rules : []).map(normalizeRule),
  };
  validateRuleSemantics(normalized.rules);
  rulesCache = normalized;
  return rulesCache;
}

function renderDetail(template, context) {
  const source = context && typeof context === 'object' ? context : {};
  return String(template || '')
    .replace(/\{capability\}/g, String(source.capability || 'unknown'))
    .replace(/\{capability_state\}/g, String(source.capability_state || 'unknown'))
    .replace(/\{capability_reason\}/g, String(source.capability_reason || 'unknown'));
}

function deriveModuleCapabilityRequirements({ moduleId, config, baseRequires }) {
  const targetModuleId = String(moduleId || '').trim();
  const sourceConfig = config && typeof config === 'object' ? config : {};
  const requirements = [];
  const seen = new Set();

  function addRequirement(value) {
    const key = String(value || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    requirements.push(key);
  }

  for (const capability of Array.isArray(baseRequires) ? baseRequires : []) {
    addRequirement(capability);
  }

  if (!targetModuleId) return requirements;

  const ruleset = loadEffectiveSettingRules();
  for (const rule of ruleset.rules) {
    if (String(rule && rule.module || '') !== targetModuleId) continue;
    const configured = getPath(sourceConfig, rule.path);
    if (configured === rule.when_configured_equals) {
      addRequirement(rule.capability);
    }
  }

  return requirements;
}

function buildEffectiveConfig({ config, capabilities, moduleEvaluation }) {
  const sourceConfig = config && typeof config === 'object' ? config : {};
  const effectiveConfig = cloneJson(sourceConfig);
  const overrides = [];
  const ruleset = loadEffectiveSettingRules();

  for (const rule of ruleset.rules) {
    const configured = getPath(sourceConfig, rule.path);
    if (configured !== rule.when_configured_equals) continue;

    const capability = getCapability(capabilities, rule.capability);
    const capabilitySupported = !!(capability && capability.supported === true);
    const moduleEntry = getModuleEntry(moduleEvaluation, rule.module);
    const missing = getMissingCapability(moduleEntry, rule.capability);
    if (capabilitySupported && !missing) continue;

    const capabilityReason = String(missing && missing.reason || capability && capability.reason || 'capability_unavailable');
    const capabilityState = String(capability && capability.state || 'unknown');
    const remediation = String(missing && missing.remediation || '').trim() || rule.remediation;
    const effectiveValue = cloneJson(rule.effective_value);

    setPath(effectiveConfig, rule.path, effectiveValue);
    overrides.push({
      id: rule.id,
      path: rule.path,
      configured,
      effective: effectiveValue,
      source: rule.module,
      reason: rule.reason,
      detail: renderDetail(rule.detail_template, {
        capability: rule.capability,
        capability_state: capabilityState,
        capability_reason: capabilityReason,
      }),
      capability: rule.capability,
      remediation,
    });
  }

  const byPath = Object.fromEntries(overrides.map((entry) => [entry.path, entry]));

  return {
    rules_version: ruleset.version,
    config: effectiveConfig,
    overrides,
    by_path: byPath,
    override_count: overrides.length,
  };
}

module.exports = {
  buildEffectiveConfig,
  deriveModuleCapabilityRequirements,
  getPath,
  loadEffectiveSettingRules,
  setPath,
};
