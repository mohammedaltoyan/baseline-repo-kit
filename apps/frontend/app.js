/* global BaselineFrontendClient, fetch */

(function runFrontendApp() {
  'use strict';

  const client = BaselineFrontendClient;
  if (!client) {
    throw new Error('BaselineFrontendClient is required before app.js');
  }

  const state = {
    runtime: null,
    contract: null,
    health: null,
    meta: null,
    openapi: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function formatJson(value) {
    return JSON.stringify(value, null, 2);
  }

  function setStatus(type, message) {
    const node = $('status');
    node.dataset.kind = type;
    node.textContent = message;
  }

  function setSnapshot(nodeId, payload) {
    $(nodeId).textContent = formatJson(payload || {});
  }

  function renderRuntimeSummary(runtime) {
    $('runtimeSummary').innerHTML = [
      `<div><span>Backend Base URL</span><strong>${runtime.backendBaseUrl}</strong></div>`,
      `<div><span>Contract Path</span><strong>${runtime.contractPath}</strong></div>`,
      `<div><span>Request Timeout</span><strong>${runtime.requestTimeoutMs}ms</strong></div>`,
    ].join('');
  }

  function renderSettingsTable(meta) {
    const rows = meta && Array.isArray(meta.settings_catalog) ? meta.settings_catalog : [];
    if (!rows.length) {
      $('settingsRows').innerHTML = '<tr><td colspan="6">No runtime settings metadata returned.</td></tr>';
      return;
    }
    $('settingsRows').innerHTML = rows.map((row) => {
      const value = typeof row.value === 'string' ? row.value : formatJson(row.value);
      return [
        '<tr>',
        `<td>${row.key || '-'}</td>`,
        `<td><code>${row.env_var || '-'}</code></td>`,
        `<td>${value}</td>`,
        `<td>${row.what_this_controls || '-'}</td>`,
        `<td>${row.why_it_matters || '-'}</td>`,
        `<td>${row.apply_impact || '-'}</td>`,
        '</tr>',
      ].join('');
    }).join('');
  }

  function parseEchoInput() {
    const raw = $('echoPayload').value.trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(`Echo payload must be valid JSON: ${error.message}`);
    }
  }

  async function submitEcho(event) {
    event.preventDefault();
    try {
      if (!state.runtime || !state.contract) {
        throw new Error('Load runtime data before calling echo.');
      }
      const payload = parseEchoInput();
      const response = await client.httpJson(
        fetch,
        client.joinUrl(state.runtime.backendBaseUrl, state.contract.endpoints.echo),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          timeoutMs: state.runtime.requestTimeoutMs,
        }
      );
      setSnapshot('echoResponse', response);
      setStatus('ok', 'Echo request succeeded.');
    } catch (error) {
      setStatus('error', error.message || String(error));
    }
  }

  async function load() {
    setStatus('loading', 'Loading contract and runtime snapshot...');
    try {
      const runtime = client.normalizeRuntimeConfig(
        window.__BASELINE_FRONTEND_CONFIG__ || {},
        window.location
      );
      const snapshot = await client.loadSnapshot(runtime, fetch);

      state.runtime = snapshot.runtime;
      state.contract = snapshot.contract;
      state.health = snapshot.health;
      state.meta = snapshot.meta;
      state.openapi = snapshot.openapi;

      renderRuntimeSummary(snapshot.runtime);
      renderSettingsTable(snapshot.meta);
      setSnapshot('contractData', snapshot.contract);
      setSnapshot('healthData', snapshot.health);
      setSnapshot('metaData', snapshot.meta);
      setSnapshot('openapiData', snapshot.openapi);
      setStatus('ok', 'Connected. Contract, OpenAPI, health, and metadata loaded.');
    } catch (error) {
      setStatus('error', error.message || String(error));
    }
  }

  $('reloadButton').addEventListener('click', load);
  $('echoForm').addEventListener('submit', submitEcho);

  load();
})();
