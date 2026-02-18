/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const { mergeManagedContent } = require('../../tooling/apps/baseline-engine/lib/merge');

function run() {
  const mergedJson = mergeManagedContent({
    strategy: 'json_merge',
    current: '{\n  "a": 1,\n  "persist": true,\n  "nested": { "x": 1 }\n}\n',
    next: '{\n  "a": 2,\n  "nested": { "y": 2 }\n}\n',
    base: '',
    filePath: 'state.json',
    preserveUserBlocks: false,
  });
  const mergedJsonValue = JSON.parse(mergedJson.content);
  assert.strictEqual(mergedJsonValue.a, 2);
  assert.strictEqual(mergedJsonValue.persist, true);
  assert.strictEqual(mergedJsonValue.nested.x, 1);
  assert.strictEqual(mergedJsonValue.nested.y, 2);

  const mergedYaml = mergeManagedContent({
    strategy: 'yaml_merge',
    current: 'a: 1\npersist: true\nnested:\n  x: 1\n',
    next: 'a: 2\nnested:\n  y: 2\n',
    base: '',
    filePath: 'state.yaml',
    preserveUserBlocks: false,
  });
  assert.ok(/persist: true/.test(mergedYaml.content), 'yaml_merge should preserve existing keys');
  assert.ok(/a: 2/.test(mergedYaml.content), 'yaml_merge should apply generated values');

  const withUserBlock = mergeManagedContent({
    strategy: 'replace',
    current: [
      '# baseline:user-block notes:begin',
      '# keep me',
      '# baseline:user-block notes:end',
      'value: old',
      '',
    ].join('\n'),
    next: [
      '# baseline:user-block notes:begin',
      '# overwrite me',
      '# baseline:user-block notes:end',
      'value: new',
      '',
    ].join('\n'),
    base: '',
    filePath: 'example.txt',
    preserveUserBlocks: true,
  });
  assert.ok(withUserBlock.content.includes('# keep me'), 'user block should be preserved');
  assert.ok(withUserBlock.content.includes('value: new'), 'non-user block content should update');

  const conflict = mergeManagedContent({
    strategy: 'three_way',
    current: 'A\n',
    next: 'B\n',
    base: 'BASE\n',
    filePath: 'plain.txt',
    preserveUserBlocks: false,
  });
  assert.strictEqual(conflict.conflicted, true, 'three_way should mark conflict on divergent text changes');
  assert.ok(conflict.content.includes('<<<<<<<'), 'three_way conflict markers should be present');

  console.log('[baseline-engine:merge-selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };

