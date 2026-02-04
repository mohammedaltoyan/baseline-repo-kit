#!/usr/bin/env node
/**
 * plan-index.js
 * Generates docs/ops/plans/INDEX.md from canonical plans and FOCUS.json.
 */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const plansDir = path.join(root, 'docs', 'ops', 'plans');
const archiveDir = path.join(plansDir, 'archive');
const focusPath = path.join(plansDir, 'FOCUS.json');
const indexPath = path.join(plansDir, 'INDEX.md');

function read(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
function write(file, body) { fs.writeFileSync(file, body, 'utf8'); }

function parseFrontmatter(content) {
  if (!content) return {};
  const lines = content.split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== '---') return {};
  const data = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '---') break;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.+)\s*$/);
    if (m) {
      const key = m[1].trim();
      const rawVal = m[2].trim().replace(/^['"]|['"]$/g, '');
      // Strip inline YAML-style comments used in our templates, but only when
      // preceded by whitespace so values containing anchors (e.g. foo.md#bar)
      // remain intact.
      const val = rawVal.replace(/\s+#.*$/, '').trim();
      data[key] = val;
    }
  }
  return data;
}

function isCanonicalPlanFile(fileName) {
  return /^PLAN-\d{6}-[A-Za-z0-9_.-]+\.md$/.test(fileName);
}

function section(title) { return `\n## ${title}\n`; }

// Gather plans
const planFiles = (fs.existsSync(plansDir) ? fs.readdirSync(plansDir) : []).filter(isCanonicalPlanFile);
const plans = planFiles.map(f => {
  const body = read(path.join(plansDir, f));
  const fm = parseFrontmatter(body);
  fm.__file = f;
  return fm;
}).filter(Boolean);

// Focus
let focus = { updated: '', owners: [] };
try { focus = JSON.parse(read(focusPath) || '{}') || focus; } catch {}

// Categorize
const active = plans.filter(p => p.status === 'in_progress');
const queued = plans.filter(p => p.status === 'queued');
const drafts = plans.filter(p => p.status === 'draft');
const holds = plans.filter(p => p.status === 'on_hold');
const blocked = plans.filter(p => p.status === 'blocked');
const done = plans.filter(p => p.status === 'done');
const canceled = plans.filter(p => p.status === 'canceled');
const superseded = plans.filter(p => p.status === 'superseded');

// Sort helpers
const prioRank = p => ({ P0: 0, P1: 1, P2: 2, P3: 3 }[p.priority] ?? 2);
active.sort((a, b) => prioRank(a) - prioRank(b) || (b.updated || '').localeCompare(a.updated || ''));
queued.sort((a, b) => prioRank(a) - prioRank(b) || (a.target_window || '').localeCompare(b.target_window || ''));
done.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
canceled.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
superseded.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));

let out = '';
out += '# Plans Dashboard\n\n';
out += '> GENERATED FILE - DO NOT EDIT. Run `npm run plans:index`.\n\n';

// Focus Today
out += section('Focus Today');
if (Array.isArray(focus.owners) && focus.owners.length > 0) {
  for (const f of focus.owners) {
    const pid = f.plan_id || '';
    const step = f.current_step || '';
    const owner = f.owner || '';
    const p = plans.find(x => x.plan_id === pid);
    const title = p ? p.title : '(unknown)';
    const updated = p && p.updated ? ` - updated: ${p.updated}` : '';
    out += `- ${owner}: ${pid} - ${title} - ${step}${updated}\n`;
  }
} else {
  out += '- (none set - update FOCUS.json)\n';
}

// Active
out += section('Active');
if (active.length === 0) {
  out += '- (none)\n';
} else {
  for (const p of active) {
    out += `- ${p.plan_id} - ${p.title} - owner: ${p.owner} - step: ${p.current_step} - updated: ${p.updated}\n`;
  }
}

// Queued
out += section('Queued');
if (queued.length === 0) {
  out += '- (none)\n';
} else {
  for (const p of queued) {
    out += `- ${p.plan_id} - ${p.title} - owner: ${p.owner} - priority: ${p.priority} - window: ${p.target_window}\n`;
  }
}

// Draft / On Hold / Blocked
out += section('Draft / On Hold / Blocked');
const others = [...drafts, ...holds, ...blocked];
if (others.length === 0) {
  out += '- (none)\n';
} else {
  for (const p of others) {
    out += `- ${p.plan_id} - ${p.title} - status: ${p.status} - owner: ${p.owner || '(tbd)'}\n`;
  }
}

// Done (needs archive)
out += section('Done (Needs Archive)');
if (done.length === 0) {
  out += '- (none)\n';
} else {
  out += '- Run `npm run plans:archive -- --plan <id> --status done` (or let auto-archive run post-merge).\n';
  out += '- Bulk: `npm run plans:archive:backlog` (skips plans referenced by open PRs).\n';
  for (const p of done) {
    out += `- ${p.plan_id} - ${p.title} - owner: ${p.owner || '(tbd)'} - updated: ${p.updated}\n`;
  }
}

// Canceled / Superseded (needs archive)
out += section('Canceled / Superseded (Needs Archive)');
const needsArchive = [...canceled, ...superseded];
if (needsArchive.length === 0) {
  out += '- (none)\n';
} else {
  out += '- Archive these plans to keep the active folder signal-only.\n';
  for (const p of needsArchive) {
    out += `- ${p.plan_id} - ${p.title} - status: ${p.status} - owner: ${p.owner || '(tbd)'} - updated: ${p.updated}\n`;
  }
}

// Archive summary (keep INDEX deterministic and conflict-light)
out += section('Archive');
const archList = (fs.existsSync(archiveDir) ? fs.readdirSync(archiveDir) : []).filter(isCanonicalPlanFile);
out += `- Archived plans: ${archList.length}\n`;
out += '- Browse `docs/ops/plans/archive/` for details.\n';

write(indexPath, out);
console.log(`[plan-index] Wrote ${indexPath}`);

