'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { resolveFrontendConfig } = require('../../packages/shared/app-stack-contract');

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function createLogger(baseLogger) {
  const sink = baseLogger && typeof baseLogger.info === 'function' ? baseLogger : console;
  return {
    info(message, context) {
      sink.info(JSON.stringify({ level: 'info', message, ...(context || {}) }));
    },
    error(message, context) {
      if (typeof sink.error === 'function') {
        sink.error(JSON.stringify({ level: 'error', message, ...(context || {}) }));
        return;
      }
      sink.info(JSON.stringify({ level: 'error', message, ...(context || {}) }));
    },
  };
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendRuntimeConfig(res, config) {
  const body = `window.__BASELINE_FRONTEND_CONFIG__ = ${JSON.stringify({
    backendBaseUrl: config.backendBaseUrl,
    contractPath: config.contractPath,
    requestTimeoutMs: config.requestTimeoutMs,
  }, null, 2)};\n`;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.end(body);
}

function resolveStaticFile({ staticRoot, urlPathname }) {
  const normalized = urlPathname === '/' ? '/index.html' : urlPathname;
  const withNoQuery = normalized.split('?')[0].split('#')[0];
  const candidate = path.join(staticRoot, withNoQuery.replace(/^\/+/, ''));
  const safeRoot = path.resolve(staticRoot);
  const safePath = path.resolve(candidate);
  if (!safePath.startsWith(safeRoot)) return '';
  return safePath;
}

function createRequestHandler({ staticRoot, config, logger }) {
  return function requestHandler(req, res) {
    try {
      const pathname = String(req.url || '/').split('?')[0].split('#')[0];

      if (req.method === 'GET' && pathname === '/health') {
        return sendJson(res, 200, {
          status: 'ok',
          app: 'baseline-frontend',
          backend_base_url: config.backendBaseUrl,
        });
      }

      if (req.method === 'GET' && pathname === '/runtime-config.js') {
        return sendRuntimeConfig(res, config);
      }

      const filePath = resolveStaticFile({ staticRoot, urlPathname: pathname });
      if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return sendJson(res, 404, { error: { code: 'not_found', message: `Not found: ${pathname}` } });
      }

      const ext = path.extname(filePath).toLowerCase();
      res.statusCode = 200;
      res.setHeader('Content-Type', CONTENT_TYPES[ext] || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      logger.error('frontend_request_failed', {
        path: req.url || '/',
        error: String(error && error.stack ? error.stack : error),
      });
      sendJson(res, 500, { error: { code: 'internal_error', message: 'Unexpected server error' } });
    }
  };
}

function listen(server, { host, port }) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function startFrontendServer(options = {}) {
  const env = options.env && typeof options.env === 'object' ? options.env : process.env;
  const config = resolveFrontendConfig(env);
  const logger = createLogger(options.logger);
  const staticRoot = path.resolve(
    options.staticRoot || process.env.FRONTEND_STATIC_DIR || path.join(__dirname)
  );
  const server = http.createServer(createRequestHandler({ staticRoot, config, logger }));
  await listen(server, { host: config.host, port: config.port });
  const address = server.address();

  logger.info('frontend_server_started', {
    host: config.host,
    port: address && typeof address === 'object' ? address.port : config.port,
    backend_base_url: config.backendBaseUrl,
  });

  return {
    server,
    config,
    address,
    async stop() {
      await closeServer(server);
      logger.info('frontend_server_stopped', {});
    },
  };
}

function installSignalHandlers(runtime, options = {}) {
  const logger = createLogger(options.logger);
  const signals = Array.isArray(options.signals) && options.signals.length
    ? options.signals
    : ['SIGINT', 'SIGTERM'];
  let stopping = false;

  async function onSignal(signal) {
    if (stopping) return;
    stopping = true;
    logger.info('frontend_server_shutdown_signal', { signal });
    try {
      await runtime.stop();
      process.exitCode = 0;
    } catch (error) {
      logger.error('frontend_server_shutdown_failed', {
        signal,
        error: String(error && error.stack ? error.stack : error),
      });
      process.exitCode = 1;
    } finally {
      for (const entry of signals) {
        process.removeListener(entry, onSignal);
      }
    }
  }

  for (const signal of signals) {
    process.on(signal, onSignal);
  }
}

async function main() {
  const runtime = await startFrontendServer();
  installSignalHandlers(runtime);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[frontend] startup failed: ${String(error && error.stack ? error.stack : error)}\n`);
    process.exit(1);
  });
}

module.exports = {
  createRequestHandler,
  startFrontendServer,
  installSignalHandlers,
  main,
};
