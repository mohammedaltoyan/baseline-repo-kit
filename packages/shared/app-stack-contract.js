'use strict';

const API_VERSION = 'v1';
const CONTRACT_VERSION = '1.0.0';
const OPENAPI_VERSION = '3.1.1';
const DEFAULT_API_BASE_PATH = '/api/v1';
const OPENAPI_SCHEMA_DIALECT = 'https://spec.openapis.org/oas/3.1/dialect/base';

const DEFAULT_BACKEND_CONFIG = Object.freeze({
  host: '0.0.0.0',
  port: 4310,
  serviceName: 'baseline-backend',
  environment: 'development',
  apiBasePath: DEFAULT_API_BASE_PATH,
  publicBaseUrl: '',
  requestTimeoutMs: 10000,
  maxBodyBytes: 1024 * 1024,
  keepAliveTimeoutMs: 5000,
  cors: Object.freeze({
    allowedOrigins: Object.freeze(['*']),
    allowCredentials: false,
    allowedMethods: Object.freeze(['GET', 'POST', 'OPTIONS']),
    allowedHeaders: Object.freeze(['content-type', 'authorization', 'x-request-id']),
    maxAgeSeconds: 600,
  }),
});

const DEFAULT_FRONTEND_CONFIG = Object.freeze({
  host: '0.0.0.0',
  port: 4320,
  backendBaseUrl: '',
  contractPath: '/api/v1/contract',
  requestTimeoutMs: 10000,
});

function toStringValue(raw, fallback) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) return fallback;
  return value;
}

function toIntegerValue(raw, fallback, { min = null, max = null } = {}) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value);
  if (min != null && normalized < min) return fallback;
  if (max != null && normalized > max) return fallback;
  return normalized;
}

function toBooleanValue(raw, fallback) {
  if (typeof raw === 'boolean') return raw;
  const value = String(raw == null ? '' : raw).trim().toLowerCase();
  if (!value) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(value)) return false;
  return fallback;
}

function normalizeCsv(raw, fallback) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) return Array.isArray(fallback) ? [...fallback] : [];
  const deduped = new Set();
  for (const part of value.split(',')) {
    const entry = String(part || '').trim();
    if (!entry) continue;
    deduped.add(entry);
  }
  if (!deduped.size) return Array.isArray(fallback) ? [...fallback] : [];
  return [...deduped];
}

function normalizeApiBasePath(raw, fallback = DEFAULT_API_BASE_PATH) {
  const value = String(raw == null ? '' : raw).trim();
  const base = value || fallback;
  if (!base) return DEFAULT_API_BASE_PATH;
  let normalized = base.startsWith('/') ? base : `/${base}`;
  normalized = normalized.replace(/\/{2,}/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized || DEFAULT_API_BASE_PATH;
}

function normalizePath(raw, fallback) {
  const value = String(raw == null ? '' : raw).trim();
  const resolved = value || fallback || '/';
  if (!resolved.startsWith('/')) return `/${resolved}`;
  return resolved;
}

function normalizeBaseUrl(raw, fallback = '') {
  const value = String(raw == null ? '' : raw).trim();
  const resolved = value || fallback;
  if (!resolved) return '';
  return resolved.replace(/\/+$/, '');
}

function normalizeOrigin(urlValue) {
  const value = String(urlValue == null ? '' : urlValue).trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    return parsed.origin;
  } catch (_) {
    return '';
  }
}

function buildApiPaths(apiBasePath) {
  const base = normalizeApiBasePath(apiBasePath);
  return Object.freeze({
    health: '/api/health',
    contract: `${base}/contract`,
    openapi: `${base}/openapi.json`,
    meta: `${base}/meta`,
    echo: `${base}/echo`,
  });
}

function resolveBackendConfig(env) {
  const source = env && typeof env === 'object' ? env : {};
  const defaults = DEFAULT_BACKEND_CONFIG;

  const config = {
    host: toStringValue(source.BACKEND_HOST, defaults.host),
    port: toIntegerValue(source.BACKEND_PORT, defaults.port, { min: 1, max: 65535 }),
    serviceName: toStringValue(source.BACKEND_SERVICE_NAME, defaults.serviceName),
    environment: toStringValue(source.BACKEND_ENVIRONMENT, defaults.environment),
    apiBasePath: normalizeApiBasePath(source.BACKEND_API_BASE_PATH, defaults.apiBasePath),
    publicBaseUrl: normalizeBaseUrl(source.BACKEND_PUBLIC_BASE_URL, defaults.publicBaseUrl),
    requestTimeoutMs: toIntegerValue(source.BACKEND_REQUEST_TIMEOUT_MS, defaults.requestTimeoutMs, { min: 100, max: 120000 }),
    maxBodyBytes: toIntegerValue(source.BACKEND_MAX_BODY_BYTES, defaults.maxBodyBytes, { min: 1024, max: 10 * 1024 * 1024 }),
    keepAliveTimeoutMs: toIntegerValue(
      source.BACKEND_KEEP_ALIVE_TIMEOUT_MS,
      defaults.keepAliveTimeoutMs,
      { min: 1000, max: 120000 }
    ),
    cors: {
      allowedOrigins: normalizeCsv(source.BACKEND_CORS_ALLOWED_ORIGINS, defaults.cors.allowedOrigins),
      allowCredentials: toBooleanValue(source.BACKEND_CORS_ALLOW_CREDENTIALS, defaults.cors.allowCredentials),
      allowedMethods: normalizeCsv(source.BACKEND_CORS_ALLOWED_METHODS, defaults.cors.allowedMethods).map((entry) =>
        String(entry).toUpperCase()
      ),
      allowedHeaders: normalizeCsv(source.BACKEND_CORS_ALLOWED_HEADERS, defaults.cors.allowedHeaders).map((entry) =>
        String(entry).toLowerCase()
      ),
      maxAgeSeconds: toIntegerValue(source.BACKEND_CORS_MAX_AGE_SECONDS, defaults.cors.maxAgeSeconds, { min: 0, max: 86400 }),
    },
  };

  if (!Array.isArray(config.cors.allowedOrigins) || !config.cors.allowedOrigins.length) {
    config.cors.allowedOrigins = [...defaults.cors.allowedOrigins];
  }
  if (!Array.isArray(config.cors.allowedMethods) || !config.cors.allowedMethods.length) {
    config.cors.allowedMethods = [...defaults.cors.allowedMethods];
  }
  if (!Array.isArray(config.cors.allowedHeaders) || !config.cors.allowedHeaders.length) {
    config.cors.allowedHeaders = [...defaults.cors.allowedHeaders];
  }

  return config;
}

function resolveFrontendConfig(env) {
  const source = env && typeof env === 'object' ? env : {};
  const backend = resolveBackendConfig(source);
  const defaults = DEFAULT_FRONTEND_CONFIG;

  let backendBaseUrl = toStringValue(source.FRONTEND_BACKEND_BASE_URL, defaults.backendBaseUrl);
  if (!backendBaseUrl) {
    const explicitPublic = toStringValue(source.BACKEND_PUBLIC_BASE_URL, '');
    if (explicitPublic) {
      backendBaseUrl = explicitPublic;
    } else {
      const hostCandidate = toStringValue(source.BACKEND_HOST, '');
      if (hostCandidate && hostCandidate !== '0.0.0.0') {
        backendBaseUrl = `http://${hostCandidate}:${backend.port}`;
      } else {
        backendBaseUrl = '';
      }
    }
  }

  return {
    host: toStringValue(source.FRONTEND_HOST, defaults.host),
    port: toIntegerValue(source.FRONTEND_PORT, defaults.port, { min: 1, max: 65535 }),
    backendBaseUrl,
    contractPath: normalizePath(source.FRONTEND_CONTRACT_PATH, defaults.contractPath),
    requestTimeoutMs: toIntegerValue(source.FRONTEND_REQUEST_TIMEOUT_MS, defaults.requestTimeoutMs, { min: 100, max: 120000 }),
  };
}

function buildAppStackContract({ backendConfig } = {}) {
  const backend = backendConfig || resolveBackendConfig(process.env);
  const endpoints = buildApiPaths(backend.apiBasePath);
  return {
    name: 'baseline-app-stack',
    contract_version: CONTRACT_VERSION,
    api_version: API_VERSION,
    endpoints,
    standards: {
      openapi_version: OPENAPI_VERSION,
      openapi_endpoint: endpoints.openapi,
      error_format: 'rfc9457_problem_details',
    },
    runtime: {
      backend: {
        service_name: backend.serviceName,
        environment: backend.environment,
        api_base_path: backend.apiBasePath,
      },
    },
  };
}

