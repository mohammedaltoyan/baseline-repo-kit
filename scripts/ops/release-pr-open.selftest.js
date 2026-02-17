/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const { buildReleasePrBody, buildReleasePrTitle } = require('./release-pr-open');

function run() {
  const titleDefault = buildReleasePrTitle({ integration: 'dev', production: 'main', overrideTitle: '' });
  assert.strictEqual(titleDefault, 'chore(release): promote dev -> main');

  const titleOverride = buildReleasePrTitle({ integration: 'dev', production: 'main', overrideTitle: 'Release v1' });
  assert.strictEqual(titleOverride, 'Release v1');

  const bodyDefault = buildReleasePrBody({ integration: 'dev', production: 'main', planId: '', step: '' });
  assert.match(bodyDefault, /Release promotion PR opened by GitHub Actions/i);
  assert.ok(!/Plan:\s*PLAN-/i.test(bodyDefault), 'expected default release body to omit Plan when not provided');
  assert.ok(!/Step:\s*S\d{2}/i.test(bodyDefault), 'expected default release body to omit Step when not provided');

  const bodyWithMeta = buildReleasePrBody({
    integration: 'dev',
    production: 'main',
    planId: 'PLAN-202602-release',
    step: 'S99',
  });
  assert.match(bodyWithMeta, /^Plan:\s*PLAN-202602-release/m);
  assert.match(bodyWithMeta, /^Step:\s*S99/m);

  console.log('[release-pr-open:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };

