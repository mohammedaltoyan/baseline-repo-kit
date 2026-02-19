/* global fetch */

const state = {
  payload: null,
  config: null,
  dirty: false,
};

const DEFAULT_FIELD_META = {
  section: 'platform',
  what_this_controls: 'Configuration value in baseline settings.',
  why_it_matters: 'This value influences generated policy/workflow behavior.',
  default_behavior: 'Inherited from baseline defaults unless overridden.',
  tradeoffs: 'Adjust to fit your repository governance and delivery needs.',
  prerequisites: 'None.',
  apply_impact: 'Applying regenerates managed baseline outputs.',
  fallback_or_remediation: 'If unsupported by detected capabilities, run doctor for remediation guidance.',
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

function capabilityLabel(capabilityKey) {
  const key = String(capabilityKey || '').trim();
  if (!key) return { text: 'Not capability-gated', className: '', key: '' };

  const cap = state.payload && state.payload.capabilities && state.payload.capabilities.capabilities
    ? state.payload.capabilities.capabilities[key]
    : null;

  if (!cap) return { text: 'Capability unknown', className: 'cap-warn', key };
  if (cap.supported === true) return { text: `Supported (${key})`, className: 'cap-ok', key };
  if (cap.state === 'unsupported') return { text: `Unsupported (${key})`, className: 'cap-error', key };
  return { text: `Unknown support (${key})`, className: 'cap-warn', key };
}

function listConfigLeafPaths(value, prefix = '') {
  if (Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return prefix ? [prefix] : [];
    let out = [];
    for (const key of keys) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      out = out.concat(listConfigLeafPaths(value[key], nextPrefix));
    }
    return out;
  }

  return prefix ? [prefix] : [];
}

function lookupFieldMeta(fields, path) {
  const map = fields && typeof fields === 'object' ? fields : {};
  const cleanPath = String(path || '').trim();
  if (!cleanPath) {
    return {
      path: '',
      inherited: false,
      meta: DEFAULT_FIELD_META,
    };
  }

  if (map[cleanPath]) {
    return {
      path: cleanPath,
      inherited: false,
      meta: map[cleanPath],
    };
  }

  const parts = cleanPath.split('.');
  while (parts.length > 1) {
    parts.pop();
    const candidate = parts.join('.');
    if (!map[candidate]) continue;
    return {
      path: candidate,
      inherited: true,
      meta: map[candidate],
    };
  }

  return {
    path: '',
    inherited: false,
    meta: DEFAULT_FIELD_META,
  };
}

function formatValue(value) {
  if (value == null) return '<empty>';
  if (typeof value === 'string') return value || '<empty>';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function capabilityRemediation(capabilityKey) {
  const modules = state.payload && state.payload.capabilities && state.payload.capabilities.runtime
    ? state.payload.capabilities.runtime.modules
    : [];
  for (const entry of (Array.isArray(modules) ? modules : [])) {
    for (const missing of (Array.isArray(entry.missing) ? entry.missing : [])) {
      if (String(missing.capability) !== String(capabilityKey)) continue;
      if (missing.remediation) return missing.remediation;
    }
  }
  return '';
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
  const auth = payload.capabilities && payload.capabilities.auth ? payload.capabilities.auth : {};
  const permissions = payload.capabilities && payload.capabilities.repository
    ? payload.capabilities.repository.permissions || {}
    : {};
  const scopeCount = Array.isArray(auth.token_scopes) ? auth.token_scopes.length : 0;
  const githubApp = payload.capabilities && payload.capabilities.runtime && payload.capabilities.runtime.github_app
    ? payload.capabilities.runtime.github_app
    : {};
  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];

  $('repoSummary').innerHTML = [
    `<div><strong>Target:</strong> ${payload.target || '<unknown>'}</div>`,
    `<div><strong>Repository:</strong> ${repo.owner || '?'} / ${repo.repo || '?'}</div>`,
    `<div><strong>Owner type:</strong> ${repo.owner_type || 'unknown'}</div>`,
    `<div><strong>Viewer:</strong> ${auth.viewer_login || 'unknown'}</div>`,
    `<div><strong>Repo admin:</strong> ${permissions.admin ? 'yes' : 'no'}</div>`,
    `<div><strong>Token scopes:</strong> ${scopeCount}</div>`,
    `<div><strong>Maintainers:</strong> ${maintainerCount}</div>`,
    `<div><strong>GitHub App required:</strong> ${githubApp.effective_required ? 'yes' : 'no'}</div>`,
    `<div><strong>Warnings:</strong> ${warnings.length}</div>`,
    `<div><strong>Engine:</strong> ${payload.engine_version || '2.2.0'}</div>`,
  ].join('');
}

