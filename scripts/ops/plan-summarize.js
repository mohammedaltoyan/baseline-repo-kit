#!/usr/bin/env node
/**
 * plan-summarize.js
 * Generates a structured summary for a canonical plan and stores it under:
 *   docs/ops/plans/review/<plan_id>/<YYYYMMDD-HHMMSS[-SHORTSHA]>/
 * Also checks off S96 in the plan when present.
 */
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.cwd();
const plansDir = path.join(root, 'docs', 'ops', 'plans');

function die(msg) { console.error(`[plan-summarize] ${msg}`); process.exit(1); }

function parseArgs() {
  const out = { _positionals: [] };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.replace(/^--/, '');
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1';
      out[k] = v;
      continue;
    }
    out._positionals.push(a);
  }
  return out;
}

function read(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function write(file, body) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body, 'utf8'); }

function nowTs() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${MM}${dd}-${hh}${mm}${ss}`;
}

function git(args) {
  const res = spawnSync('git', args, { encoding: 'utf8' });
  if (res.error) return { status: 1, stdout: '', stderr: res.error.message };
  return res;
}

function shortSha() {
  const r = git(['rev-parse', '--short', 'HEAD']);
  return r.status === 0 ? r.stdout.trim() : '0000000';
}

function fullSha() {
  const r = git(['rev-parse', 'HEAD']);
  return r.status === 0 ? r.stdout.trim() : '';
}

function isGitWorkTree() {
  const r = git(['rev-parse', '--is-inside-work-tree']);
  return r.status === 0 && String(r.stdout || '').trim() === 'true';
}

function refExists(ref) {
  return git(['rev-parse', '--verify', '--quiet', String(ref || '').trim()]).status === 0;
}

function defaultRemoteHeadRef() {
  // Prefer the repo's configured remote HEAD (origin/HEAD -> origin/<default>)
  const r = git(['symbolic-ref', '-q', 'refs/remotes/origin/HEAD']);
  if (r.status === 0) {
    const full = String(r.stdout || '').trim(); // e.g., refs/remotes/origin/main
    const m = full.match(/^refs\/remotes\/(origin\/.+)$/);
    if (m) return m[1];
  }
  if (refExists('origin/main')) return 'origin/main';
  if (refExists('origin/master')) return 'origin/master';
  return '';
}

function detectBaseRef() {
  if (!isGitWorkTree()) return '';
  const hasHeadParent = refExists('HEAD~1');

  const defaultRef = defaultRemoteHeadRef();
  if (defaultRef) {
    const mb = git(['merge-base', 'HEAD', defaultRef]);
    const base = mb.status === 0 ? String(mb.stdout || '').trim() : '';
    if (base) return base;
    return defaultRef;
  }

  if (hasHeadParent) return 'HEAD~1';
  return '';
}

function collectDiff(base) {
  let cmd = ['diff', '--name-status', '--numstat'];
  if (base) cmd.push(`${base}..HEAD`);
  let r = git(cmd);
  if (r.status !== 0) return { files: [], entries: [] };
  const lines = r.stdout.split(/\r?\n/).filter(Boolean);
  const files = [];
  const entries = [];
  for (const line of lines) {
    // numstat lines have three fields: insertions deletions path
    const num = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
    if (num) {
      const ins = num[1] === '-' ? 0 : parseInt(num[1], 10);
      const del = num[2] === '-' ? 0 : parseInt(num[2], 10);
      const p = num[3];
      entries.push({ insertions: ins, deletions: del, path: p });
      continue;
    }
    const st = line.match(/^([ACDMRTUXB!?])\s+(.+)$/);
    if (st) files.push({ status: st[1], path: st[2] });
  }
  // Merge status into entries
  const byPath = new Map(entries.map(e => [e.path, e]));
  for (const f of files) {
    const ent = byPath.get(f.path) || { insertions: 0, deletions: 0, path: f.path };
    ent.status = f.status;
    byPath.set(f.path, ent);
  }
  return { files: Array.from(byPath.values()), entries: lines };
}

function globToRegex(pat) {
  if (!pat) return null;
  const escaped = pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function filterFiles(files, includes, excludes) {
  const incRegexes = (includes || []).map(globToRegex).filter(Boolean);
  const excRegexes = (excludes || []).map(globToRegex).filter(Boolean);
  return files.filter((f) => {
    const p = f.path || '';
    if (excRegexes.some((r) => r.test(p))) return false;
    if (incRegexes.length === 0) return true;
    return incRegexes.some((r) => r.test(p));
  });
}

function collectPatches(files, baseRef, mode, capPerFile = 20000, capTotal = 200000) {
  if (mode === 'summary') return [];
  let total = 0;
  const out = [];
  for (const f of files) {
    if (total >= capTotal) break;
    const rel = f.path;
    let content = '';
    let truncated = false;
    if (mode === 'patch') {
      const args = ['diff', '--unified=200'];
      if (baseRef) args.push(`${baseRef}..HEAD`);
      args.push('--', rel);
      const r = git(args);
      if (r.status === 0) content = r.stdout || '';
    } else if (mode === 'full') {
      try {
        content = fs.readFileSync(rel, 'utf8');
      } catch {
        content = '';
      }
    }
    if (content.length > capPerFile) {
      content = content.slice(0, capPerFile);
      truncated = true;
    }
    total += content.length;
    out.push({ path: rel, status: f.status || 'M', patch: content, truncated });
  }
  return out;
}

function readIfExists(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function buildCapsule() {
  const sources = [];
  const add = (label, file, maxLen = 4000) => {
    const body = readIfExists(file);
    if (!body) return;
    const trimmed = body.slice(0, maxLen);
    sources.push({ label, path: path.relative(root, file).replace(/\\/g, '/'), excerpt: trimmed });
  };
  add('AGENTS', path.join(root, 'AGENTS.md'), 8000);
  add('PLANS_README', path.join(root, 'docs', 'ops', 'plans', 'README.md'), 4000);
  add('ROOT_README', path.join(root, 'README.md'), 2000);
  const text = sources.map((s) => `# ${s.label}\n${s.excerpt}`).join('\n\n');
  return { text, sources };
}

function tailFile(filePath, maxBytes = 4000) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length <= maxBytes) return buf.toString('utf8');
    return buf.slice(buf.length - maxBytes).toString('utf8');
  } catch {
    return '';
  }
}

function collectTestEvidence(level) {
  const configured = String(process.env.PLAN_SUMMARY_LOGS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = ['npm-test.log', 'test.log'];
  const logNames = configured.length ? configured : defaults;
  const logs = logNames.map((n) => path.join(root, n)).filter((p) => fs.existsSync(p));
  if (level === 'none') {
    return { level, logs: [] };
  }
  const entries = logs.map((p) => ({
    path: path.relative(root, p).replace(/\\/g, '/'),
    tail: tailFile(p, level === 'logs' ? 4000 : 0)
  }));
  return { level, logs: entries };
}

function resolvePreset(preset) {
  const def = {
    preset: 'balanced',
    diff_mode: 'patch',
    patch_cap_per_file: 20000,
    patch_cap_total: 200000,
    tests_level: 'logs',
  };
  if (preset === 'preflight') {
    return { ...def, preset, diff_mode: 'summary', tests_level: 'none' };
  }
  if (preset === 'light') {
    return { ...def, preset, diff_mode: 'summary', tests_level: 'commands', patch_cap_per_file: 5000, patch_cap_total: 50000 };
  }
  if (preset === 'deep') {
    return { ...def, preset, diff_mode: 'patch', tests_level: 'logs', patch_cap_per_file: 50000, patch_cap_total: 400000 };
  }
  return def;
}

function parseFrontmatter(body) {
  const lines = body.split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== '---') return {};
  const data = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '---') break;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (m) data[m[1].trim()] = m[2].trim();
  }
  return data;
}

function extractAtAGlance(body) {
  const m = body.match(/At-a-Glance[\s\S]*?\n\n/);
  if (!m) return [];
  return m[0].split(/\r?\n/).filter(l => /^-\s/.test(l));
}

function extractChecklist(body) {
  const lines = body.split(/\r?\n/);
  const out = [];
  for (const l of lines) {
    const m = l.match(/^\-\s\[([ xX])\]\s(S\d{2})\b(.*)$/);
    if (m) out.push({ id: m[2], checked: /x/i.test(m[1]), text: m[3].trim() });
  }
  return out;
}

function checkOffS96(planPath) {
  let body = read(planPath);
  if (!body) return;
  const reUnchecked = /^- \[ \] S96\b.*$/m;
  const reChecked = /^- \[(x|X)\] S96\b.*$/m;
  if (reChecked.test(body)) return;
  if (reUnchecked.test(body)) {
    body = body.replace(reUnchecked, (s) => s.replace('[ ]', '[x]'));
    write(planPath, body);
    return;
  }
}

