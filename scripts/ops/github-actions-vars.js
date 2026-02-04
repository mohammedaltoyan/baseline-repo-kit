#!/usr/bin/env node
/**
 * github-actions-vars.js
 *
 * Minimal shared helper for managing GitHub Actions repository variables.
 * SSOT for variable upsert/delete logic (avoid duplicating API snippets across scripts).
 */
/* eslint-disable no-console */
const https = require('https');
const { spawnSync } = require('child_process');

function toBool(v, fallback) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (!s) return fallback;
  if (s === '1' || s === 'true' || s === 'yes' || s === 'y') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'n') return false;
  return fallback;
}

function autoDetectRepo() {
  const repoFull = String(process.env.GITHUB_REPOSITORY || '').trim();
  if (repoFull.includes('/')) {
    const [owner, repo] = repoFull.split('/', 2);
    if (owner && repo) return { owner, repo };
  }

  const res = spawnSync('git', ['config', '--get', 'remote.origin.url'], { encoding: 'utf8' });
  if (res.status !== 0) return { owner: '', repo: '' };
  const url = String(res.stdout || '').trim();
  if (!url) return { owner: '', repo: '' };

  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

  const sshMatch = url.match(/github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  return { owner: '', repo: '' };
}

function request(method, apiPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const req = https.request(
      {
        hostname: 'api.github.com',
        port: 443,
        method,
        path: apiPath,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'baseline-kit-actions-vars',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode || 0, body: buf }));
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function is404(resp) {
  return resp && typeof resp.status === 'number' && resp.status === 404;
}

async function deleteVar({ owner, repo, name, token, dryRun }) {
  const apiPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/variables/${encodeURIComponent(name)}`;
  if (dryRun) {
    console.log(`[actions-vars] (dry-run) delete variable ${name}`);
    return { ok: true, action: 'delete', name, mode: 'dry-run' };
  }
  const res = await request('DELETE', apiPath, null, token);
  if (res.status === 204) {
    console.log(`[actions-vars] Deleted variable ${name}`);
    return { ok: true, action: 'delete', name, mode: 'deleted' };
  }
  if (is404(res)) {
    console.log(`[actions-vars] Variable ${name} already absent`);
    return { ok: true, action: 'delete', name, mode: 'absent' };
  }
  throw new Error(`DELETE ${name} -> ${res.status}: ${res.body}`);
}

async function upsertVar({ owner, repo, name, value, token, dryRun }) {
  const apiPathBase = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/variables`;
  const apiPath = `${apiPathBase}/${encodeURIComponent(name)}`;

  if (dryRun) {
    console.log(`[actions-vars] (dry-run) set variable ${name}=${value}`);
    return { ok: true, action: 'upsert', name, mode: 'dry-run' };
  }

  const patch = await request('PATCH', apiPath, { name, value }, token);
  if (patch.status >= 200 && patch.status < 300) {
    console.log(`[actions-vars] Updated variable ${name}`);
    return { ok: true, action: 'upsert', name, mode: 'updated' };
  }

  if (!is404(patch)) {
    throw new Error(`PATCH ${name} -> ${patch.status}: ${patch.body}`);
  }

  const created = await request('POST', apiPathBase, { name, value }, token);
  if (created.status >= 200 && created.status < 300) {
    console.log(`[actions-vars] Created variable ${name}`);
    return { ok: true, action: 'upsert', name, mode: 'created' };
  }
  throw new Error(`POST ${name} -> ${created.status}: ${created.body}`);
}

module.exports = {
  toBool,
  autoDetectRepo,
  request,
  is404,
  deleteVar,
  upsertVar,
};
