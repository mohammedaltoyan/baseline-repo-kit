'use strict';
const { stripBom } = require('../../utils/json');

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitLines(body) {
  return String(body || '').split(/\r?\n/);
}

function findFrontmatterRange(lines) {
  const arr = Array.isArray(lines) ? lines : [];
  if (!arr.length) return null;
  const first = stripBom(String(arr[0] || '')).trim();
  if (first !== '---') return null;
  for (let i = 1; i < arr.length; i++) {
    if (String(arr[i] || '').trim() === '---') return { start: 0, end: i };
  }
  return null;
}

function formatKeyLine(key, value) {
  const k = String(key || '').trim();
  if (!k) return '';
  const v = value == null ? '' : String(value);
  return v === '' ? `${k}:` : `${k}: ${v}`;
}

function setTopLevelKey(lines, fmEndIndex, key, value, opts = {}) {
  const k = String(key || '').trim();
  if (!k) return;

  const reLine = new RegExp(`^${escapeRegExp(k)}\\s*:\\s*(.*)$`);
  for (let i = 1; i < fmEndIndex; i++) {
    const line = String(lines[i] || '');
    if (!reLine.test(line)) continue;

    if (opts.preserveComment) {
      const m = new RegExp(`^${escapeRegExp(k)}\\s*:\\s*(.*?)\\s*(#.*)?$`).exec(line);
      const comment = m && m[2] ? String(m[2]).trim() : '';
      const v = value == null ? '' : String(value);
      if (v === '') {
        lines[i] = `${k}:${comment ? ` ${comment}` : ''}`;
      } else {
        lines[i] = `${k}: ${v}${comment ? ` ${comment}` : ''}`;
      }
      return;
    }

    lines[i] = formatKeyLine(k, value);
    return;
  }

  // Insert new key before the closing delimiter, optionally after another key.
  let insertAt = fmEndIndex;
  if (opts.insertAfterKey) {
    const after = String(opts.insertAfterKey || '').trim();
    if (after) {
      const reAfter = new RegExp(`^${escapeRegExp(after)}\\s*:`);
      for (let i = 1; i < fmEndIndex; i++) {
        if (reAfter.test(String(lines[i] || ''))) {
          insertAt = i + 1;
          break;
        }
      }
    }
  }

  lines.splice(insertAt, 0, formatKeyLine(k, value));
}

function updateFrontmatter(body, updates = {}, opts = {}) {
  const lines = splitLines(body);
  const range = findFrontmatterRange(lines);
  if (!range) return String(body || '');

  const preserveCommentKeys = new Set(
    Array.isArray(opts.preserveCommentKeys) ? opts.preserveCommentKeys.map(String) : []
  );
  const insertAfter = (opts && typeof opts.insertAfter === 'object' && opts.insertAfter) ? opts.insertAfter : {};

  for (const [key, value] of Object.entries(updates || {})) {
    if (value === undefined) continue;
    setTopLevelKey(lines, range.end, key, value, {
      preserveComment: preserveCommentKeys.has(key),
      insertAfterKey: insertAfter[key],
    });
  }

  return lines.join('\n');
}

function readFrontmatterTopLevel(body) {
  const lines = splitLines(body);
  const range = findFrontmatterRange(lines);
  if (!range) return {};

  const out = {};
  for (let i = 1; i < range.end; i++) {
    const line = String(lines[i] || '');
    if (!line || /^\s/.test(line)) continue; // ignore nested keys/blocks
    const m = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (m) out[String(m[1] || '').trim()] = String(m[2] || '').trim();
  }
  return out;
}

module.exports = {
  findFrontmatterRange,
  formatKeyLine,
  readFrontmatterTopLevel,
  updateFrontmatter,
};