function main() {
  const args = parseArgs();
  const planId = args.plan || args._positionals[0];
  if (!planId) die('Usage: plans:summarize -- --plan PLAN-YYYYMM-<slug>');
  const baseOverride = args.base;
  const presetArg = args.preset;
  const diffModeArg = args['diff-mode'];
  const includeArg = args.include;
  const excludeArg = args.exclude;
  const testsArg = args.tests;
  const capPerFileArg = args['patch-cap'];
  const capTotalArg = args['patch-cap-total'];
  const planPath = path.join(plansDir, `${planId}.md`);
  if (!fs.existsSync(planPath)) die(`Plan not found: ${planPath}`);

  const preset = resolvePreset(presetArg);
  const diffMode = diffModeArg || preset.diff_mode;
  const testsLevel = testsArg || preset.tests_level;
  const patchCapPerFile = parseInt(capPerFileArg || preset.patch_cap_per_file, 10) || preset.patch_cap_per_file;
  const patchCapTotal = parseInt(capTotalArg || preset.patch_cap_total, 10) || preset.patch_cap_total;
  const includes = includeArg ? includeArg.split(',').filter(Boolean) : [];
  const excludes = excludeArg ? excludeArg.split(',').filter(Boolean) : [];

  const planBody = read(planPath);
  const fm = parseFrontmatter(planBody);
  const atAGlance = extractAtAGlance(planBody);
  const checklist = extractChecklist(planBody);

  const ts = nowTs();
  const sha = shortSha();
  const full = fullSha();
  const outDir = path.join(plansDir, 'review', planId, `${ts}-${sha}`);
  fs.mkdirSync(outDir, { recursive: true });

  const baseRefRaw = baseOverride || process.env.SUMMARY_BASE_REF || detectBaseRef();
  const baseRef = /^(worktree|none|local|unstaged)$/i.test(String(baseRefRaw || '').trim())
    ? ''
    : baseRefRaw;
  const diff = collectDiff(baseRef);
  const filteredFiles = filterFiles(diff.files, includes, excludes);
  const patches = collectPatches(filteredFiles, baseRef, diffMode, patchCapPerFile, patchCapTotal);
  const capsule = buildCapsule();
  const testsEvidence = collectTestEvidence(testsLevel);

  // Optionally run objectives-lint to capture current status (non-fatal)
  let objectivesStatus = 'unknown';
  try {
    const lint = spawnSync(process.execPath, [path.join('scripts', 'ops', 'objectives-lint.js')], { encoding: 'utf8' });
    objectivesStatus = lint.status === 0 ? 'ok' : 'violations';
  } catch {
    objectivesStatus = 'unavailable';
  }

  const summary = {
    plan_id: planId,
    timestamp_utc: ts,
    commit_sha: full,
    short_sha: sha,
    base_ref: baseRef,
    plan_meta: fm,
    at_a_glance: atAGlance,
    checklist,
    files: filteredFiles,
    diff_mode: diffMode,
    patches,
    capsule,
    tests_evidence: testsEvidence,
    changed_areas: {
      config: filteredFiles.filter(f => /^config\//.test(f.path)).length,
      scripts: filteredFiles.filter(f => /^scripts\//.test(f.path)).length,
      tests: filteredFiles.filter(f => /^tests\//.test(f.path) || /\.test\./.test(f.path)).length,
      docs: filteredFiles.filter(f => /^docs\//.test(f.path)).length,
    },
    evidence: {
      objectives_lint: objectivesStatus,
      logs: String(process.env.PLAN_SUMMARY_LOGS || '').trim()
        ? String(process.env.PLAN_SUMMARY_LOGS).split(',').map((s) => s.trim()).filter(Boolean)
        : ['npm-test.log', 'test.log'],
    },
  };

  const summaryJsonPath = path.join(outDir, 'summary.json');
  const summaryMdPath = path.join(outDir, 'summary.md');

  write(summaryJsonPath, JSON.stringify(summary, null, 2));

  const mdLines = [];
  mdLines.push(`# Plan Summary - ${planId}`);
  mdLines.push(`- Timestamp (UTC): ${ts}`);
  mdLines.push(`- Commit: ${full} (${sha})`);
  if (baseRef) mdLines.push(`- Base: ${baseRef}`);
  mdLines.push('');
  mdLines.push('## At-a-Glance');
  for (const l of atAGlance) mdLines.push(`- ${l.replace(/^[-]\s*/, '')}`);
  mdLines.push('');
  mdLines.push('## Checklist');
  for (const c of checklist) mdLines.push(`- [${c.checked ? 'x' : ' '}] ${c.id} ${c.text}`);
  mdLines.push('');
  mdLines.push('## Changes');
  for (const f of summary.files) {
    mdLines.push(`- ${f.status || 'M'} ${f.path} (+${f.insertions || 0}/-${f.deletions || 0})`);
  }
  mdLines.push('');
  mdLines.push('## Evidence');
  mdLines.push(`- Objectives Lint: ${objectivesStatus}`);
  mdLines.push(`- Logs: ${(summary.evidence.logs || []).join(', ')}`);
  mdLines.push(`- Diff Mode: ${diffMode}`);
  mdLines.push(`- Tests Evidence: ${testsLevel}`);

  write(summaryMdPath, mdLines.join('\n'));

  // Update pointer
  const latestPath = path.join(plansDir, 'review', planId, 'LATEST');
  write(latestPath, path.basename(outDir));

  // Check off S96
  checkOffS96(planPath);

  console.log(`[plan-summarize] Wrote ${summaryJsonPath}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  detectBaseRef,
  defaultRemoteHeadRef,
};