function buildOpenApiDocument({ backendConfig } = {}) {
  const backend = backendConfig || resolveBackendConfig(process.env);
  const contract = buildAppStackContract({ backendConfig: backend });
  const endpoints = contract.endpoints;
  const serverUrl = normalizeBaseUrl(backend.publicBaseUrl, '') || '/';

  return {
    openapi: OPENAPI_VERSION,
    jsonSchemaDialect: OPENAPI_SCHEMA_DIALECT,
    info: {
      title: `${backend.serviceName} API`,
      version: CONTRACT_VERSION,
      summary: 'Baseline app stack runtime API.',
      description: [
        'Generated from shared contract SSOT in packages/shared/app-stack-contract.js.',
        'Endpoints remain configuration-driven via BACKEND_API_BASE_PATH and related runtime settings.',
      ].join(' '),
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: 'Health', description: 'Runtime health checks.' },
      { name: 'Contract', description: 'Machine-readable runtime contract and metadata.' },
      { name: 'Utility', description: 'Echo and diagnostics endpoints.' },
    ],
    paths: {
      [endpoints.health]: {
        get: {
          tags: ['Health'],
          operationId: 'getHealth',
          summary: 'Get runtime health status.',
          responses: {
            '200': {
              description: 'Service is healthy.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                },
              },
            },
          },
        },
      },
      [endpoints.contract]: {
        get: {
          tags: ['Contract'],
          operationId: 'getContract',
          summary: 'Get app stack contract document.',
          responses: {
            '200': {
              description: 'Current contract and endpoint map.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ContractDocument' },
                },
              },
            },
          },
        },
      },
      [endpoints.openapi]: {
        get: {
          tags: ['Contract'],
          operationId: 'getOpenApiDocument',
          summary: 'Get generated OpenAPI document.',
          responses: {
            '200': {
              description: 'OpenAPI 3.1 document.',
              content: {
                'application/json': {
                  schema: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
      },
      [endpoints.meta]: {
        get: {
          tags: ['Contract'],
          operationId: 'getMetadata',
          summary: 'Get runtime metadata and settings explanation catalog.',
          responses: {
            '200': {
              description: 'Runtime metadata.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/MetaResponse' },
                },
              },
            },
          },
        },
      },
      [endpoints.echo]: {
        post: {
          tags: ['Utility'],
          operationId: 'postEcho',
          summary: 'Echo JSON payload for runtime diagnostics.',
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { type: ['object', 'array', 'string', 'number', 'boolean', 'null'] },
              },
            },
          },
          responses: {
            '200': {
              description: 'Echo payload response.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/EchoResponse' },
                },
              },
            },
            default: {
              description: 'Error response.',
              content: {
                'application/problem+json': {
                  schema: { $ref: '#/components/schemas/ProblemDetails' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        HealthResponse: {
          type: 'object',
          required: ['status', 'service', 'environment', 'uptime_ms', 'request_timeout_ms'],
          properties: {
            status: { type: 'string' },
            service: { type: 'string' },
            environment: { type: 'string' },
            uptime_ms: { type: 'number' },
            request_timeout_ms: { type: 'number' },
          },
          additionalProperties: false,
        },
        ContractDocument: {
          type: 'object',
          required: ['name', 'contract_version', 'api_version', 'endpoints', 'standards', 'runtime'],
          properties: {
            name: { type: 'string' },
            contract_version: { type: 'string' },
            api_version: { type: 'string' },
            endpoints: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
            standards: {
              type: 'object',
              additionalProperties: true,
            },
            runtime: {
              type: 'object',
              additionalProperties: true,
            },
          },
          additionalProperties: false,
        },
        MetaResponse: {
          type: 'object',
          required: ['service_name', 'environment', 'api_base_path', 'settings_catalog', 'features'],
          properties: {
            service_name: { type: 'string' },
            environment: { type: 'string' },
            api_base_path: { type: 'string' },
            settings_catalog: {
              type: 'array',
              items: { $ref: '#/components/schemas/RuntimeSettingRow' },
            },
            features: { type: 'object', additionalProperties: true },
          },
          additionalProperties: false,
        },
        RuntimeSettingRow: {
          type: 'object',
          required: ['key', 'env_var', 'value', 'what_this_controls', 'why_it_matters', 'apply_impact'],
          properties: {
            key: { type: 'string' },
            env_var: { type: 'string' },
            value: {},
            what_this_controls: { type: 'string' },
            why_it_matters: { type: 'string' },
            apply_impact: { type: 'string' },
          },
          additionalProperties: true,
        },
        EchoResponse: {
          type: 'object',
          required: ['echoed', 'received_at', 'request_id'],
          properties: {
            echoed: {},
            received_at: { type: 'string', format: 'date-time' },
            request_id: { type: 'string' },
          },
          additionalProperties: false,
        },
        ProblemDetails: {
          type: 'object',
          required: ['type', 'title', 'status'],
          properties: {
            type: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'integer' },
            detail: { type: 'string' },
            instance: { type: 'string' },
            code: { type: 'string' },
            request_id: { type: 'string' },
            details: {},
          },
          additionalProperties: true,
        },
      },
    },
  };
}

