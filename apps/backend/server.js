'use strict';

const http = require('http');
const crypto = require('crypto');
const {
  buildAppStackContract,
  buildOpenApiDocument,
  buildRuntimeSettingsCatalog,
  resolveBackendConfig,
  resolveFrontendConfig,
} = require('../../packages/shared/app-stack-contract');

function createHttpError(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details && typeof details === 'object') error.details = details;
  return error;
}

function appendVary(res, token) {
  const current = String(res.getHeader('Vary') || '').trim();
  if (!current) {
    res.setHeader('Vary', token);
    return;
  }
  const entries = current.split(',').map((part) => part.trim().toLowerCase());
  if (!entries.includes(String(token).toLowerCase())) {
    res.setHeader('Vary', `${current}, ${token}`);
  }
}

function escapeRegex(source) {
  return String(source || '').replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function wildcardToRegex(pattern) {
  if (!pattern.includes('*')) return null;
  const escaped = escapeRegex(pattern).replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function originAllowed(origin, allowedOrigins) {
  if (!origin) return { allowed: true, headerValue: '' };
  const rules = Array.isArray(allowedOrigins) ? allowedOrigins : [];
  if (!rules.length) return { allowed: false, headerValue: '' };

  for (const ruleRaw of rules) {
    const rule = String(ruleRaw || '').trim();
    if (!rule) continue;
    if (rule === '*') return { allowed: true, headerValue: '*' };
    if (rule === origin) return { allowed: true, headerValue: origin };
    const regex = wildcardToRegex(rule);
    if (regex && regex.test(origin)) return { allowed: true, headerValue: origin };
  }

  return { allowed: false, headerValue: '' };
}

function applyCorsHeaders({ req, res, config }) {
  const origin = String(req.headers.origin || '').trim();
  const evaluation = originAllowed(origin, config.cors.allowedOrigins);

  if (origin) {
    appendVary(res, 'Origin');
  }

  if (!evaluation.allowed) {
    return { allowed: false, origin, headerValue: '' };
  }

  if (origin) {
    const headerValue = config.cors.allowCredentials && evaluation.headerValue === '*'
      ? origin
      : evaluation.headerValue;
    if (headerValue) {
      res.setHeader('Access-Control-Allow-Origin', headerValue);
    }
    if (config.cors.allowCredentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }

  res.setHeader('Access-Control-Allow-Methods', config.cors.allowedMethods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', config.cors.allowedHeaders.join(', '));
  res.setHeader('Access-Control-Max-Age', String(config.cors.maxAgeSeconds));
  return { allowed: true, origin, headerValue: String(res.getHeader('Access-Control-Allow-Origin') || '') };
}

function readJsonBody(req, { maxBodyBytes, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    const timer = setTimeout(() => {
      reject(createHttpError(408, 'request_timeout', 'Request body timed out'));
    }, timeoutMs);

    function done(err, value) {
      clearTimeout(timer);
      req.removeAllListeners('data');
      req.removeAllListeners('end');
      req.removeAllListeners('error');
      if (err) {
        reject(err);
        return;
      }
      resolve(value);
    }

    req.on('error', (error) => {
      done(createHttpError(400, 'request_error', 'Failed to read request body', {
        cause: String(error && error.message ? error.message : error),
      }));
    });

    req.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || ''), 'utf8');
      size += buffer.length;
      if (size > maxBodyBytes) {
        req.resume();
        done(createHttpError(413, 'payload_too_large', `Request body exceeded ${maxBodyBytes} bytes`));
        return;
      }
      chunks.push(buffer);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return done(null, null);
      try {
        const parsed = JSON.parse(raw);
        done(null, parsed);
      } catch (error) {
        done(createHttpError(400, 'invalid_json', 'Request body must be valid JSON', {
          cause: String(error && error.message ? error.message : error),
        }));
      }
    });
  });
}

function toPathname(req) {
  try {
    const parsed = new URL(String(req.url || '/'), 'http://service.invalid');
    return parsed.pathname;
  } catch (_) {
    return '/';
  }
}

function sendJson(res, { status, payload, requestId }) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (requestId) res.setHeader('X-Request-Id', requestId);
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendProblem(res, { status, payload, requestId }) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
  if (requestId) res.setHeader('X-Request-Id', requestId);
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function buildProblemDetails({ code, status, title, detail, pathname, requestId, details }) {
  const type = `urn:baseline:problem:${code || 'internal_error'}`;
  return {
    type,
    title,
    status,
    detail,
    instance: pathname,
    code: code || 'internal_error',
    request_id: requestId,
    details: details && typeof details === 'object' ? details : undefined,
  };
}

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

