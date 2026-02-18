/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { normalizeRelPath, gitDiffNames } = require('./changed-surfaces');

function runCmd(cwd, cmd, args) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${(res.stderr || res.stdout || '').trim()}`);
  }
  return String(res.stdout || '').trim();
}

function writeFile(root, rel, content) {
  const p = path.join(root, ...String(rel).split('/').filter(Boolean));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

function run() {
  assert.strictEqual(normalizeRelPath('\\\\docs\\\\README.md'), 'docs/README.md');
  assert.strictEqual(normalizeRelPath('/apps/x'), 'apps/x');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-kit-changed-surfaces-'));
  runCmd(tmp, 'git', ['init']);
  runCmd(tmp, 'git', ['config', 'user.email', 'test@example.com']);
  runCmd(tmp, 'git', ['config', 'user.name', 'test']);

  writeFile(tmp, 'apps/web/a.txt', 'a1\n');
  runCmd(tmp, 'git', ['add', '-A']);
  runCmd(tmp, 'git', ['commit', '-m', 'c1']);
  const c1 = runCmd(tmp, 'git', ['rev-parse', 'HEAD']);

  writeFile(tmp, 'apps/web/a.txt', 'a2\n');
  writeFile(tmp, 'docs/x.md', 'd1\n');
  runCmd(tmp, 'git', ['add', '-A']);
  runCmd(tmp, 'git', ['commit', '-m', 'c2']);
  const c2 = runCmd(tmp, 'git', ['rev-parse', 'HEAD']);

  const changed = gitDiffNames({ baseRef: c1, headRef: c2, cwd: tmp }).sort();
  assert.deepStrictEqual(changed, ['apps/web/a.txt', 'docs/x.md'].sort());

  console.log('[changed-surfaces:selftest] OK');
}

if (require.main === module) {
  run();
}

module.exports = { run };