function buildRuntimeSettingsCatalog({ backendConfig, frontendConfig } = {}) {
  const backend = backendConfig || resolveBackendConfig(process.env);
  const frontend = frontendConfig || resolveFrontendConfig(process.env);
  return [
    {
      key: 'backend.host',
      env_var: 'BACKEND_HOST',
      value: backend.host,
      what_this_controls: 'Network interface where backend API listens.',
      why_it_matters: 'Defines local/cluster reachability and exposure.',
      apply_impact: 'Server bind target changes on restart.',
    },
    {
      key: 'backend.port',
      env_var: 'BACKEND_PORT',
      value: backend.port,
      what_this_controls: 'Backend HTTP listening port.',
      why_it_matters: 'Drives service discovery and frontend API routing.',
      apply_impact: 'Clients must use updated port after restart.',
    },
    {
      key: 'backend.api_base_path',
      env_var: 'BACKEND_API_BASE_PATH',
      value: backend.apiBasePath,
      what_this_controls: 'Base path for versioned API endpoints.',
      why_it_matters: 'Allows non-breaking API namespace/version evolution.',
      apply_impact: 'Client routes are resolved from this path.',
    },
    {
      key: 'backend.public_base_url',
      env_var: 'BACKEND_PUBLIC_BASE_URL',
      value: backend.publicBaseUrl,
      what_this_controls: 'Public server URL used by generated OpenAPI servers list.',
      why_it_matters: 'Improves SDK/client generation and external contract tooling.',
      apply_impact: 'OpenAPI document server URLs change immediately.',
    },
    {
      key: 'backend.cors.allowed_origins',
      env_var: 'BACKEND_CORS_ALLOWED_ORIGINS',
      value: backend.cors.allowedOrigins,
      what_this_controls: 'Origins allowed to call browser APIs.',
      why_it_matters: 'Prevents unintended cross-origin data access.',
      apply_impact: 'Preflight/response headers change immediately.',
    },
    {
      key: 'frontend.backend_base_url',
      env_var: 'FRONTEND_BACKEND_BASE_URL',
      value: frontend.backendBaseUrl,
      what_this_controls: 'Backend base URL used by frontend client.',
      why_it_matters: 'Supports local, preview, and production endpoint routing.',
      apply_impact: 'Frontend API calls point to new backend URL.',
    },
    {
      key: 'frontend.contract_path',
      env_var: 'FRONTEND_CONTRACT_PATH',
      value: frontend.contractPath,
      what_this_controls: 'Location of runtime API contract document.',
      why_it_matters: 'Frontend discovers effective endpoints dynamically.',
      apply_impact: 'Contract discovery URL changes.',
    },
  ];
}

module.exports = {
  API_VERSION,
  CONTRACT_VERSION,
  OPENAPI_VERSION,
  DEFAULT_API_BASE_PATH,
  DEFAULT_BACKEND_CONFIG,
  DEFAULT_FRONTEND_CONFIG,
  normalizeApiBasePath,
  normalizeBaseUrl,
  normalizeOrigin,
  buildApiPaths,
  resolveBackendConfig,
  resolveFrontendConfig,
  buildAppStackContract,
  buildOpenApiDocument,
  buildRuntimeSettingsCatalog,
};