function renderGovernanceSummary() {
  const payload = state.payload || {};
  const insights = payload.insights && typeof payload.insights === 'object' ? payload.insights : {};
  const reviewer = insights.reviewer && typeof insights.reviewer === 'object' ? insights.reviewer : {};
  const reviewerPolicy = reviewer.policy && typeof reviewer.policy === 'object' ? reviewer.policy : {};
  const branching = insights.branching && typeof insights.branching === 'object' ? insights.branching : {};
  const deployments = insights.deployments && typeof insights.deployments === 'object' ? insights.deployments : {};
  const matrix = deployments.matrix && typeof deployments.matrix === 'object' ? deployments.matrix : {};
  const githubApp = insights.github_app && typeof insights.github_app === 'object' ? insights.github_app : {};

  const matrixHealth = matrix.healthy
    ? 'healthy'
    : `issues (missing=${Array.isArray(matrix.missing_rows) ? matrix.missing_rows.length : 0}, stale=${Array.isArray(matrix.stale_rows) ? matrix.stale_rows.length : 0}, duplicate=${Array.isArray(matrix.duplicate_row_keys) ? matrix.duplicate_row_keys.length : 0})`;

  $('governanceSummary').innerHTML = [
    `<div><strong>Reviewer bucket:</strong> ${reviewer.active_bucket || 'unknown'}</div>`,
    `<div><strong>Required approvals:</strong> ${typeof reviewerPolicy.required_non_author_approvals === 'number' ? reviewerPolicy.required_non_author_approvals : 0}</div>`,
    `<div><strong>Strict CI required:</strong> ${reviewerPolicy.require_strict_ci ? 'yes' : 'no'}</div>`,
    `<div><strong>CODEOWNERS required:</strong> ${reviewerPolicy.require_codeowners ? 'yes' : 'no'}</div>`,
    `<div><strong>Branch topology:</strong> ${branching.topology || 'unknown'} (${branching.source || 'unknown'})</div>`,
    `<div><strong>Branch count:</strong> ${typeof branching.branch_count === 'number' ? branching.branch_count : 0}</div>`,
    `<div><strong>Deployment matrix:</strong> ${matrixHealth}</div>`,
    `<div><strong>Matrix rows:</strong> ${typeof matrix.actual_rows === 'number' ? matrix.actual_rows : 0} / ${typeof matrix.expected_rows === 'number' ? matrix.expected_rows : 0}</div>`,
    `<div><strong>GitHub App effective requirement:</strong> ${githubApp.effective_required ? 'required' : 'not required'}</div>`,
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
      const remediation = capabilityRemediation(key);
      const remediationLine = remediation ? ` | remediation: ${remediation}` : '';
      return `<div class="${cls}"><strong>${key}</strong>: ${value.state} (${value.reason})${remediationLine}</div>`;
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

  const leafPaths = listConfigLeafPaths(state.config)
    .filter((path) => typeof getPath(state.config, path) !== 'undefined')
    .sort((a, b) => a.localeCompare(b));

  const grouped = new Map();
  for (const path of leafPaths) {
    const resolved = lookupFieldMeta(metadata.fields, path);
    const section = resolved.meta && resolved.meta.section ? resolved.meta.section : 'platform';
    if (!grouped.has(section)) grouped.set(section, []);
    grouped.get(section).push({
      path,
      meta: resolved.meta || DEFAULT_FIELD_META,
      metaPath: resolved.path,
      inheritedMeta: !!resolved.inherited,
      capabilityKey: String(resolved.meta && resolved.meta.capability_key || '').trim(),
    });
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

      const capability = capabilityLabel(entry.capabilityKey);
      const remediation = capabilityRemediation(capability.key);
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = [
        `<div><strong>What:</strong> ${entry.meta.what_this_controls || ''}</div>`,
        `<div><strong>Why:</strong> ${entry.meta.why_it_matters || ''}</div>`,
        `<div><strong>Default:</strong> ${entry.meta.default_behavior || ''}</div>`,
        `<div><strong>Effective value:</strong> ${formatValue(current)}</div>`,
        `<div><strong>Tradeoffs:</strong> ${entry.meta.tradeoffs || ''}</div>`,
        `<div><strong>Prerequisites:</strong> ${entry.meta.prerequisites || ''}</div>`,
        `<div><strong>Apply impact:</strong> ${entry.meta.apply_impact || ''}</div>`,
        entry.inheritedMeta ? `<div><strong>Explanation source:</strong> ${entry.metaPath}</div>` : '',
        `<div class="${capability.className}"><strong>Detected support:</strong> ${capability.text}</div>`,
        `<div><strong>Fallback/remediation:</strong> ${entry.meta.fallback_or_remediation || remediation || 'No fallback required when supported. See capability panel when unsupported.'}</div>`,
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
  renderGovernanceSummary();
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
