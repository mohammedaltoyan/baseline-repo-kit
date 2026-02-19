'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OPENAPI_VERSION,
  buildApiPaths,
  buildAppStackContract,
  buildOpenApiDocument,
  buildRuntimeSettingsCatalog,
  normalizeApiBasePath,
  resolveBackendConfig,
  resolveFrontendConfig,
} = require('./app-stack-contract');

test('normalizeApiBasePath normalizes prefix and trailing slash', () => {
  assert.equal(normalizeApiBasePath('api/v2/'), '/api/v2');
  assert.equal(normalizeApiBasePath('/api///v3//'), '/api/v3');
  assert.equal(normalizeApiBasePath(''), '/api/v1');
});

test('resolveBackendConfig parses and bounds typed env settings', () => {
  const config = resolveBackendConfig({
    BACKEND_HOST: 'api.internal.example',
    BACKEND_PORT: '4800',
    BACKEND_API_BASE_PATH: 'platform/api',
    BACKEND_CORS_ALLOWED_ORIGINS: 'https://a.example, https://b.example, https://a.example',
    BACKEND_CORS_ALLOW_CREDENTIALS: 'true',
    BACKEND_CORS_ALLOWED_METHODS: 'get,patch,options',
    BACKEND_CORS_ALLOWED_HEADERS: 'content-type, x-request-id',
    BACKEND_CORS_MAX_AGE_SECONDS: '1200',
  });

  assert.equal(config.host, 'api.internal.example');
  assert.equal(config.port, 4800);
  assert.equal(config.apiBasePath, '/platform/api');
  assert.deepEqual(config.cors.allowedOrigins, ['https://a.example', 'https://b.example']);
  assert.equal(config.cors.allowCredentials, true);
  assert.deepEqual(config.cors.allowedMethods, ['GET', 'PATCH', 'OPTIONS']);
  assert.deepEqual(config.cors.allowedHeaders, ['content-type', 'x-request-id']);
  assert.equal(config.cors.maxAgeSeconds, 1200);
});

test('resolveFrontendConfig derives backend URL when host is explicit', () => {
  const config = resolveFrontendConfig({ BACKEND_HOST: 'api.internal.example', BACKEND_PORT: '4999' });
  assert.equal(config.backendBaseUrl, 'http://api.internal.example:4999');
});

test('buildApiPaths and contract generation are aligned', () => {
  const endpoints = buildApiPaths('/api/v9');
  assert.equal(endpoints.contract, '/api/v9/contract');
  assert.equal(endpoints.openapi, '/api/v9/openapi.json');
  assert.equal(endpoints.meta, '/api/v9/meta');
  assert.equal(endpoints.echo, '/api/v9/echo');

  const contract = buildAppStackContract({
    backendConfig: {
      serviceName: 'svc',
      environment: 'test',
      apiBasePath: '/api/v9',
    },
  });
  assert.equal(contract.endpoints.contract, '/api/v9/contract');
  assert.equal(contract.standards.openapi_endpoint, '/api/v9/openapi.json');
  assert.equal(contract.runtime.backend.environment, 'test');
});

test('buildOpenApiDocument is generated from shared endpoint SSOT', () => {
  const doc = buildOpenApiDocument({
    backendConfig: {
      serviceName: 'contract-api',
      apiBasePath: '/api/v3',
      publicBaseUrl: 'https://api.example.internal/',
      environment: 'test',
    },
  });

  assert.equal(doc.openapi, OPENAPI_VERSION);
  assert.equal(doc.servers[0].url, 'https://api.example.internal');
  assert.ok(doc.paths['/api/v3/openapi.json']);
  assert.ok(doc.paths['/api/v3/echo']);
  assert.ok(doc.components.schemas.ProblemDetails);
});

test('runtime settings catalog returns explanatory metadata rows', () => {
  const rows = buildRuntimeSettingsCatalog({
    backendConfig: {
      host: '0.0.0.0',
      port: 4310,
      apiBasePath: '/api/v1',
      cors: { allowedOrigins: ['*'] },
    },
    frontendConfig: {
      backendBaseUrl: 'https://api.internal.example',
      contractPath: '/api/v1/contract',
    },
  });

  assert.ok(Array.isArray(rows));
  assert.ok(rows.length >= 7);
  assert.ok(rows.every((row) => row.key && row.env_var && row.what_this_controls && row.why_it_matters));
});
