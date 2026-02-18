'use strict';

const { SCHEMA_FILE, UI_METADATA_FILE } = require('./constants');
const { readJsonSafe } = require('./util/fs');

let schemaCache = null;
let metadataCache = null;

function loadSchema() {
  if (!schemaCache) {
    schemaCache = readJsonSafe(SCHEMA_FILE, null);
    if (!schemaCache) throw new Error(`Schema file missing or invalid: ${SCHEMA_FILE}`);
  }
  return schemaCache;
}

function loadUiMetadata() {
  if (!metadataCache) {
    metadataCache = readJsonSafe(UI_METADATA_FILE, null);
    if (!metadataCache) throw new Error(`UI metadata missing or invalid: ${UI_METADATA_FILE}`);
  }
  return metadataCache;
}

function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid config: ${name} must be an object`);
  }
}

function validateConfig(config) {
  assertObject(config, 'root');

  const required = [
    'version',
    'platform',
    'policy',
    'branching',
    'ci',
    'deployments',
    'planning',
    'security',
    'updates',
    'modules',
  ];

  const missing = required.filter((key) => !(key in config));
  if (missing.length > 0) {
    throw new Error(`Invalid config: missing top-level keys: ${missing.join(', ')}`);
  }

  const profile = String(config.policy && config.policy.profile || '').trim();
  if (!['strict', 'moderate', 'advisory'].includes(profile)) {
    throw new Error(`Invalid config: policy.profile must be strict|moderate|advisory (received ${profile || '<empty>'})`);
  }

  const mode = String(config.ci && config.ci.mode || '').trim();
  if (!['two_lane', 'full', 'lightweight'].includes(mode)) {
    throw new Error(`Invalid config: ci.mode must be two_lane|full|lightweight (received ${mode || '<empty>'})`);
  }

  const applyMode = String(config.updates && config.updates.apply_mode || '').trim();
  if (!['pr_first', 'direct'].includes(applyMode)) {
    throw new Error(`Invalid config: updates.apply_mode must be pr_first|direct (received ${applyMode || '<empty>'})`);
  }

  const branches = config.branching && config.branching.branches;
  if (!Array.isArray(branches) || branches.length === 0) {
    throw new Error('Invalid config: branching.branches must be a non-empty array');
  }

  const components = config.deployments && config.deployments.components;
  if (!Array.isArray(components) || components.length === 0) {
    throw new Error('Invalid config: deployments.components must be a non-empty array');
  }

  const matrix = config.deployments && config.deployments.approval_matrix;
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error('Invalid config: deployments.approval_matrix must be a non-empty array');
  }

  return true;
}

module.exports = {
  loadSchema,
  loadUiMetadata,
  validateConfig,
};
