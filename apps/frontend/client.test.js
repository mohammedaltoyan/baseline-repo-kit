'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const client = require('./client');

function createJsonResponse(url, status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    async text() {
      return JSON.stringify(payload);
    },
  };
}

test('normalizeRuntimeConfig derives safe defaults and canonical path', () => {
  const runtime = client.normalizeRuntimeConfig(
    { contractPath: 'api/v2/contract', requestTimeoutMs: '14000' },
    { origin: 'https://example.local' }
  );

  assert.equal(runtime.backendBaseUrl, 'https://example.local');
  assert.equal(runtime.contractPath, '/api/v2/contract');
  assert.equal(runtime.requestTimeoutMs, 14000);
});

test('joinUrl composes relative paths and preserves absolute URLs', () => {
  assert.equal(client.joinUrl('https://api.example.com/', '/api/v1/health'), 'https://api.example.com/api/v1/health');
  assert.equal(client.joinUrl('https://api.example.com', 'api/v1/health'), 'https://api.example.com/api/v1/health');
  assert.equal(client.joinUrl('', '/api/v1/health'), '/api/v1/health');
  assert.equal(client.joinUrl('https://api.example.com', 'https://other.example.com/meta'), 'https://other.example.com/meta');
});

test('loadSnapshot resolves contract and dependent endpoints', async () => {
  const calls = [];
  const backendBaseUrl = 'https://backend.example';
  const contractPath = '/api/v4/contract';
  const healthPath = '/api/health';
  const metaPath = '/api/v4/meta';
  const echoPath = '/api/v4/echo';
  const openapiPath = '/api/v4/openapi.json';

  const mockFetch = async (url) => {
    calls.push(url);
    if (url === `${backendBaseUrl}${contractPath}`) {
      return createJsonResponse(url, 200, {
        endpoints: {
          health: healthPath,
          meta: metaPath,
          echo: echoPath,
          openapi: openapiPath,
        },
      });
    }
    if (url === `${backendBaseUrl}${healthPath}`) {
      return createJsonResponse(url, 200, { status: 'ok' });
    }
    if (url === `${backendBaseUrl}${metaPath}`) {
      return createJsonResponse(url, 200, { settings_catalog: [] });
    }
    if (url === `${backendBaseUrl}${openapiPath}`) {
      return createJsonResponse(url, 200, { openapi: '3.1.1' });
    }
    return createJsonResponse(url, 404, { error: { code: 'not_found', message: 'missing' } });
  };

  const snapshot = await client.loadSnapshot(
    { backendBaseUrl, contractPath, requestTimeoutMs: 1000 },
    mockFetch
  );

  assert.equal(snapshot.contract.endpoints.echo, echoPath);
  assert.equal(snapshot.health.status, 'ok');
  assert.ok(Array.isArray(snapshot.meta.settings_catalog));
  assert.equal(snapshot.openapi.openapi, '3.1.1');
  assert.deepEqual(calls, [
    `${backendBaseUrl}${contractPath}`,
    `${backendBaseUrl}${healthPath}`,
    `${backendBaseUrl}${metaPath}`,
    `${backendBaseUrl}${openapiPath}`,
  ]);
});

test('httpJson throws rich errors for non-success responses', async () => {
  const mockFetch = async (url) =>
    createJsonResponse(url, 403, {
      code: 'origin_not_allowed',
      title: 'Origin is not allowed by CORS policy',
      status: 403,
    });

  await assert.rejects(
    () => client.httpJson(mockFetch, 'https://backend.example/api/health', { timeoutMs: 1000 }),
    (error) => {
      assert.equal(error.status, 403);
      assert.match(error.message, /origin_not_allowed/i);
      return true;
    }
  );
});
