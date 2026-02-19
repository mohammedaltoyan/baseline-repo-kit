'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveBackendConfig, resolveFrontendConfig } = require('../../packages/shared/app-stack-contract');
const { startBackendServer } = require('./server');

function silentLogger() {
  return {
    info() {},
    error() {},
  };
}

function cloneBackendConfig(overrides = {}) {
  const defaults = resolveBackendConfig({});
  return {
    ...defaults,
    ...overrides,
    cors: {
      ...defaults.cors,
      ...(overrides.cors || {}),
    },
  };
}

async function startForTest(t, overrides = {}) {
  const backendConfig = cloneBackendConfig({
    host: '0.0.0.0',
    port: 0,
    ...overrides,
  });
  const frontendConfig = resolveFrontendConfig({ BACKEND_PORT: String(backendConfig.port || 4310) });
  const runtime = await startBackendServer({
    backendConfig,
    frontendConfig,
    logger: silentLogger(),
  });
  t.after(async () => {
    await runtime.stop();
  });
  const address = runtime.server.address();
  const port = address && typeof address === 'object' ? address.port : backendConfig.port;
  return { runtime, baseUrl: `http://0.0.0.0:${port}` };
}

async function readJson(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

test('GET /api/health returns dynamic runtime payload', async (t) => {
  const { baseUrl } = await startForTest(t, { serviceName: 'baseline-test', environment: 'ci' });
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const payload = await readJson(res);
  assert.equal(payload.status, 'ok');
  assert.equal(payload.service, 'baseline-test');
  assert.equal(payload.environment, 'ci');
  assert.equal(typeof payload.uptime_ms, 'number');
});

test('contract and metadata endpoints resolve from api base path', async (t) => {
  const { baseUrl } = await startForTest(t, { apiBasePath: '/api/runtime' });

  const contractRes = await fetch(`${baseUrl}/api/runtime/contract`);
  assert.equal(contractRes.status, 200);
  const contract = await readJson(contractRes);
  assert.equal(contract.standards.error_format, 'rfc9457_problem_details');
  assert.equal(contract.endpoints.meta, '/api/runtime/meta');
  assert.equal(contract.endpoints.echo, '/api/runtime/echo');
  assert.equal(contract.endpoints.openapi, '/api/runtime/openapi.json');

  const openapiRes = await fetch(`${baseUrl}${contract.endpoints.openapi}`);
  assert.equal(openapiRes.status, 200);
  const openapi = await readJson(openapiRes);
  assert.equal(openapi.openapi, '3.1.1');
  assert.ok(openapi.paths[contract.endpoints.echo]);

  const metaRes = await fetch(`${baseUrl}${contract.endpoints.meta}`);
  assert.equal(metaRes.status, 200);
  const meta = await readJson(metaRes);
  assert.ok(Array.isArray(meta.settings_catalog));
  assert.ok(meta.settings_catalog.some((row) => row.key === 'frontend.backend_base_url'));
});

test('POST echo rejects invalid json and enforces payload limits', async (t) => {
  const { baseUrl } = await startForTest(t, { maxBodyBytes: 32 });

  const invalid = await fetch(`${baseUrl}/api/v1/echo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"broken"',
  });
  assert.equal(invalid.status, 400);
  assert.match(String(invalid.headers.get('content-type') || ''), /application\/problem\+json/i);
  const invalidPayload = await readJson(invalid);
  assert.equal(invalidPayload.code, 'invalid_json');
  assert.equal(invalidPayload.status, 400);

  const tooLarge = await fetch(`${baseUrl}/api/v1/echo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(128) }),
  });
  assert.equal(tooLarge.status, 413);
  const tooLargePayload = await readJson(tooLarge);
  assert.equal(tooLargePayload.code, 'payload_too_large');
  assert.equal(tooLargePayload.status, 413);
});

test('CORS policy allows configured origins and blocks unknown origins', async (t) => {
  const { baseUrl } = await startForTest(t, {
    cors: {
      allowedOrigins: ['https://allowed.example'],
      allowedMethods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['content-type', 'x-request-id'],
      allowCredentials: true,
    },
  });

  const preflightAllowed = await fetch(`${baseUrl}/api/v1/echo`, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://allowed.example',
      'access-control-request-method': 'POST',
    },
  });
  assert.equal(preflightAllowed.status, 204);
  assert.equal(preflightAllowed.headers.get('access-control-allow-origin'), 'https://allowed.example');
  assert.equal(preflightAllowed.headers.get('access-control-allow-credentials'), 'true');

  const disallowed = await fetch(`${baseUrl}/api/health`, {
    headers: { origin: 'https://blocked.example' },
  });
  assert.equal(disallowed.status, 403);
  assert.match(String(disallowed.headers.get('content-type') || ''), /application\/problem\+json/i);
  const payload = await readJson(disallowed);
  assert.equal(payload.code, 'origin_not_allowed');
});
