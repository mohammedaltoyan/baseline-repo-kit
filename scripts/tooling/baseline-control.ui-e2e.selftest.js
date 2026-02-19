/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class MockElement {
  constructor(tagName, id = '') {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.id = String(id || '');
    this.className = '';
    this.value = '';
    this.checked = false;
    this.type = '';
    this.parentNode = null;
    this.children = [];
    this._innerHTML = '';
    this._textContent = '';
    this._listeners = new Map();
  }

  set innerHTML(value) {
    this._innerHTML = String(value == null ? '' : value);
    this.children = [];
  }

  get innerHTML() {
    if (this.children.length === 0) return this._innerHTML;
    const childText = this.children.map((child) => child.textContent || child.innerHTML || '').join('');
    return `${this._innerHTML}${childText}`;
  }

  set textContent(value) {
    this._textContent = String(value == null ? '' : value);
  }

  get textContent() {
    if (this._textContent) return this._textContent;
    if (this.children.length === 0) return '';
    return this.children.map((child) => child.textContent || child.innerHTML || '').join('');
  }

  appendChild(child) {
    if (!child || typeof child !== 'object') return child;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    const key = String(type || '').trim();
    if (!key || typeof handler !== 'function') return;
    const list = this._listeners.get(key) || [];
    list.push(handler);
    this._listeners.set(key, list);
  }

  dispatchEvent(event) {
    const type = String(event && event.type || '').trim();
    if (!type) return true;
    const list = this._listeners.get(type) || [];
    for (const handler of list) {
      handler({
        type,
        target: this,
      });
    }
    return true;
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this });
  }

  triggerChange() {
    this.dispatchEvent({ type: 'change', target: this });
  }
}

class MockDocument {
  constructor(ids) {
    this.elements = new Map();
    for (const id of ids) {
      this.elements.set(id, new MockElement('div', id));
    }
  }

  getElementById(id) {
    return this.elements.get(String(id || '')) || null;
  }

  createElement(tagName) {
    return new MockElement(tagName);
  }
}

