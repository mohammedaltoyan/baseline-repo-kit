'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { buildContext, resolveTargetRoot } = require('../context');
const { runApply } = require('./apply');
const { runDiff } = require('./diff');
const { runDoctor } = require('./doctor');
const { runInit } = require('./init');
const { runUpgrade } = require('./upgrade');
const { runVerify } = require('./verify');
const { buildInsights } = require('../insights');
const { normalizeDynamicConfig } = require('../policy/normalization');
const { loadSchema, loadUiMetadata, validateConfig } = require('../schema');
const { isTruthy } = require('../util/args');
const { UI_APP_DIR } = require('../constants');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const REQUEST_BODY_LIMIT = 1024 * 1024;

function createHttpError(statusCode, message) {
  const error = new Error(String(message || 'request_failed'));
  error.statusCode = Number(statusCode) || 500;
  return error;
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', (chunk) => {
      chunks += String(chunk || '');
      if (chunks.length > REQUEST_BODY_LIMIT) {
        reject(createHttpError(413, 'request_body_too_large'));
      }
    });
    req.on('end', () => resolve(chunks));
    req.on('error', reject);
  });
}

async function parseJsonBody(req) {
  const raw = await readRequestBody(req);
  if (!raw.trim()) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw createHttpError(400, 'invalid_json_body');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw createHttpError(400, 'invalid_json_body_type');
  }
  return parsed;
}

function parseRequestUrl(req) {
  return new URL(String(req.url || '/'), 'http://baseline-ui.local');
}

function toAbsoluteTarget(value) {
  const raw = String(value || '').trim();
  return raw ? path.resolve(process.cwd(), raw) : process.cwd();
}

function buildRuntimeSession(args = {}) {
  const inputTarget = String(args.target || args.to || args.t || '').trim();
  const resolvedTarget = resolveTargetRoot(args);
  return {
    target_input: inputTarget || resolvedTarget,
    target: resolvedTarget,
    profile: String(args.profile || '').trim(),
    host: String(args.host || process.env.BASELINE_UI_HOST || '0.0.0.0').trim(),
    port: Number(args.port || process.env.BASELINE_UI_PORT || 4173),
  };
}

function targetStatus(targetRoot) {
  const resolved = toAbsoluteTarget(targetRoot);
  const out = {
    resolved_target: resolved,
    exists: false,
    is_directory: false,
    writable: false,
    parent_writable: false,
    reason: '',
  };

  try {
    const stat = fs.statSync(resolved);
    out.exists = true;
    out.is_directory = stat.isDirectory();
  } catch {
    out.exists = false;
  }

  const probe = out.exists ? resolved : path.dirname(resolved);
  try {
    fs.accessSync(probe, fs.constants.W_OK);
    out.parent_writable = true;
  } catch {
    out.parent_writable = false;
  }

  if (out.exists && out.is_directory) {
    try {
      fs.accessSync(resolved, fs.constants.W_OK);
      out.writable = true;
    } catch {
      out.writable = false;
    }
  } else if (!out.exists) {
    out.writable = out.parent_writable;
  }

  if (out.exists && !out.is_directory) {
    out.reason = 'target_exists_but_not_directory';
  } else if (!out.writable) {
    out.reason = 'target_not_writable';
  } else {
    out.reason = 'ok';
  }

  return out;
}

function boolArg(value) {
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return value ? '1' : '0';
  return isTruthy(value) ? '1' : '0';
}

function createEngineArgs(baseArgs, runtime, body = {}) {
  const out = {
    ...baseArgs,
    target: runtime.target,
  };

  if (runtime.profile) out.profile = runtime.profile;

  if (Object.prototype.hasOwnProperty.call(body, 'dry_run') || Object.prototype.hasOwnProperty.call(body, 'dryRun')) {
    out['dry-run'] = boolArg(
      Object.prototype.hasOwnProperty.call(body, 'dry_run') ? body.dry_run : body.dryRun
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'direct')
    || Object.prototype.hasOwnProperty.call(body, 'apply_direct')
    || Object.prototype.hasOwnProperty.call(body, 'applyDirect')
  ) {
    const directValue = Object.prototype.hasOwnProperty.call(body, 'direct')
      ? body.direct
      : Object.prototype.hasOwnProperty.call(body, 'apply_direct')
        ? body.apply_direct
        : body.applyDirect;
    out.direct = boolArg(directValue);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'target_version') || Object.prototype.hasOwnProperty.call(body, 'targetVersion')) {
    const version = String(
      Object.prototype.hasOwnProperty.call(body, 'target_version') ? body.target_version : body.targetVersion
    ).trim();
    if (version) out['target-version'] = version;
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'refresh_capabilities')
    || Object.prototype.hasOwnProperty.call(body, 'refreshCapabilities')
  ) {
    const refreshValue = Object.prototype.hasOwnProperty.call(body, 'refresh_capabilities')
      ? body.refresh_capabilities
      : body.refreshCapabilities;
    out['refresh-capabilities'] = boolArg(refreshValue);
  }

  return out;
}

async function currentState(engineArgs) {
  const context = await buildContext(engineArgs);
  const insights = buildInsights({
    config: context.config,
    capabilities: context.capabilities,
    moduleEvaluation: context.moduleEvaluation,
  });
  return {
    target: context.targetRoot,
    engine_version: context.engineVersion,
    schema: loadSchema(),
    ui_metadata: loadUiMetadata(),
    config: context.config,
    effective_config: insights && insights.effective_settings ? insights.effective_settings.config : context.config,
    effective_overrides: insights && insights.effective_settings ? insights.effective_settings.overrides : [],
    capabilities: context.capabilities,
    changes: context.changes,
    modules: context.modules,
    module_evaluation: context.moduleEvaluation,
    insights,
    warnings: context.warnings || [],
  };
}

function serveStatic(req, res) {
  const url = parseRequestUrl(req);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const full = path.join(UI_APP_DIR, pathname.replace(/^\/+/, ''));
  const safeRoot = path.resolve(UI_APP_DIR);
  const safePath = path.resolve(full);

  if (!safePath.startsWith(safeRoot)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(safePath) || !fs.statSync(safePath).isFile()) {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  const ext = path.extname(safePath);
  res.statusCode = 200;
  res.setHeader('Content-Type', CONTENT_TYPES[ext] || 'text/plain; charset=utf-8');
  fs.createReadStream(safePath).pipe(res);
}

function operationsCatalog() {
  return [
    { id: 'init', method: 'POST', path: '/api/init', description: 'Initialize baseline files for current target.' },
    { id: 'diff', method: 'POST', path: '/api/diff', description: 'Preview generated managed-file changes.' },
    { id: 'doctor', method: 'POST', path: '/api/doctor', description: 'Validate config and capability compatibility.' },
    { id: 'verify', method: 'POST', path: '/api/verify', description: 'Run doctor + diff integrity checks.' },
    { id: 'apply', method: 'POST', path: '/api/apply', description: 'Apply generated changes (PR-first unless direct).', options: ['dry_run', 'direct'] },
    { id: 'upgrade', method: 'POST', path: '/api/upgrade', description: 'Run migrations and apply managed updates.', options: ['dry_run', 'target_version'] },
    { id: 'refresh_capabilities', method: 'POST', path: '/api/refresh-capabilities', description: 'Re-probe GitHub capabilities and refresh runtime state.' },
    { id: 'save_config', method: 'POST', path: '/api/config', description: 'Persist normalized config from UI edits.' },
    { id: 'session', method: 'POST', path: '/api/session', description: 'Set target path/profile for UI operations.' },
  ];
}

async function startUiServer(args = {}) {
  const runtime = buildRuntimeSession(args);
  const requestedPort = Number(runtime.port);
  const listenPort = Number.isFinite(requestedPort) && requestedPort >= 0 ? requestedPort : 4173;
  // objectives:allow LOCALHOST Justification: UI server default host uses all interfaces and tests may use loopback resolution.
  const listenHost = String(runtime.host || '0.0.0.0').trim() || '0.0.0.0';

  const server = http.createServer(async (req, res) => {
    try {
      const url = parseRequestUrl(req);
      const pathname = url.pathname;

      if (pathname === '/api/session' && req.method === 'GET') {
        return sendJson(res, 200, {
          session: runtime,
          target_status: targetStatus(runtime.target),
        });
      }

      if (pathname === '/api/session' && req.method === 'POST') {
        const body = await parseJsonBody(req);

        if (Object.prototype.hasOwnProperty.call(body, 'target')) {
          const targetValue = String(body.target || '').trim();
          runtime.target_input = targetValue || runtime.target_input;
          runtime.target = toAbsoluteTarget(targetValue || runtime.target_input);
        }

        if (Object.prototype.hasOwnProperty.call(body, 'profile')) {
          runtime.profile = String(body.profile || '').trim();
        }

        return sendJson(res, 200, {
          ok: true,
          session: runtime,
          target_status: targetStatus(runtime.target),
        });
      }

      if (pathname === '/api/operations' && req.method === 'GET') {
        return sendJson(res, 200, {
          operations: operationsCatalog(),
        });
      }

      if (pathname === '/api/state' && req.method === 'GET') {
        const engineArgs = createEngineArgs(
          args,
          runtime,
          { refresh_capabilities: url.searchParams.get('refresh_capabilities') === '1' }
        );
        const payload = await currentState(engineArgs);
        return sendJson(res, 200, payload);
      }

      if (pathname === '/api/refresh-capabilities' && req.method === 'POST') {
        const payload = await currentState(createEngineArgs(args, runtime, { refresh_capabilities: true }));
        return sendJson(res, 200, payload);
      }

      if (pathname === '/api/init' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const result = await runInit({
          ...createEngineArgs(args, runtime, body),
          json: '1',
          silent: '1',
        });
        return sendJson(res, 200, result);
      }

      if (pathname === '/api/diff' && req.method === 'POST') {
        const result = await runDiff({
          ...createEngineArgs(args, runtime, {}),
          json: '1',
          silent: '1',
        });
        return sendJson(res, 200, result);
      }

      if (pathname === '/api/doctor' && req.method === 'POST') {
        const result = await runDoctor({
          ...createEngineArgs(args, runtime, {}),
          json: '1',
          silent: '1',
        });
        return sendJson(res, 200, result);
      }

      if (pathname === '/api/verify' && req.method === 'POST') {
        const result = await runVerify({
          ...createEngineArgs(args, runtime, {}),
          json: '1',
          silent: '1',
        });
        return sendJson(res, 200, result);
      }

      if (pathname === '/api/apply' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const result = await runApply({
          ...createEngineArgs(args, runtime, body),
          json: '1',
          silent: '1',
        });
        return sendJson(res, 200, result);
      }

      if (pathname === '/api/upgrade' && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const result = await runUpgrade({
          ...createEngineArgs(args, runtime, body),
          json: '1',
          silent: '1',
        });
        return sendJson(res, 200, result);
      }

      if (pathname === '/api/config' && req.method === 'POST') {
        const parsed = await parseJsonBody(req);
        const normalized = normalizeDynamicConfig(parsed.config || {}).config;
        validateConfig(normalized);

        const context = await buildContext(createEngineArgs(args, runtime, {}));
        context.config = normalized;
        context.saveConfigArtifacts({
          targetRoot: context.targetRoot,
          config: context.config,
          state: context.state,
          capabilities: context.capabilities,
        });

        return sendJson(res, 200, { ok: true });
      }

      if (pathname.startsWith('/api/')) {
        return sendJson(res, 404, { error: 'unknown_endpoint' });
      }

      serveStatic(req, res);
    } catch (error) {
      const statusCode = Number(error && error.statusCode) || 500;
      return sendJson(res, statusCode, {
        error: String(error && error.message || error),
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, listenHost, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = address && typeof address === 'object' ? Number(address.port) : listenPort;
  const actualHost = listenHost;

  return {
    server,
    host: actualHost,
    port: actualPort,
    runtime,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) return reject(error);
          return resolve();
        });
      });
    },
  };
}

async function runUi(args) {
  const runtime = await startUiServer(args);
  process.stdout.write(`[baseline-engine] UI running at http://${runtime.host}:${runtime.port}\n`);
  return runtime;
}

module.exports = {
  currentState,
  runUi,
  startUiServer,
  targetStatus,
};
