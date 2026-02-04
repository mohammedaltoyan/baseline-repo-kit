function parseFlagArgs(argv = []) {
  const out = { _: [] };
  const args = Array.isArray(argv) ? argv : [];

  for (let i = 0; i < args.length; i += 1) {
    const token = String(args[i] ?? '').trim();
    if (!token) continue;

    if (token === '--') {
      out._.push(...args.slice(i + 1));
      break;
    }

    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq !== -1) {
        const key = token.slice(2, eq);
        const value = token.slice(eq + 1);
        out[key] = value === '' ? '1' : value;
        continue;
      }

      const key = token.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !String(next).startsWith('-')) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = '1';
      }
      continue;
    }

    if (token.startsWith('-') && token.length > 1) {
      const eq = token.indexOf('=');
      if (eq !== -1) {
        const key = token.slice(1, eq);
        const value = token.slice(eq + 1);
        out[key] = value === '' ? '1' : value;
        continue;
      }

      const key = token.slice(1);
      const next = args[i + 1];
      if (next !== undefined && !String(next).startsWith('-')) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = '1';
      }
      continue;
    }

    out._.push(token);
  }

  return out;
}

module.exports = { parseFlagArgs };