function jsonResponse(status, payload) {
  return {
    ok: Number(status) >= 200 && Number(status) < 300,
    status: Number(status),
    async json() {
      return payload;
    },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function listCalls(calls, method, pathname) {
  return calls.filter((entry) => entry.method === method && entry.pathname === pathname);
}

function findFirstByTag(root, tagName) {
  const stack = [root];
  const normalized = String(tagName || '').toUpperCase();
  while (stack.length > 0) {
    const node = stack.shift();
    if (!node || typeof node !== 'object') continue;
    if (String(node.tagName || '') === normalized) return node;
    if (Array.isArray(node.children) && node.children.length > 0) {
      stack.unshift(...node.children);
    }
  }
  return null;
}

function findProfileInput(settingsRoot) {
  const rows = Array.isArray(settingsRoot && settingsRoot.children) ? settingsRoot.children : [];
  for (const section of rows) {
    const fields = Array.isArray(section && section.children) ? section.children : [];
    for (const field of fields) {
      const nodes = Array.isArray(field && field.children) ? field.children : [];
      const label = nodes.find((node) => String(node && node.tagName || '') === 'LABEL');
      if (!label || String(label.textContent || '').trim() !== 'policy.profile') continue;
      return nodes.find((node) => String(node && node.tagName || '') === 'INPUT' && String(node.type || '') === 'text') || null;
    }
  }
  return null;
}

function statusForTarget(targetPath) {
  const target = String(targetPath || '').trim();
  if (target.endsWith('.txt')) {
    return {
      resolved_target: target,
      exists: true,
      is_directory: false,
      writable: false,
      parent_writable: true,
      reason: 'target_exists_but_not_directory',
    };
  }
  if (target.startsWith('/readonly/')) {
    return {
      resolved_target: target,
      exists: false,
      is_directory: false,
      writable: false,
      parent_writable: false,
      reason: 'target_not_writable',
    };
  }
  return {
    resolved_target: target,
    exists: true,
    is_directory: true,
    writable: true,
    parent_writable: true,
    reason: 'ok',
  };
}

async function flush(cycles = 12) {
  for (let i = 0; i < cycles; i += 1) {
    // objectives:allow LOCALHOST Justification: event-loop flush helper for hermetic UI selftest scheduling.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function run() {
  const ids = [
    'targetInput',
    'profileInput',
    'setTargetBtn',
    'refreshCapsBtn',
    'dryRunToggle',
    'applyDirectToggle',
    'upgradeVersionInput',
    'initBtn',
    'refreshBtn',
    'saveBtn',
    'diffBtn',
    'doctorBtn',
    'verifyBtn',
    'upgradeBtn',
    'applyBtn',
    'operationsCatalog',
    'sessionSummary',
    'repoSummary',
    'governanceSummary',
    'capabilities',
    'settingsContainer',
    'output',
  ];

  const document = new MockDocument(ids);
  document.getElementById('output').tagName = 'PRE';
  document.getElementById('dryRunToggle').type = 'checkbox';
  document.getElementById('applyDirectToggle').type = 'checkbox';
  document.getElementById('targetInput').type = 'text';
  document.getElementById('profileInput').type = 'text';
  document.getElementById('upgradeVersionInput').type = 'text';

  const runtime = {
    session: {
      target_input: '/tmp/repo-a',
      target: '/tmp/repo-a',
      profile: '',
    },
    target_status: statusForTarget('/tmp/repo-a'),
    config: {
      policy: { profile: 'strict' },
      updates: { apply_mode: 'pr_first', auto_pr: true },
    },
    fail_next_doctor: false,
  };

  const operations = [
    { id: 'init', method: 'POST', path: '/api/init', description: 'Initialize baseline files for current target.' },
    { id: 'diff', method: 'POST', path: '/api/diff', description: 'Preview generated managed-file changes.' },
    { id: 'doctor', method: 'POST', path: '/api/doctor', description: 'Validate config and capability compatibility.' },
    { id: 'verify', method: 'POST', path: '/api/verify', description: 'Run doctor + diff integrity checks.' },
    { id: 'apply', method: 'POST', path: '/api/apply', description: 'Apply generated changes.', options: ['dry_run', 'direct'] },
    { id: 'upgrade', method: 'POST', path: '/api/upgrade', description: 'Run migrations and apply managed updates.', options: ['dry_run', 'target_version'] },
    { id: 'refresh_capabilities', method: 'POST', path: '/api/refresh-capabilities', description: 'Refresh capability probe.' },
    { id: 'save_config', method: 'POST', path: '/api/config', description: 'Persist normalized config from UI edits.' },
    { id: 'session', method: 'POST', path: '/api/session', description: 'Set target path/profile for UI operations.' },
  ];

  function buildStatePayload() {
    return {
      target: runtime.session.target,
      engine_version: '2.2.0',
      schema: { type: 'object' },
      ui_metadata: {
        sections: [
          { id: 'platform', title: 'Platform', description: 'Platform settings.' },
        ],
        fields: {
          'policy.profile': {
            section: 'platform',
            what_this_controls: 'Policy profile.',
            why_it_matters: 'Defines baseline policy strictness.',
            default_behavior: 'strict',
            tradeoffs: 'Stricter defaults increase safety.',
            prerequisites: 'None.',
            apply_impact: 'Generated outputs and checks may change.',
            fallback_or_remediation: 'Run doctor when unsupported features degrade.',
            capability_key: '',
          },
        },
      },
      config: clone(runtime.config),
      effective_config: clone(runtime.config),
      effective_overrides: [],
      capabilities: {
        repository: {
          owner: 'example-owner',
          repo: 'example-repo',
          private: true,
        },
        auth: {
          viewer_login: 'example-user',
          token_source: 'env',
        },
        runtime: {
          github_app: {
            effective_required: false,
          },
        },
        capabilities: {},
      },
      changes: [],
      modules: [],
      module_evaluation: { modules: [] },
      insights: {
        capability: {
          owner_type: 'User',
          repository_visibility: 'private',
          viewer_login: 'example-user',
          repo_admin: true,
          token_source: 'env',
          token_scope_count: 4,
          maintainer_count: 1,
          role_counts: { admin: 1, maintain: 0, write: 0 },
        },
        entitlements: {
          features: [],
        },
        reviewer: {
          maintainer_count: 1,
          active_bucket: 'solo',
          active_reason: 'maintainers<=1',
          policy: {
            required_non_author_approvals: 0,
            require_strict_ci: true,
            require_codeowners: false,
          },
          threshold_rows: [],
        },
        branching: {
          topology: 'two_branch',
          source: 'preset',
          branch_count: 2,
          protected_count: 2,
          role_counts: { integration: 1, production: 1 },
        },
        deployments: {
          matrix: {
            healthy: true,
            missing_rows: [],
            stale_rows: [],
            duplicate_row_keys: [],
            actual_rows: 1,
            expected_rows: 1,
          },
          approval_required_rows: 1,
          enforcement: {
            mode: 'required',
            reason: 'policy',
            entitlement_state: 'supported',
          },
          rows_by_environment: [],
          rows_by_component: [],
        },
        github_app: {
          status: 'not_required',
          effective_required: false,
          reason: 'capabilities_sufficient',
        },
        capability_matrix: [],
      },
      warnings: [],
    };
  }

  const calls = [];

  async function fetchMock(url, options = {}) {
    const method = String(options.method || 'GET').toUpperCase();
    // objectives:allow LOCALHOST Justification: hermetic UI flow selftest parses relative URLs against loopback origin.
    const parsedUrl = new URL(String(url || '/'), 'http://127.0.0.1:4173');
    const pathname = parsedUrl.pathname;
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ method, pathname, body });

    if (pathname === '/api/operations' && method === 'GET') {
      return jsonResponse(200, { operations: clone(operations) });
    }

    if (pathname === '/api/session' && method === 'GET') {
      return jsonResponse(200, {
        session: clone(runtime.session),
        target_status: clone(runtime.target_status),
      });
    }

    if (pathname === '/api/session' && method === 'POST') {
      if (body && Object.prototype.hasOwnProperty.call(body, 'target')) {
        runtime.session.target_input = String(body.target || '').trim();
        runtime.session.target = runtime.session.target_input || runtime.session.target;
        runtime.target_status = statusForTarget(runtime.session.target);
      }
      if (body && Object.prototype.hasOwnProperty.call(body, 'profile')) {
        runtime.session.profile = String(body.profile || '').trim();
      }
      return jsonResponse(200, {
        ok: true,
        session: clone(runtime.session),
        target_status: clone(runtime.target_status),
      });
    }

    if (pathname === '/api/state' && method === 'GET') {
      return jsonResponse(200, buildStatePayload());
    }

    if (pathname === '/api/config' && method === 'POST') {
      runtime.config = clone(body && body.config || runtime.config);
      return jsonResponse(200, { ok: true });
    }

    if (pathname === '/api/init' && method === 'POST') {
      return jsonResponse(200, {
        command: 'init',
        target: runtime.session.target,
      });
    }

    if (pathname === '/api/diff' && method === 'POST') {
      return jsonResponse(200, {
        command: 'diff',
        target: runtime.session.target,
      });
    }

    if (pathname === '/api/doctor' && method === 'POST') {
      if (runtime.fail_next_doctor) {
        runtime.fail_next_doctor = false;
        return jsonResponse(500, { error: 'doctor_failed' });
      }
      return jsonResponse(200, {
        command: 'doctor',
        target: runtime.session.target,
      });
    }

    if (pathname === '/api/verify' && method === 'POST') {
      return jsonResponse(200, {
        command: 'verify',
        target: runtime.session.target,
      });
    }

    if (pathname === '/api/upgrade' && method === 'POST') {
      return jsonResponse(200, {
        command: 'upgrade',
        target: runtime.session.target,
        dry_run: !!(body && body.dry_run),
        target_version: body && body.target_version || '',
      });
    }

    if (pathname === '/api/apply' && method === 'POST') {
      return jsonResponse(200, {
        command: 'apply',
        target: runtime.session.target,
        dry_run: !!(body && body.dry_run),
        apply_mode: body && body.direct ? 'direct' : 'pr_first',
      });
    }

    if (pathname === '/api/refresh-capabilities' && method === 'POST') {
      return jsonResponse(200, buildStatePayload());
    }

    return jsonResponse(404, { error: 'unexpected_route' });
  }

  const context = {
    document,
    fetch: fetchMock,
    console,
    setTimeout,
    clearTimeout,
    setImmediate,
    Promise,
    URL,
    JSON,
  };
  context.globalThis = context;

  const appPath = path.join(process.cwd(), 'apps', 'baseline-control', 'app.js');
  const source = fs.readFileSync(appPath, 'utf8');
  vm.createContext(context);
  vm.runInContext(source, context, { filename: appPath });

  await flush();

  assert.strictEqual(listCalls(calls, 'GET', '/api/operations').length >= 1, true, 'boot should load operations catalog');
  assert.strictEqual(listCalls(calls, 'GET', '/api/session').length >= 1, true, 'boot should load session state');
  assert.strictEqual(listCalls(calls, 'GET', '/api/state').length >= 1, true, 'boot should load runtime state');
  assert.strictEqual(document.getElementById('operationsCatalog').innerHTML.includes('/api/apply'), true);

  document.getElementById('targetInput').value = '/tmp/repo-b';
  document.getElementById('profileInput').value = 'strict';
  document.getElementById('setTargetBtn').click();
  await flush();

  assert.strictEqual(runtime.session.target, '/tmp/repo-b', 'connect target should update session target');
  assert.strictEqual(runtime.session.profile, 'strict', 'connect target should update session profile');
  assert.strictEqual(document.getElementById('sessionSummary').innerHTML.includes('/tmp/repo-b'), true);

  document.getElementById('targetInput').value = '/tmp/config-file.txt';
  document.getElementById('setTargetBtn').click();
  await flush();
  assert.strictEqual(
    document.getElementById('sessionSummary').innerHTML.includes('target_exists_but_not_directory'),
    true,
    'session summary should surface non-directory target error state'
  );

  document.getElementById('targetInput').value = '/tmp/repo-c';
  document.getElementById('setTargetBtn').click();
  await flush();

  const settingsRoot = document.getElementById('settingsContainer');
  const policyProfileInput = findProfileInput(settingsRoot) || findFirstByTag(settingsRoot, 'INPUT');
  assert.ok(policyProfileInput, 'settings should render editable inputs');
  policyProfileInput.value = 'relaxed';
  policyProfileInput.triggerChange();

  document.getElementById('dryRunToggle').checked = true;
  document.getElementById('applyDirectToggle').checked = true;
  document.getElementById('applyBtn').click();
  await flush();

  const configCalls = listCalls(calls, 'POST', '/api/config');
  assert.strictEqual(configCalls.length >= 1, true, 'dirty config should auto-save before apply');
  const latestConfig = configCalls[configCalls.length - 1];
  assert.strictEqual(String(latestConfig.body.config.policy.profile), 'relaxed', 'saved config should include edited UI value');

  const applyCalls = listCalls(calls, 'POST', '/api/apply');
  assert.strictEqual(applyCalls.length >= 1, true, 'apply action should call /api/apply');
  const latestApply = applyCalls[applyCalls.length - 1];
  assert.strictEqual(!!latestApply.body.dry_run, true, 'apply should pass dry_run toggle');
  assert.strictEqual(!!latestApply.body.direct, true, 'apply should pass direct toggle');

  document.getElementById('upgradeVersionInput').value = '3.0.0';
  document.getElementById('upgradeBtn').click();
  await flush();
  const upgradeCalls = listCalls(calls, 'POST', '/api/upgrade');
  assert.strictEqual(upgradeCalls.length >= 1, true, 'upgrade action should call /api/upgrade');
  assert.strictEqual(String(upgradeCalls[upgradeCalls.length - 1].body.target_version), '3.0.0');

  document.getElementById('verifyBtn').click();
  await flush();
  assert.strictEqual(listCalls(calls, 'POST', '/api/verify').length >= 1, true, 'verify action should call /api/verify');

  document.getElementById('initBtn').click();
  await flush();
  assert.strictEqual(listCalls(calls, 'POST', '/api/init').length >= 1, true, 'init action should call /api/init');

  document.getElementById('diffBtn').click();
  await flush();
  assert.strictEqual(listCalls(calls, 'POST', '/api/diff').length >= 1, true, 'diff action should call /api/diff');

  document.getElementById('refreshCapsBtn').click();
  await flush();
  assert.strictEqual(
    listCalls(calls, 'POST', '/api/refresh-capabilities').length >= 1,
    true,
    'refresh capabilities action should call /api/refresh-capabilities'
  );

  runtime.fail_next_doctor = true;
  document.getElementById('doctorBtn').click();
  await flush();
  assert.strictEqual(
    document.getElementById('output').textContent.includes('doctor_failed'),
    true,
    'doctor errors should be surfaced in UI output panel'
  );

  console.log('[baseline-control:ui-e2e-selftest] OK');
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  run,
};
