'use strict';

const Ajv = require('ajv');
const { SCHEMA_FILE, UI_METADATA_FILE } = require('./constants');
const { readJsonSafe } = require('./util/fs');

let schemaCache = null;
let metadataCache = null;
let validatorCache = null;

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

function getValidator() {
  if (!validatorCache) {
    const ajv = new Ajv({
      allErrors: true,
      strict: false,
      allowUnionTypes: true,
    });
    validatorCache = ajv.compile(loadSchema());
  }
  return validatorCache;
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

function validateConfig(config) {
  const validator = getValidator();
  const ok = validator(config);
  if (!ok) {
    throw new Error(`Invalid config: ${formatValidationErrors(validator.errors)}`);
  }

  return true;
}

module.exports = {
  loadSchema,
  loadUiMetadata,
  validateConfig,
};
