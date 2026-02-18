'use strict';

const path = require('path');
const YAML = require('yaml');

const USER_BLOCK_BEGIN_RE = /baseline:user-block\s+([a-z0-9._-]+):begin\b/i;
const USER_BLOCK_END_RE = /baseline:user-block\s+([a-z0-9._-]+):end\b/i;

function normalizeText(value) {
  const text = String(value == null ? '' : value).replace(/\r\n/g, '\n');
  return text.endsWith('\n') ? text : `${text}\n`;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function stableYaml(value) {
  return YAML.stringify(value);
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch;
  }

  const out = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    if (isPlainObject(patchValue) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], patchValue);
      continue;
    }
    out[key] = patchValue;
  }
  return out;
}

function parseJsonSafe(value) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, value: null };
  }
}

function parseYamlSafe(value) {
  try {
    const parsed = YAML.parse(String(value || ''));
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, value: null };
  }
}

function extractUserBlocks(text) {
  const source = String(text || '').replace(/\r\n/g, '\n');
  const lines = source.split('\n');
  const blocks = new Map();

  for (let i = 0; i < lines.length; i += 1) {
    const begin = USER_BLOCK_BEGIN_RE.exec(lines[i] || '');
    if (!begin) continue;
    const blockId = String(begin[1] || '').toLowerCase();
    if (!blockId) continue;

    const captured = [lines[i]];
    let matchedEnd = false;
    for (let j = i + 1; j < lines.length; j += 1) {
      captured.push(lines[j]);
      const end = USER_BLOCK_END_RE.exec(lines[j] || '');
      if (end && String(end[1] || '').toLowerCase() === blockId) {
        matchedEnd = true;
        i = j;
        break;
      }
    }

    if (matchedEnd) {
      blocks.set(blockId, captured.join('\n'));
    }
  }

  return blocks;
}

function injectUserBlocks(templateText, sourceBlocks) {
  const blocks = sourceBlocks instanceof Map ? sourceBlocks : new Map();
  if (!blocks.size) {
    return normalizeText(templateText);
  }

  const lines = String(templateText || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const begin = USER_BLOCK_BEGIN_RE.exec(line || '');
    if (!begin) {
      out.push(line);
      continue;
    }

    const blockId = String(begin[1] || '').toLowerCase();
    const replacement = blocks.get(blockId);
    if (!replacement) {
      out.push(line);
      continue;
    }

    out.push(...String(replacement).split('\n'));
    for (let j = i + 1; j < lines.length; j += 1) {
      const end = USER_BLOCK_END_RE.exec(lines[j] || '');
      if (end && String(end[1] || '').toLowerCase() === blockId) {
        i = j;
        break;
      }
      if (j === lines.length - 1) {
        i = j;
      }
    }
  }

  return normalizeText(out.join('\n'));
}

function makeConflict({ current, next, filePath }) {
  const label = String(filePath || 'managed-file');
  return normalizeText([
    `<<<<<<< current (${label})`,
    String(current || '').replace(/\r\n/g, '\n').replace(/\n$/, ''),
    '=======',
    String(next || '').replace(/\r\n/g, '\n').replace(/\n$/, ''),
    '>>>>>>> baseline-generated',
    '',
  ].join('\n'));
}

function mergeThreeWay({ current, next, base, filePath }) {
  const curr = normalizeText(current || '');
  const nxt = normalizeText(next || '');
  const origin = normalizeText(base || '');
  if (curr === origin) return { content: nxt, conflicted: false };
  if (nxt === origin) return { content: curr, conflicted: false };
  if (curr === nxt) return { content: curr, conflicted: false };

  const ext = String(path.extname(filePath || '') || '').toLowerCase();
  if (ext === '.json') {
    const currentParsed = parseJsonSafe(curr);
    const nextParsed = parseJsonSafe(nxt);
    if (currentParsed.ok && nextParsed.ok) {
      return {
        content: stableJson(deepMerge(currentParsed.value, nextParsed.value)),
        conflicted: false,
      };
    }
  }
  if (ext === '.yml' || ext === '.yaml') {
    const currentParsed = parseYamlSafe(curr);
    const nextParsed = parseYamlSafe(nxt);
    if (currentParsed.ok && nextParsed.ok) {
      return {
        content: stableYaml(deepMerge(currentParsed.value || {}, nextParsed.value || {})),
        conflicted: false,
      };
    }
  }

  return {
    content: makeConflict({ current: curr, next: nxt, filePath }),
    conflicted: true,
  };
}

function mergeManagedContent({ strategy, current, next, base, filePath, preserveUserBlocks }) {
  const mode = String(strategy || 'replace').trim().toLowerCase();
  const currentText = String(current == null ? '' : current);
  const nextText = String(next == null ? '' : next);
  let merged = normalizeText(nextText);
  let conflicted = false;

  if (mode === 'json_merge') {
    const currentParsed = parseJsonSafe(currentText);
    const nextParsed = parseJsonSafe(nextText);
    if (!nextParsed.ok) {
      merged = normalizeText(nextText);
    } else if (!currentParsed.ok) {
      merged = stableJson(nextParsed.value);
    } else {
      merged = stableJson(deepMerge(currentParsed.value, nextParsed.value));
    }
  } else if (mode === 'yaml_merge') {
    const currentParsed = parseYamlSafe(currentText);
    const nextParsed = parseYamlSafe(nextText);
    if (!nextParsed.ok) {
      merged = normalizeText(nextText);
    } else if (!currentParsed.ok) {
      merged = stableYaml(nextParsed.value);
    } else {
      merged = stableYaml(deepMerge(currentParsed.value || {}, nextParsed.value || {}));
    }
  } else if (mode === 'three_way') {
    const mergedResult = mergeThreeWay({
      current: currentText,
      next: nextText,
      base,
      filePath,
    });
    merged = mergedResult.content;
    conflicted = mergedResult.conflicted;
  }

  if (preserveUserBlocks !== false) {
    merged = injectUserBlocks(merged, extractUserBlocks(currentText));
  } else {
    merged = normalizeText(merged);
  }

  return {
    content: merged,
    changed: normalizeText(currentText) !== merged,
    conflicted,
  };
}

module.exports = {
  deepMerge,
  extractUserBlocks,
  injectUserBlocks,
  mergeManagedContent,
  normalizeText,
};

