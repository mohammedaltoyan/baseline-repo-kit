/* global fetch */

const state = {
  payload: null,
  config: null,
  dirty: false,
};

const CAPABILITY_MAP = {
  'branching.topology': 'rulesets',
  'branching.review_thresholds': 'rulesets',
  'ci.mode': 'merge_queue',
  'ci.change_profiles': 'merge_queue',
  'deployments.approval_matrix': 'environments',
  'security.codeql': 'code_scanning',
  'security.dependency_review': 'dependency_review',
  'policy.require_github_app': 'github_app_required',
};

function $(id) {
  return document.getElementById(id);
}

function logOutput(value) {
  $('output').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function getPath(obj, path) {
  const parts = String(path || '').split('.').filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function setPath(obj, path, value) {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) return;
  let current = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!current[key] || typeof current[key] !== 'object') current[key] = {};
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
}

function capabilityLabel(path) {
  const key = CAPABILITY_MAP[path];
  if (!key) return { text: 'Not capability-gated', className: '' };

  const cap = state.payload && state.payload.capabilities && state.payload.capabilities.capabilities
    ? state.payload.capabilities.capabilities[key]
    : null;

  if (!cap) return { text: 'Capability unknown', className: 'cap-warn' };
  if (cap.supported === true) return { text: `Supported (${key})`, className: 'cap-ok' };
  if (cap.state === 'unsupported') return { text: `Unsupported (${key})`, className: 'cap-error' };
  return { text: `Unknown support (${key})`, className: 'cap-warn' };
}

function parseTypedValue(raw, currentValue) {
  if (typeof currentValue === 'boolean') {
    return !!raw;
  }

  if (typeof currentValue === 'number') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : currentValue;
  }

  if (Array.isArray(currentValue) || (currentValue && typeof currentValue === 'object')) {
    try {
      return JSON.parse(String(raw || ''));
    } catch {
      return currentValue;
    }
  }

  return String(raw || '');
}

function renderRepoSummary() {
  const payload = state.payload || {};
  const repo = payload.capabilities && payload.capabilities.repository ? payload.capabilities.repository : {};
  const maintainerCount = payload.capabilities && payload.capabilities.collaborators
    ? payload.capabilities.collaborators.maintainer_count
    : 0;

  $('repoSummary').innerHTML = [
    `<div><strong>Target:</strong> ${payload.target || '<unknown>'}</div>`,
    `<div><strong>Repository:</strong> ${repo.owner || '?'} / ${repo.repo || '?'}</div>`,
    `<div><strong>Owner type:</strong> ${repo.owner_type || 'unknown'}</div>`,
    `<div><strong>Maintainers:</strong> ${maintainerCount}</div>`,
    `<div><strong>Engine:</strong> ${payload.engine_version || '2.2.0'}</div>`,
  ].join('');
}

function renderCapabilities() {
  const capabilities = state.payload && state.payload.capabilities && state.payload.capabilities.capabilities
    ? state.payload.capabilities.capabilities
    : {};

  const entries = Object.entries(capabilities);
  if (!entries.length) {
    $('capabilities').textContent = 'No capability probe data available.';
    return;
  }

  $('capabilities').innerHTML = entries
    .map(([key, value]) => {
      const cls = value.supported ? 'cap-ok' : value.state === 'unsupported' ? 'cap-error' : 'cap-warn';
      return `<div class="${cls}"><strong>${key}</strong>: ${value.state} (${value.reason})</div>`;
    })
    .join('');
}

function createInput(path, value, onChange) {
  if (typeof value === 'boolean') {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => onChange(input.checked));
    return input;
  }

  if (typeof value === 'number') {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value);
    input.addEventListener('change', () => onChange(parseTypedValue(input.value, value)));
    return input;
  }

  if (Array.isArray(value) || (value && typeof value === 'object')) {
    const textarea = document.createElement('textarea');
    textarea.value = JSON.stringify(value, null, 2);
    textarea.addEventListener('change', () => {
      const next = parseTypedValue(textarea.value, value);
      textarea.value = JSON.stringify(next, null, 2);
      onChange(next);
    });
    return textarea;
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.value = value == null ? '' : String(value);
  input.addEventListener('change', () => onChange(input.value));
  return input;
}

