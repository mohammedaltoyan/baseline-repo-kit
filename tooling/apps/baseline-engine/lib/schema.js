'use strict';

const Ajv = require('ajv');
const { SCHEMA_FILE, UI_METADATA_FILE, UI_METADATA_SCHEMA_FILE } = require('./constants');
const { CAPABILITY_KEYS } = require('./capabilities/github');
const { readJsonSafe } = require('./util/fs');

let configSchemaCache = null;
let metadataSchemaCache = null;
let metadataCache = null;
let configValidatorCache = null;
let metadataValidatorCache = null;

function loadSchema() {
  if (!configSchemaCache) {
    configSchemaCache = readJsonSafe(SCHEMA_FILE, null);
    if (!configSchemaCache) throw new Error(`Schema file missing or invalid: ${SCHEMA_FILE}`);
  }
  return configSchemaCache;
}

function loadUiMetadataSchema() {
  if (!metadataSchemaCache) {
    metadataSchemaCache = readJsonSafe(UI_METADATA_SCHEMA_FILE, null);
    if (!metadataSchemaCache) throw new Error(`UI metadata schema missing or invalid: ${UI_METADATA_SCHEMA_FILE}`);
  }
  return metadataSchemaCache;
}

function loadUiMetadata() {
  if (!metadataCache) {
    metadataCache = readJsonSafe(UI_METADATA_FILE, null);
    if (!metadataCache) throw new Error(`UI metadata missing or invalid: ${UI_METADATA_FILE}`);
    validateUiMetadata(metadataCache);
  }
  return metadataCache;
}

function createAjv() {
  return new Ajv({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
  });
}

function getConfigValidator() {
  if (!configValidatorCache) {
    const ajv = createAjv();
    configValidatorCache = ajv.compile(loadSchema());
  }
  return configValidatorCache;
}

function getUiMetadataValidator() {
  if (!metadataValidatorCache) {
    const ajv = createAjv();
    metadataValidatorCache = ajv.compile(loadUiMetadataSchema());
  }
  return metadataValidatorCache;
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

function validateUiMetadata(metadata) {
  const validator = getUiMetadataValidator();
  const ok = validator(metadata);
  if (!ok) {
    throw new Error(`Invalid UI metadata: ${formatValidationErrors(validator.errors)}`);
  }

  const sections = Array.isArray(metadata && metadata.sections) ? metadata.sections : [];
  const sectionIds = new Set();
  const duplicates = [];
  for (const section of sections) {
    const id = String(section && section.id || '').trim();
    if (!id) continue;
    if (sectionIds.has(id)) {
      duplicates.push(id);
      continue;
    }
    sectionIds.add(id);
  }
  if (duplicates.length > 0) {
    throw new Error(`Invalid UI metadata: duplicate section id(s): ${duplicates.join(', ')}`);
  }

  const capabilityKeySet = new Set(CAPABILITY_KEYS);
  const fields = metadata && metadata.fields && typeof metadata.fields === 'object' ? metadata.fields : {};
  const missingSectionRefs = [];
  const invalidCapabilityKeys = [];
  for (const [fieldPath, fieldMeta] of Object.entries(fields)) {
    const section = String(fieldMeta && fieldMeta.section || '').trim();
    if (section && !sectionIds.has(section)) {
      missingSectionRefs.push(`${fieldPath}->${section}`);
    }
    const capabilityKey = String(fieldMeta && fieldMeta.capability_key || '').trim();
    if (capabilityKey && !capabilityKeySet.has(capabilityKey)) {
      invalidCapabilityKeys.push(`${fieldPath}->${capabilityKey}`);
    }
  }

  if (missingSectionRefs.length > 0) {
    throw new Error(`Invalid UI metadata: unknown section reference(s): ${missingSectionRefs.join(', ')}`);
  }
  if (invalidCapabilityKeys.length > 0) {
    throw new Error(`Invalid UI metadata: unknown capability_key value(s): ${invalidCapabilityKeys.join(', ')}`);
  }

  return true;
}

function validateConfig(config) {
  const validator = getConfigValidator();
  const ok = validator(config);
  if (!ok) {
    throw new Error(`Invalid config: ${formatValidationErrors(validator.errors)}`);
  }

  return true;
}

module.exports = {
  loadSchema,
  loadUiMetadata,
  loadUiMetadataSchema,
  validateConfig,
  validateUiMetadata,
};
