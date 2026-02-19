#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { parseFlagArgs } = require('../utils/cli-args');
const { writeJson } = require('../utils/json');
const { startBackendServer } = require('../../apps/backend/server');
const { startFrontendServer } = require('../../apps/frontend/dev-server');

function toString(value) {
  return String(value == null ? '' : value).trim();
}

function toNumber(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function isoNow() {
  return new Date().toISOString();
}

function die(message) {
  console.error(`[ui-visual-uat] ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`[ui-visual-uat] ${message}`);
}

function parseCliArgs(argv, options = {}) {
  const flags = parseFlagArgs(Array.isArray(argv) ? argv : []);
  const cwd = options.cwd || process.cwd();
  const stamp = isoNow().replace(/[:.]/g, '-');

  const artifactDirRaw =
    toString(flags['artifact-dir']) ||
    toString(flags.artifactDir) ||
    path.join('tmp', 'ui-visual-uat', stamp);

  return {
    help: !!(flags.h || flags.help),
    // objectives:allow LOCALHOST Justification: local visual-UAT harness requires loopback default for deterministic local access.
    host: toString(flags.host) || '127.0.0.1',
    backendPort: toNumber(flags['backend-port'] || flags.backendPort, 0),
    frontendPort: toNumber(flags['frontend-port'] || flags.frontendPort, 0),
    errorFrontendPort: toNumber(flags['error-frontend-port'] || flags.errorFrontendPort, 0),
    timeoutMs: toNumber(flags['timeout-ms'] || flags.timeoutMs || flags.timeout, 10_000),
    keepAlive: !!(flags['keep-alive'] || flags.keepAlive),
    artifactDir: path.resolve(cwd, artifactDirRaw),
  };
}

function sanitizeSlug(value) {
  return toString(value).replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function relFromCwd(absPath) {
  return path.relative(process.cwd(), absPath).replace(/\\/g, '/');
}

function reservePort(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? Number(address.port) : 0;
      server.close((error) => {
        if (error) return reject(error);
        if (!port) return reject(new Error('failed to reserve ephemeral port'));
        return resolve(port);
      });
    });
  });
}

function createChecklist({ healthyUrl, errorUrl, reportRelPath, evidenceRelPath }) {
  return [
    {
      id: 'ui-happy-home',
      name: 'Happy path home',
      url: healthyUrl,
      screenshot_name: '01-happy-home.png',
      what_to_verify: [
        'Top status bar moves from loading to ready.',
        'Runtime Connection card shows backend + contract endpoints.',
      ],
    },
    {
      id: 'ui-happy-openapi',
      name: 'OpenAPI snapshot',
      url: healthyUrl,
      screenshot_name: '02-openapi-snapshot.png',
      what_to_verify: [
        'API Snapshot contains Contract, Health, Meta, and OpenAPI sections.',
        'OpenAPI payload shows `openapi: 3.1.1`.',
      ],
    },
    {
      id: 'ui-error-backend',
      name: 'Backend error handling',
      url: errorUrl,
      screenshot_name: '03-backend-error-state.png',
      what_to_verify: [
        'Status banner shows an error state.',
        'Error block includes machine-readable code and request context.',
      ],
    },
    {
      id: 'ui-settings-catalog',
      name: 'Settings explanation table',
      url: healthyUrl,
      screenshot_name: '04-settings-table.png',
      what_to_verify: [
        'Settings table contains key, environment variable, effective value, control, why, and impact columns.',
        'Rows include backend/frontend runtime settings generated from SSOT.',
      ],
    },
    {
      id: 'evidence-complete',
      name: 'Evidence completion',
      url: '',
      screenshot_name: '',
      what_to_verify: [
        `Attach screenshots and mark completion in ${reportRelPath}.`,
        `Store captured images under ${evidenceRelPath}.`,
      ],
    },
  ];
}

function renderChecklistMarkdown({ startedAt, healthyUrl, errorUrl, reportPath, evidenceDir, checklist }) {
  const lines = [];
  lines.push('# UI Visual UAT Walkthrough');
  lines.push('');
  lines.push(`- Started: ${startedAt}`);
  lines.push(`- Healthy UI URL: ${healthyUrl}`);
  lines.push(`- Error-state UI URL: ${errorUrl}`);
  lines.push(`- JSON report: ${relFromCwd(reportPath)}`);
  lines.push(`- Screenshot directory: ${relFromCwd(evidenceDir)}`);
  lines.push('');
  lines.push('## Screenshot Checklist');
  lines.push('');
  for (const item of checklist) {
    lines.push(`### ${item.id} - ${item.name}`);
    if (item.url) lines.push(`- URL: ${item.url}`);
    if (item.screenshot_name) lines.push(`- Screenshot file: ${item.screenshot_name}`);
    lines.push('- Verify:');
    for (const expectation of item.what_to_verify) {
      lines.push(`  - [ ] ${expectation}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    return { ok: res.ok, status: res.status, body: text, json: parsed };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForSignal() {
  return new Promise((resolve) => {
    function onSignal(signal) {
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      resolve(signal);
    }
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  });
}

async function runVisualUat(options = {}) {
  const args = options.args || parseCliArgs(process.argv.slice(2));
  const startedAt = isoNow();
  const host = args.host;
  const backendPort = args.backendPort || await reservePort(host);
  const frontendPort = args.frontendPort || await reservePort(host);
  const errorFrontendPort = args.errorFrontendPort || await reservePort(host);
  const unreachablePort = await reservePort(host);
  const backendUrl = `http://${host}:${backendPort}`;
  const healthyUrl = `http://${host}:${frontendPort}`;
  const unreachableBackendUrl = `http://${host}:${unreachablePort}`;
  const errorUrl = `http://${host}:${errorFrontendPort}`;
  const evidenceDir = path.join(args.artifactDir, 'screenshots');
  const reportPath = path.join(args.artifactDir, 'ui-visual-uat.report.json');
  const checklistPath = path.join(args.artifactDir, 'ui-visual-uat.checklist.md');

  fs.mkdirSync(evidenceDir, { recursive: true });

  let backend = null;
  let frontendHealthy = null;
  let frontendError = null;

  try {
    backend = await startBackendServer({
      env: {
        ...process.env,
        BACKEND_HOST: host,
        BACKEND_PORT: String(backendPort),
        BACKEND_PUBLIC_BASE_URL: backendUrl,
      },
    });

    frontendHealthy = await startFrontendServer({
      env: {
        ...process.env,
        FRONTEND_HOST: host,
        FRONTEND_PORT: String(frontendPort),
        FRONTEND_BACKEND_BASE_URL: backendUrl,
      },
    });

    frontendError = await startFrontendServer({
      env: {
        ...process.env,
        FRONTEND_HOST: host,
        FRONTEND_PORT: String(errorFrontendPort),
        FRONTEND_BACKEND_BASE_URL: unreachableBackendUrl,
      },
    });

    const health = await fetchJson(`${backendUrl}/api/health`, args.timeoutMs);
    const contract = await fetchJson(`${backendUrl}/api/v1/contract`, args.timeoutMs);
    const openapi = await fetchJson(`${backendUrl}/api/v1/openapi.json`, args.timeoutMs);
    const frontendIndex = await fetchText(`${healthyUrl}/`, args.timeoutMs);
    const healthyRuntime = await fetchText(`${healthyUrl}/runtime-config.js`, args.timeoutMs);
    const errorRuntime = await fetchText(`${errorUrl}/runtime-config.js`, args.timeoutMs);

    const checks = [
      {
        id: 'backend-health',
        ok: health.ok && health.status === 200 && health.json && health.json.status === 'ok',
        detail: `status=${health.status}`,
      },
      {
        id: 'backend-contract',
        ok: contract.ok && contract.status === 200 && contract.json && contract.json.endpoints && contract.json.endpoints.openapi,
        detail: `status=${contract.status}`,
      },
      {
        id: 'backend-openapi',
        ok: openapi.ok && openapi.status === 200 && openapi.json && String(openapi.json.openapi || '') === '3.1.1',
        detail: `status=${openapi.status}`,
      },
      {
        id: 'frontend-index',
        ok: frontendIndex.ok && frontendIndex.status === 200 && frontendIndex.body.includes('App Stack Console'),
        detail: `status=${frontendIndex.status}`,
      },
      {
        id: 'frontend-runtime-healthy',
        ok: healthyRuntime.ok && healthyRuntime.body.includes(backendUrl),
        detail: `status=${healthyRuntime.status}`,
      },
      {
        id: 'frontend-runtime-error',
        ok: errorRuntime.ok && errorRuntime.body.includes(unreachableBackendUrl),
        detail: `status=${errorRuntime.status}`,
      },
    ];

    const checklist = createChecklist({
      healthyUrl,
      errorUrl,
      reportRelPath: relFromCwd(reportPath),
      evidenceRelPath: relFromCwd(evidenceDir),
    });

    const report = {
      generated_at: startedAt,
      host,
      urls: {
        healthy_ui: healthyUrl,
        error_ui: errorUrl,
        backend: backendUrl,
      },
      paths: {
        report: reportPath,
        checklist: checklistPath,
        screenshots_dir: evidenceDir,
      },
      automated_prechecks: checks,
      checklist,
      summary: {
        prechecks_ok: checks.every((entry) => entry.ok),
        keep_alive: !!args.keepAlive,
      },
    };

    writeJson(reportPath, report);
    fs.writeFileSync(
      checklistPath,
      renderChecklistMarkdown({
        startedAt,
        healthyUrl,
        errorUrl,
        reportPath,
        evidenceDir,
        checklist,
      }),
      'utf8'
    );

    info(`report: ${relFromCwd(reportPath)}`);
    info(`checklist: ${relFromCwd(checklistPath)}`);
    info(`screenshots_dir: ${relFromCwd(evidenceDir)}`);
    info(`healthy_ui: ${healthyUrl}`);
    info(`error_ui: ${errorUrl}`);

    if (!checks.every((entry) => entry.ok)) {
      const failed = checks.filter((entry) => !entry.ok).map((entry) => entry.id).join(', ');
      throw new Error(`automated prechecks failed: ${failed}`);
    }

    if (args.keepAlive) {
      info('manual mode enabled; capture screenshots using checklist, then press Ctrl+C to stop servers');
      await waitForSignal();
    }

    return report;
  } finally {
    if (frontendError && typeof frontendError.stop === 'function') {
      try { await frontendError.stop(); } catch {}
    }
    if (frontendHealthy && typeof frontendHealthy.stop === 'function') {
      try { await frontendHealthy.stop(); } catch {}
    }
    if (backend && typeof backend.stop === 'function') {
      try { await backend.stop(); } catch {}
    }
  }
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/tooling/ui-visual-uat.js [--artifact-dir <path>] [--keep-alive] [--host <ip>] [--backend-port <n>] [--frontend-port <n>] [--error-frontend-port <n>]\n' +
      '\n' +
      'Runs automated prechecks for backend/frontend integration and generates a screenshot checklist for manual visual UAT.\n' +
      'Use --keep-alive to keep both UI variants running while capturing screenshots.'
    );
    return;
  }

  const report = await runVisualUat({ args });
  if (!report || !report.summary || !report.summary.prechecks_ok) {
    die('visual UAT prechecks did not pass');
  }
}

if (require.main === module) {
  main().catch((error) => {
    die(error && error.message ? error.message : String(error));
  });
}

module.exports = {
  createChecklist,
  parseCliArgs,
  renderChecklistMarkdown,
  reservePort,
  runVisualUat,
  sanitizeSlug,
};