function renderSettings() {
  const metadata = state.payload && state.payload.ui_metadata ? state.payload.ui_metadata : null;
  const container = $('settingsContainer');
  container.innerHTML = '';

  if (!metadata || !metadata.sections || !metadata.fields) {
    container.textContent = 'UI metadata unavailable.';
    return;
  }

  const grouped = new Map();
  for (const [path, fieldMeta] of Object.entries(metadata.fields)) {
    const section = fieldMeta.section || 'other';
    if (!grouped.has(section)) grouped.set(section, []);
    grouped.get(section).push({ path, meta: fieldMeta });
  }

  for (const section of metadata.sections) {
    const block = document.createElement('article');
    block.className = 'section';

    const header = document.createElement('header');
    header.innerHTML = `<h4>${section.title}</h4><p>${section.description || ''}</p>`;
    block.appendChild(header);

    const fields = grouped.get(section.id) || [];
    for (const entry of fields) {
      const current = getPath(state.config, entry.path);
      if (typeof current === 'undefined') continue;

      const row = document.createElement('div');
      row.className = 'field';

      const label = document.createElement('label');
      label.textContent = entry.path;
      row.appendChild(label);

      const input = createInput(entry.path, current, (next) => {
        setPath(state.config, entry.path, next);
        state.dirty = true;
      });
      row.appendChild(input);

      const capability = capabilityLabel(entry.path);
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = [
        `<div><strong>What:</strong> ${entry.meta.what_this_controls || ''}</div>`,
        `<div><strong>Why:</strong> ${entry.meta.why_it_matters || ''}</div>`,
        `<div><strong>Default:</strong> ${entry.meta.default_behavior || ''}</div>`,
        `<div><strong>Tradeoffs:</strong> ${entry.meta.tradeoffs || ''}</div>`,
        `<div><strong>Prerequisites:</strong> ${entry.meta.prerequisites || ''}</div>`,
        `<div><strong>Apply impact:</strong> ${entry.meta.apply_impact || ''}</div>`,
        `<div class="${capability.className}"><strong>Detected support:</strong> ${capability.text}</div>`,
      ].join('');
      row.appendChild(meta);

      block.appendChild(row);
    }

    container.appendChild(block);
  }
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload && payload.error ? payload.error : `Request failed (${res.status})`);
  }
  return payload;
}

async function loadState() {
  state.payload = await api('GET', '/api/state');
  state.config = JSON.parse(JSON.stringify(state.payload.config || {}));
  state.dirty = false;
  renderRepoSummary();
  renderCapabilities();
  renderSettings();
  logOutput({ status: 'ready', target: state.payload.target, change_count: state.payload.changes.length });
}

async function saveSettings() {
  await api('POST', '/api/config', { config: state.config });
  state.dirty = false;
  await loadState();
  logOutput({ status: 'saved' });
}

async function previewDiff() {
  if (state.dirty) await saveSettings();
  const payload = await api('POST', '/api/diff', {});
  logOutput(payload);
}

async function runDoctor() {
  if (state.dirty) await saveSettings();
  const payload = await api('POST', '/api/doctor', {});
  logOutput(payload);
}

async function applyChanges() {
  if (state.dirty) await saveSettings();
  const payload = await api('POST', '/api/apply', {});
  logOutput(payload);
}

async function boot() {
  $('refreshBtn').addEventListener('click', () => loadState().catch((error) => logOutput({ error: error.message })));
  $('saveBtn').addEventListener('click', () => saveSettings().catch((error) => logOutput({ error: error.message })));
  $('diffBtn').addEventListener('click', () => previewDiff().catch((error) => logOutput({ error: error.message })));
  $('doctorBtn').addEventListener('click', () => runDoctor().catch((error) => logOutput({ error: error.message })));
  $('applyBtn').addEventListener('click', () => applyChanges().catch((error) => logOutput({ error: error.message })));

  await loadState();
}

boot().catch((error) => logOutput({ error: error.message }));