function createRequestHandler({ backendConfig, frontendConfig, logger, startedAtMs, now }) {
  const contract = buildAppStackContract({ backendConfig });
  const openapiDocument = buildOpenApiDocument({ backendConfig });
  const settingsCatalog = buildRuntimeSettingsCatalog({ backendConfig, frontendConfig });

  return async function requestHandler(req, res) {
    const requestId = String(req.headers['x-request-id'] || '').trim() || crypto.randomUUID();
    const started = now();
    const method = String(req.method || 'GET').toUpperCase();
    const pathname = toPathname(req);
    const isApiPath = pathname === '/api/health' || pathname.startsWith('/api/');

    try {
      if (isApiPath) {
        const cors = applyCorsHeaders({ req, res, config: backendConfig });
        if (!cors.allowed) {
          throw createHttpError(403, 'origin_not_allowed', 'Origin is not allowed by CORS policy', {
            origin: cors.origin,
          });
        }
      }

      if (method === 'OPTIONS' && isApiPath) {
        res.statusCode = 204;
        res.setHeader('X-Request-Id', requestId);
        res.end();
        logger.info('request_completed', {
          request_id: requestId,
          method,
          pathname,
          status: 204,
          duration_ms: now() - started,
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/health') {
        sendJson(res, {
          status: 200,
          requestId,
          payload: {
            status: 'ok',
            service: backendConfig.serviceName,
            environment: backendConfig.environment,
            uptime_ms: Math.max(0, now() - startedAtMs),
            request_timeout_ms: backendConfig.requestTimeoutMs,
          },
        });
        return;
      }

      if (method === 'GET' && pathname === contract.endpoints.contract) {
        sendJson(res, {
          status: 200,
          requestId,
          payload: contract,
        });
        return;
      }

      if (method === 'GET' && pathname === contract.endpoints.openapi) {
        sendJson(res, {
          status: 200,
          requestId,
          payload: openapiDocument,
        });
        return;
      }

      if (method === 'GET' && pathname === contract.endpoints.meta) {
        sendJson(res, {
          status: 200,
          requestId,
          payload: {
            service_name: backendConfig.serviceName,
            environment: backendConfig.environment,
            api_base_path: backendConfig.apiBasePath,
            settings_catalog: settingsCatalog,
            features: {
              cors: true,
              rfc9457_problem_details: true,
              contract_endpoint: true,
              openapi_endpoint: true,
            },
          },
        });
        return;
      }

      if (method === 'POST' && pathname === contract.endpoints.echo) {
        const payload = await readJsonBody(req, {
          maxBodyBytes: backendConfig.maxBodyBytes,
          timeoutMs: backendConfig.requestTimeoutMs,
        });
        sendJson(res, {
          status: 200,
          requestId,
          payload: {
            echoed: payload,
            received_at: new Date(now()).toISOString(),
            request_id: requestId,
          },
        });
        return;
      }

      throw createHttpError(404, 'not_found', `Route not found: ${method} ${pathname}`);
    } catch (error) {
      const status = Number(error && error.status) || 500;
      const code = String(error && error.code || 'internal_error');
      const safeMessage = status >= 500
        ? 'Unexpected server error'
        : String(error && error.message || 'Request failed');
      const title = status >= 500 ? 'Internal Server Error' : safeMessage;
      const detail = status >= 500 ? 'An unexpected error occurred while processing the request.' : safeMessage;

      if (status >= 500) {
        logger.error('request_failed', {
          request_id: requestId,
          method,
          pathname,
          status,
          error: String(error && error.stack ? error.stack : error),
        });
      }

      sendProblem(res, {
        status,
        requestId,
        payload: buildProblemDetails({
          code,
          status,
          title,
          detail,
          pathname,
          requestId,
          details: error && error.details ? error.details : undefined,
        }),
      });
    } finally {
      logger.info('request_completed', {
        request_id: requestId,
        method,
        pathname,
        status: res.statusCode,
        duration_ms: Math.max(0, now() - started),
      });
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

async function startBackendServer(options = {}) {
  const env = options.env && typeof options.env === 'object' ? options.env : process.env;
  const backendConfig = options.backendConfig || resolveBackendConfig(env);
  const frontendConfig = options.frontendConfig || resolveFrontendConfig(env);
  const logger = createLogger(options.logger);
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const startedAtMs = now();

  const server = http.createServer(
    createRequestHandler({ backendConfig, frontendConfig, logger, startedAtMs, now })
  );
  server.keepAliveTimeout = backendConfig.keepAliveTimeoutMs;

  await listen(server, { host: backendConfig.host, port: backendConfig.port });
  const address = server.address();

  logger.info('backend_server_started', {
    host: backendConfig.host,
    port: address && typeof address === 'object' ? address.port : backendConfig.port,
    api_base_path: backendConfig.apiBasePath,
  });

  return {
    server,
    address,
    backendConfig,
    frontendConfig,
    async stop() {
      await closeServer(server);
      logger.info('backend_server_stopped', {});
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
    logger.info('backend_server_shutdown_signal', { signal });
    try {
      await runtime.stop();
      process.exitCode = 0;
    } catch (error) {
      logger.error('backend_server_shutdown_failed', {
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

module.exports = {
  createHttpError,
  createRequestHandler,
  startBackendServer,
  installSignalHandlers,
};
