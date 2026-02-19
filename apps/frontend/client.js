(function buildClient(globalScope, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }
  globalScope.BaselineFrontendClient = factory();
})(typeof globalThis !== 'undefined' ? globalThis : window, function createClient() {
  'use strict';

  function toInteger(raw, fallback, { min = null, max = null } = {}) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return fallback;
    const normalized = Math.trunc(value);
    if (min != null && normalized < min) return fallback;
    if (max != null && normalized > max) return fallback;
    return normalized;
  }

  function normalizeBaseUrl(raw) {
    const value = String(raw == null ? '' : raw).trim();
    if (!value) return '';
    return value.replace(/\/+$/, '');
  }

  function normalizePath(raw, fallback) {
    const value = String(raw == null ? '' : raw).trim();
    const resolved = value || fallback || '/';
    return resolved.startsWith('/') ? resolved : `/${resolved}`;
  }

  function isAbsoluteUrl(value) {
    return /^https?:\/\//i.test(String(value || '').trim());
  }

  function joinUrl(baseUrl, pathValue) {
    const path = String(pathValue == null ? '' : pathValue).trim();
    if (!path) return normalizeBaseUrl(baseUrl);
    if (isAbsoluteUrl(path)) return path;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const base = normalizeBaseUrl(baseUrl);
    if (!base) return normalizedPath;
    return `${base}${normalizedPath}`;
  }

  function normalizeRuntimeConfig(raw, locationLike) {
    const config = raw && typeof raw === 'object' ? raw : {};
    const locationValue = locationLike && typeof locationLike === 'object' ? locationLike : null;
    const origin = locationValue && typeof locationValue.origin === 'string' ? locationValue.origin : '';
    const backendBaseUrl = normalizeBaseUrl(
      config.backendBaseUrl || config.backend_base_url || config.apiBaseUrl || origin || ''
    );
    const contractPath = normalizePath(
      config.contractPath || config.contract_path || '/api/v1/contract',
      '/api/v1/contract'
    );
    const requestTimeoutMs = toInteger(
      config.requestTimeoutMs || config.request_timeout_ms,
      10000,
      { min: 100, max: 120000 }
    );
    return {
      backendBaseUrl,
      contractPath,
      requestTimeoutMs,
    };
  }

  async function parseJsonResponse(response) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`Expected JSON response (${response.url || 'unknown url'}): ${error.message}`);
    }
  }

  function toErrorMessage(payload) {
    if (!payload || typeof payload !== 'object') return '';
    if (payload.error && typeof payload.error === 'object') {
      const code = String(payload.error.code || '').trim();
      const message = String(payload.error.message || '').trim();
      if (code && message) return `${code}: ${message}`;
      return message || code;
    }
    return '';
  }

  async function httpJson(fetchImpl, url, options = {}) {
    if (typeof fetchImpl !== 'function') {
      throw new Error('Fetch implementation is required');
    }

    const timeoutMs = toInteger(options.timeoutMs, 10000, { min: 100, max: 120000 });
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
      : null;

    try {
      const response = await fetchImpl(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body,
        signal: controller ? controller.signal : undefined,
      });
      const payload = await parseJsonResponse(response);
      if (!response.ok) {
        const message = toErrorMessage(payload) || `Request failed with status ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      return payload;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function loadSnapshot(runtimeConfig, fetchImpl) {
    const runtime = normalizeRuntimeConfig(runtimeConfig, typeof location !== 'undefined' ? location : null);
    const fetchFn = typeof fetchImpl === 'function' ? fetchImpl : (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) throw new Error('Global fetch is unavailable');

    const contractUrl = joinUrl(runtime.backendBaseUrl, runtime.contractPath);
    const contract = await httpJson(fetchFn, contractUrl, { timeoutMs: runtime.requestTimeoutMs });

    const endpoints = contract && contract.endpoints && typeof contract.endpoints === 'object'
      ? contract.endpoints
      : {};
    if (!endpoints.health || !endpoints.meta || !endpoints.echo) {
      throw new Error('Contract is missing required endpoints (health/meta/echo)');
    }

    const [health, meta] = await Promise.all([
      httpJson(fetchFn, joinUrl(runtime.backendBaseUrl, endpoints.health), { timeoutMs: runtime.requestTimeoutMs }),
      httpJson(fetchFn, joinUrl(runtime.backendBaseUrl, endpoints.meta), { timeoutMs: runtime.requestTimeoutMs }),
    ]);

    return {
      runtime,
      contract,
      health,
      meta,
    };
  }

  return {
    normalizeBaseUrl,
    joinUrl,
    normalizeRuntimeConfig,
    httpJson,
    loadSnapshot,
  };
});
