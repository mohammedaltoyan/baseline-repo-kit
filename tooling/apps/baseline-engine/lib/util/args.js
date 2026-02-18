'use strict';

function parseArgs(argv) {
  const list = Array.isArray(argv) ? argv : [];
  const out = { positionals: [] };

  for (let i = 0; i < list.length; i++) {
    const raw = String(list[i] || '').trim();
    if (!raw) continue;

    if (!raw.startsWith('--')) {
      out.positionals.push(raw);
      continue;
    }

    const token = raw.replace(/^--/, '');
    const eqIdx = token.indexOf('=');
    if (eqIdx >= 0) {
      const key = token.slice(0, eqIdx);
      const value = token.slice(eqIdx + 1);
      out[key] = value === '' ? '1' : value;
      continue;
    }

    const next = String(list[i + 1] || '').trim();
    if (!next || next.startsWith('--')) {
      out[token] = '1';
      continue;
    }

    out[token] = next;
    i += 1;
  }

  return out;
}

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

module.exports = {
  isTruthy,
  parseArgs,
};
