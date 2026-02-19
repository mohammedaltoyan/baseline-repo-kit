/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const path = require('path');
const {
  createChecklist,
  parseCliArgs,
  renderChecklistMarkdown,
} = require('./ui-visual-uat');

function run() {
  const args = parseCliArgs(
    [
      '--artifact-dir', 'tmp/evidence/ui',
      '--keep-alive',
      '--host', '10.20.30.40',
      '--timeout-ms', '15000',
      '--backend-port', '4310',
    ],
    { cwd: '/repo' }
  );
  assert.strictEqual(args.keepAlive, true);
  assert.strictEqual(args.host, '10.20.30.40');
  assert.strictEqual(args.timeoutMs, 15000);
  assert.strictEqual(args.backendPort, 4310);
  assert.strictEqual(args.artifactDir, path.resolve('/repo', 'tmp/evidence/ui'));

  const checklist = createChecklist({
    healthyUrl: 'https://ui.example.invalid/healthy',
    errorUrl: 'https://ui.example.invalid/error',
    reportRelPath: 'tmp/report.json',
    evidenceRelPath: 'tmp/screenshots',
  });
  assert.ok(Array.isArray(checklist) && checklist.length >= 4);
  assert.ok(checklist.some((item) => item.id === 'ui-happy-openapi'));
  assert.ok(checklist.some((item) => item.id === 'ui-error-backend'));

  const markdown = renderChecklistMarkdown({
    startedAt: '2026-02-19T00:00:00.000Z',
    healthyUrl: 'https://ui.example.invalid/healthy',
    errorUrl: 'https://ui.example.invalid/error',
    reportPath: '/repo/tmp/report.json',
    evidenceDir: '/repo/tmp/screenshots',
    checklist,
  });
  assert.ok(markdown.includes('# UI Visual UAT Walkthrough'));
  assert.ok(markdown.includes('01-happy-home.png'));
  assert.ok(markdown.includes('03-backend-error-state.png'));

  console.log('[ui-visual-uat:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };
