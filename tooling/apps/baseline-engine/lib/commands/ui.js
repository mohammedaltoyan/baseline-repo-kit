'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { buildContext } = require('../context');
const { runApply } = require('./apply');
const { runDiff } = require('./diff');
const { runDoctor } = require('./doctor');
const { buildInsights } = require('../insights');
const { normalizeDynamicConfig } = require('../policy/normalization');
const { loadSchema, loadUiMetadata, validateConfig } = require('../schema');
const { UI_APP_DIR } = require('../constants');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

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
      if (chunks.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => resolve(chunks));
    req.on('error', reject);
  });
}

async function currentState(args) {
  const context = await buildContext(args);
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
  const rawPath = req.url === '/' ? '/index.html' : req.url;
  const clean = rawPath.split('?')[0].split('#')[0];
  const full = path.join(UI_APP_DIR, clean.replace(/^\/+/, ''));
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

async function runUi(args) {
  const port = Number(args && (args.port || process.env.BASELINE_UI_PORT || 4173));
  const host = String(args && (args.host || process.env.BASELINE_UI_HOST || '0.0.0.0')).trim();

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/api/state' && req.method === 'GET') {
        const payload = await currentState(args);
        return sendJson(res, 200, payload);
      }

      if (req.url === '/api/diff' && req.method === 'POST') {
        const result = await runDiff({ ...args, json: '1', silent: '1' });
        return sendJson(res, 200, result);
      }

      if (req.url === '/api/doctor' && req.method === 'POST') {
        const result = await runDoctor({ ...args, json: '1', silent: '1' });
        return sendJson(res, 200, result);
      }

      if (req.url === '/api/apply' && req.method === 'POST') {
        const bodyRaw = await readRequestBody(req);
        let body = {};
        if (bodyRaw.trim()) body = JSON.parse(bodyRaw);
        const result = await runApply({
          ...args,
          ...body,
          json: '1',
          silent: '1',
        });
        return sendJson(res, 200, result);
      }

      if (req.url === '/api/config' && req.method === 'POST') {
        const bodyRaw = await readRequestBody(req);
        const parsed = JSON.parse(bodyRaw || '{}');
        const normalized = normalizeDynamicConfig(parsed.config || {}).config;
        validateConfig(normalized);

        const context = await buildContext(args);
        context.config = normalized;
        context.saveConfigArtifacts({
          targetRoot: context.targetRoot,
          config: context.config,
          state: context.state,
          capabilities: context.capabilities,
        });

        return sendJson(res, 200, { ok: true });
      }

      if (req.url.startsWith('/api/')) {
        return sendJson(res, 404, { error: 'unknown_endpoint' });
      }

      serveStatic(req, res);
    } catch (error) {
      return sendJson(res, 500, {
        error: String(error && error.message || error),
      });
    }
  });

  await new Promise((resolve) => {
    server.listen(port, host, resolve);
  });

  process.stdout.write(`[baseline-engine] UI running at http://${host}:${port}\n`);
}

module.exports = {
  runUi,
};
