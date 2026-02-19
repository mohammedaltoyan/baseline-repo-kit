'use strict';

const { execSync } = require('child_process');
const fs = require('fs');

function parseArgs(argv) {
  const args = {};
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i += 1) {
    const raw = String(list[i] || '').trim();
    if (!raw.startsWith('--')) continue;
    const key = raw.slice(2);
    const next = String(list[i + 1] || '').trim();
    if (!next || next.startsWith('--')) {
      args[key] = '1';
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function toBool(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function readProfiles(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed && parsed.profiles) ? parsed.profiles : [];
  } catch {
    return [];
  }
}

function gitChangedFiles(baseSha, headSha) {
  const base = String(baseSha || '').trim();
  const head = String(headSha || '').trim();
  if (!base || !head) return [];
  try {
    const out = execSync(`git diff --name-only ${base}...${head}`, { encoding: 'utf8' });
    return String(out || '')
      .split(/\r?\n/)
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseRegexes(values) {
  const out = [];
  for (const raw of (Array.isArray(values) ? values : [])) {
    const pattern = String(raw || '').trim();
    if (!pattern) continue;
    try { out.push(new RegExp(pattern)); } catch {}
  }
  return out;
}

function matchesAny(value, regexes) {
  for (const re of (Array.isArray(regexes) ? regexes : [])) {
    if (re.test(value)) return true;
  }
  return false;
}

function classifyProfiles(files, profiles) {
  const matched = [];
  let risky = false;
  for (const profile of (Array.isArray(profiles) ? profiles : [])) {
    const id = String(profile && profile.id || '').trim();
    if (!id) continue;
    const includeRe = parseRegexes(profile.include_re);
    const excludeRe = parseRegexes(profile.exclude_re);
    const hit = files.some((file) => matchesAny(file, includeRe) && !matchesAny(file, excludeRe));
    if (!hit) continue;
    const skipFullLane = !!(profile && profile.skip_full_lane);
    matched.push({
      id,
      skip_full_lane: skipFullLane,
    });
    if (!skipFullLane) risky = true;
  }
  return { matched, risky };
}

function labelsContain(labelsJson, expected) {
  const needle = String(expected || '').trim().toLowerCase();
  if (!needle) return false;
  try {
    const labels = JSON.parse(String(labelsJson || '[]'));
    return (Array.isArray(labels) ? labels : []).some((item) => String(item || '').trim().toLowerCase() === needle);
  } catch {
    return false;
  }
}

function hasPathTrigger(files, rawPaths) {
  const parts = String(rawPaths || '')
    .split(',')
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (!parts.length) return false;
  return files.some((file) => parts.some((prefix) => file.startsWith(prefix)));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = String(args.mode || 'two_lane').trim();
  const eventName = String(args['event-name'] || '').trim();
  const mergeQueueEnabled = toBool(args['merge-queue']);
  const manualDispatchEnabled = toBool(args['manual-dispatch']);
  const runFullReasons = [];

  if (mode === 'full') {
    runFullReasons.push('ci_mode_full');
  }

  if (eventName === 'merge_group' && mergeQueueEnabled) {
    runFullReasons.push('merge_queue_event');
  }

  if (eventName === 'workflow_dispatch' && manualDispatchEnabled) {
    runFullReasons.push('manual_dispatch_policy');
  }

  if (eventName === 'pull_request' && labelsContain(args['labels-json'], args.label)) {
    runFullReasons.push('explicit_full_label');
  }

  const changedFiles = eventName === 'pull_request'
    ? gitChangedFiles(args['base-sha'], args['head-sha'])
    : [];
  const profiles = readProfiles(args['profiles-file']);
  const profileResult = classifyProfiles(changedFiles, profiles);

  if (hasPathTrigger(changedFiles, args['trigger-paths'])) {
    runFullReasons.push('path_trigger');
  }
  if (profileResult.risky) {
    runFullReasons.push('risky_change_profile');
  }

  const runFull = mode !== 'lightweight' && runFullReasons.length > 0;
  const payload = {
    run_full: runFull,
    reasons: runFullReasons,
    changed_files: changedFiles,
    matched_profiles: profileResult.matched,
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main();
