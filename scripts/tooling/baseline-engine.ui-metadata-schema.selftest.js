/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const {
  loadUiMetadata,
  validateUiMetadata,
} = require('../../tooling/apps/baseline-engine/lib/schema');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function run() {
  const metadata = loadUiMetadata();
  assert.strictEqual(validateUiMetadata(metadata), true, 'default UI metadata should pass validation');

  const duplicateSection = clone(metadata);
  duplicateSection.sections.push({
    id: duplicateSection.sections[0].id,
    title: 'duplicate',
    description: 'duplicate',
  });
  assert.throws(
    () => validateUiMetadata(duplicateSection),
    /duplicate section id/i,
    'metadata validation should reject duplicate section ids'
  );

  const unknownSection = clone(metadata);
  unknownSection.fields['policy.profile'].section = 'missing_section';
  assert.throws(
    () => validateUiMetadata(unknownSection),
    /unknown section reference/i,
    'metadata validation should reject unknown section references'
  );

  const unknownCapability = clone(metadata);
  unknownCapability.fields['policy.profile'].capability_key = 'unknown_capability';
  assert.throws(
    () => validateUiMetadata(unknownCapability),
    /unknown capability_key value/i,
    'metadata validation should reject unknown capability keys'
  );

  console.log('[baseline-engine:ui-metadata-schema-selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
