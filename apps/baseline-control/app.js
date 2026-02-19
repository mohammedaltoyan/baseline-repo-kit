/* global fetch */

const state = {
  payload: null,
  config: null,
  dirty: false,
  session: null,
  targetStatus: null,
  operations: [],
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

function currentActionOptions() {
  return {
    dry_run: !!($('dryRunToggle') && $('dryRunToggle').checked),
    direct: !!($('applyDirectToggle') && $('applyDirectToggle').checked),
    target_version: String(($('upgradeVersionInput') && $('upgradeVersionInput').value) || '').trim(),
  };
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

function effectiveOverrideByPath(path) {
  const overrides = state.payload && Array.isArray(state.payload.effective_overrides)
    ? state.payload.effective_overrides
    : [];
  return overrides.find((entry) => String(entry && entry.path || '') === String(path || '')) || null;
}

function effectiveValueForPath(path, fallbackValue) {
  const effectiveConfig = state.payload && state.payload.effective_config && typeof state.payload.effective_config === 'object'
    ? state.payload.effective_config
    : null;
  if (!effectiveConfig) return fallbackValue;
  const resolved = getPath(effectiveConfig, path);
  return typeof resolved === 'undefined' ? fallbackValue : resolved;
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

function formatRoleCounts(value) {
  const source = value && typeof value === 'object' ? value : {};
  return `admin=${Number(source.admin || 0)}, maintain=${Number(source.maintain || 0)}, write=${Number(source.write || 0)}`;
}

function syncSessionInputs() {
  const session = state.session && typeof state.session === 'object' ? state.session : {};
  if ($('targetInput')) $('targetInput').value = session.target_input || session.target || '';
  if ($('profileInput')) $('profileInput').value = session.profile || '';
}

function renderSessionSummary() {
  const session = state.session && typeof state.session === 'object' ? state.session : {};
  const targetStatus = state.targetStatus && typeof state.targetStatus === 'object' ? state.targetStatus : {};

  $('sessionSummary').innerHTML = [
    `<div><strong>Configured target:</strong> ${session.target_input || '<unset>'}</div>`,
    `<div><strong>Resolved target:</strong> ${targetStatus.resolved_target || session.target || '<unknown>'}</div>`,
    `<div><strong>Profile:</strong> ${session.profile || 'standard'}</div>`,
    `<div><strong>Exists:</strong> ${targetStatus.exists ? 'yes' : 'no'}</div>`,
    `<div><strong>Directory:</strong> ${targetStatus.is_directory ? 'yes' : targetStatus.exists ? 'no' : 'n/a'}</div>`,
    `<div><strong>Writable:</strong> ${targetStatus.writable ? 'yes' : 'no'} (parent=${targetStatus.parent_writable ? 'yes' : 'no'})</div>`,
    `<div><strong>Status:</strong> ${targetStatus.reason || 'unknown'}</div>`,
  ].join('');
}

function renderOperationsCatalog() {
  const list = Array.isArray(state.operations) ? state.operations : [];
  if (!list.length) {
    $('operationsCatalog').innerHTML = '<div>Operation catalog unavailable.</div>';
    return;
  }

  $('operationsCatalog').innerHTML = list.map((operation) => {
    const id = String(operation && operation.id || '').trim() || '<unknown>';
    const method = String(operation && operation.method || '').trim() || 'POST';
    const path = String(operation && operation.path || '').trim() || '/api/<unknown>';
    const description = String(operation && operation.description || '').trim() || 'No description.';
    const options = Array.isArray(operation && operation.options) && operation.options.length
      ? ` | options: ${operation.options.join(', ')}`
      : '';
    return `<div><strong>${id}</strong>: ${method} ${path} - ${description}${options}</div>`;
  }).join('');
}

function renderThresholdRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return '<div>Threshold matrix unavailable.</div>';
  return list.map((row) => {
    const policy = row && row.policy && typeof row.policy === 'object' ? row.policy : {};
    return [
      '<div>',
      `<strong>${row.applies ? '* ' : ''}${row.label || row.bucket || 'bucket'}</strong> (${row.maintainer_range || '?'})`,
      `: approvals=${Number(policy.required_non_author_approvals || 0)}, strict_ci=${policy.require_strict_ci ? 'yes' : 'no'}, codeowners=${policy.require_codeowners ? 'yes' : 'no'}`,
      '</div>',
    ].join('');
  }).join('');
}

function renderBreakdownRows(rows, key) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return '<div>None</div>';
  return list.map((row) => {
    const name = String(row && row[key] || '?');
    const totalRows = Number(row && row.total_rows || 0);
    const approvalRows = Number(row && row.approval_required_rows || 0);
    const maxApprovers = Number(row && row.max_min_approvers || 0);
    return `<div><strong>${name}</strong>: rows=${totalRows}, approvals=${approvalRows}, max_approvers=${maxApprovers}</div>`;
  }).join('');
}

function renderRepoSummary() {
  const payload = state.payload || {};
  const insights = payload.insights && typeof payload.insights === 'object' ? payload.insights : {};
  const capability = insights.capability && typeof insights.capability === 'object' ? insights.capability : {};
  const entitlements = insights.entitlements && typeof insights.entitlements === 'object' ? insights.entitlements : {};
  const entitlementFeatures = Array.isArray(entitlements.features) ? entitlements.features : [];
  const advisoryFeatures = entitlementFeatures.filter((entry) => String(entry && entry.state) !== 'likely_supported').length;
  const repo = payload.capabilities && payload.capabilities.repository ? payload.capabilities.repository : {};
  const auth = payload.capabilities && payload.capabilities.auth ? payload.capabilities.auth : {};
  const githubApp = payload.capabilities && payload.capabilities.runtime && payload.capabilities.runtime.github_app
    ? payload.capabilities.runtime.github_app
    : {};
  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];

  $('repoSummary').innerHTML = [
    `<div><strong>Target:</strong> ${payload.target || '<unknown>'}</div>`,
    `<div><strong>Repository:</strong> ${repo.owner || '?'} / ${repo.repo || '?'}</div>`,
    `<div><strong>Owner type:</strong> ${capability.owner_type || repo.owner_type || 'unknown'}</div>`,
    `<div><strong>Visibility:</strong> ${capability.repository_visibility || (repo.private ? 'private' : 'public_or_unknown')}</div>`,
    `<div><strong>Viewer:</strong> ${capability.viewer_login || auth.viewer_login || 'unknown'}</div>`,
    `<div><strong>Repo admin:</strong> ${capability.repo_admin ? 'yes' : 'no'}</div>`,
    `<div><strong>Token source:</strong> ${capability.token_source || auth.token_source || 'unknown'}</div>`,
    `<div><strong>Token scopes:</strong> ${Number(capability.token_scope_count || 0)}</div>`,
    `<div><strong>Maintainers:</strong> ${Number(capability.maintainer_count || 0)}</div>`,
    `<div><strong>Maintainer roles:</strong> ${formatRoleCounts(capability.role_counts)}</div>`,
    `<div><strong>Entitlement advisories:</strong> ${advisoryFeatures} / ${entitlementFeatures.length}</div>`,
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
  const reviewerRows = Array.isArray(reviewer.threshold_rows) ? reviewer.threshold_rows : [];
  const branching = insights.branching && typeof insights.branching === 'object' ? insights.branching : {};
  const deployments = insights.deployments && typeof insights.deployments === 'object' ? insights.deployments : {};
  const matrix = deployments.matrix && typeof deployments.matrix === 'object' ? deployments.matrix : {};
  const githubApp = insights.github_app && typeof insights.github_app === 'object' ? insights.github_app : {};

  const matrixHealth = matrix.healthy
    ? 'healthy'
    : `issues (missing=${Array.isArray(matrix.missing_rows) ? matrix.missing_rows.length : 0}, stale=${Array.isArray(matrix.stale_rows) ? matrix.stale_rows.length : 0}, duplicate=${Array.isArray(matrix.duplicate_row_keys) ? matrix.duplicate_row_keys.length : 0})`;

  $('governanceSummary').innerHTML = [
    `<div><strong>Maintainer count observed:</strong> ${Number(reviewer.maintainer_count || 0)}</div>`,
    `<div><strong>Reviewer bucket:</strong> ${reviewer.active_bucket || 'unknown'}</div>`,
    `<div><strong>Reviewer reason:</strong> ${reviewer.active_reason || 'n/a'}</div>`,
    `<div><strong>Required approvals:</strong> ${typeof reviewerPolicy.required_non_author_approvals === 'number' ? reviewerPolicy.required_non_author_approvals : 0}</div>`,
    `<div><strong>Strict CI required:</strong> ${reviewerPolicy.require_strict_ci ? 'yes' : 'no'}</div>`,
    `<div><strong>CODEOWNERS required:</strong> ${reviewerPolicy.require_codeowners ? 'yes' : 'no'}</div>`,
    `<div><strong>Reviewer threshold matrix:</strong></div>${renderThresholdRows(reviewerRows)}`,
    `<div><strong>Branch topology:</strong> ${branching.topology || 'unknown'} (${branching.source || 'unknown'})</div>`,
    `<div><strong>Branch count:</strong> ${typeof branching.branch_count === 'number' ? branching.branch_count : 0}</div>`,
    `<div><strong>Protected branches:</strong> ${typeof branching.protected_count === 'number' ? branching.protected_count : 0}</div>`,
    `<div><strong>Branch roles:</strong> ${Object.keys(branching.role_counts || {}).length ? formatValue(branching.role_counts) : 'none'}</div>`,
    `<div><strong>Deployment matrix:</strong> ${matrixHealth}</div>`,
    `<div><strong>Matrix rows:</strong> ${typeof matrix.actual_rows === 'number' ? matrix.actual_rows : 0} / ${typeof matrix.expected_rows === 'number' ? matrix.expected_rows : 0}</div>`,
    `<div><strong>Approval-required rows:</strong> ${Number(deployments.approval_required_rows || 0)}</div>`,
    `<div><strong>Approval enforcement mode:</strong> ${deployments.enforcement && deployments.enforcement.mode ? deployments.enforcement.mode : 'unknown'} (${deployments.enforcement && deployments.enforcement.reason ? deployments.enforcement.reason : 'unknown'}; entitlement=${deployments.enforcement && deployments.enforcement.entitlement_state ? deployments.enforcement.entitlement_state : 'unknown'})</div>`,
    `<div><strong>Rows by environment:</strong></div>${renderBreakdownRows(deployments.rows_by_environment, 'environment')}`,
    `<div><strong>Rows by component:</strong></div>${renderBreakdownRows(deployments.rows_by_component, 'component')}`,
    `<div><strong>GitHub App status:</strong> ${githubApp.status || (githubApp.effective_required ? 'required' : 'not_required')}</div>`,
    `<div><strong>GitHub App effective requirement:</strong> ${githubApp.effective_required ? 'required' : 'not required'} (${githubApp.reason || 'unknown'})</div>`,
  ].join('');
}

function renderCapabilities() {
  const matrixRows = state.payload
    && state.payload.insights
    && Array.isArray(state.payload.insights.capability_matrix)
    ? state.payload.insights.capability_matrix
    : [];
  const capabilities = state.payload && state.payload.capabilities && state.payload.capabilities.capabilities
    ? state.payload.capabilities.capabilities
    : {};
  const legacyRows = Object.entries(capabilities).map(([capability, value]) => ({
    capability,
    supported: value && value.supported === true,
    state: value && value.state || 'unknown',
    reason: value && value.reason || 'unknown',
    remediation: capabilityRemediation(capability),
    source: 'runtime_probe',
  }));
  const rows = matrixRows.length > 0 ? matrixRows : legacyRows;

  if (!rows.length) {
    $('capabilities').textContent = 'No capability probe data available.';
    return;
  }

  $('capabilities').innerHTML = rows
    .map((row) => {
      const supported = row && row.supported;
      const cls = supported === true ? 'cap-ok' : supported === false ? 'cap-error' : 'cap-warn';
      const remediation = String(row && row.remediation || '').trim();
      const entitlement = String(row && row.entitlement_state || '').trim();
      const docsUrl = String(row && row.docs_url || '').trim();
      const source = String(row && row.source || 'runtime_probe').trim();
      const remediationLine = remediation ? ` | remediation: ${remediation}` : '';
      const entitlementLine = entitlement ? ` | entitlement: ${entitlement}` : '';
      const docsLine = docsUrl ? ` | docs: ${docsUrl}` : '';
      return `<div class="${cls}"><strong>${row.capability}</strong>: ${row.state} (${row.reason}) | source: ${source}${entitlementLine}${remediationLine}${docsLine}</div>`;
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
      const effectiveValue = effectiveValueForPath(entry.path, current);
      const override = effectiveOverrideByPath(entry.path);
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = [
        `<div><strong>What:</strong> ${entry.meta.what_this_controls || ''}</div>`,
        `<div><strong>Why:</strong> ${entry.meta.why_it_matters || ''}</div>`,
        `<div><strong>Default:</strong> ${entry.meta.default_behavior || ''}</div>`,
        `<div><strong>Configured value:</strong> ${formatValue(current)}</div>`,
        `<div><strong>Effective value:</strong> ${formatValue(effectiveValue)}</div>`,
        override ? `<div class="cap-warn"><strong>Effective override:</strong> ${override.detail || override.reason || 'runtime override applied'} (${override.source || 'engine'})</div>` : '',
        `<div><strong>Tradeoffs:</strong> ${entry.meta.tradeoffs || ''}</div>`,
        `<div><strong>Prerequisites:</strong> ${entry.meta.prerequisites || ''}</div>`,
        `<div><strong>Apply impact:</strong> ${entry.meta.apply_impact || ''}</div>`,
        entry.inheritedMeta ? `<div><strong>Explanation source:</strong> ${entry.metaPath}</div>` : '',
        `<div class="${capability.className}"><strong>Detected support:</strong> ${capability.text}</div>`,
        `<div><strong>Fallback/remediation:</strong> ${override && override.remediation ? override.remediation : (entry.meta.fallback_or_remediation || remediation || 'No fallback required when supported. See capability panel when unsupported.')}</div>`,
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

function hydrateFromPayload(payload) {
  state.payload = payload;
  state.config = JSON.parse(JSON.stringify((payload && payload.config) || {}));
  state.dirty = false;
  renderRepoSummary();
  renderGovernanceSummary();
  renderCapabilities();
  renderSettings();
}

async function loadSession() {
  const sessionPayload = await api('GET', '/api/session');
  state.session = sessionPayload && sessionPayload.session ? sessionPayload.session : null;
  state.targetStatus = sessionPayload && sessionPayload.target_status ? sessionPayload.target_status : null;
  syncSessionInputs();
  renderSessionSummary();
}

async function loadState() {
  await loadSession();
  const payload = await api('GET', '/api/state');
  hydrateFromPayload(payload);
  logOutput({ status: 'ready', target: payload.target, change_count: payload.changes.length });
}

async function loadOperationsCatalog() {
  const payload = await api('GET', '/api/operations');
  state.operations = Array.isArray(payload && payload.operations) ? payload.operations : [];
  renderOperationsCatalog();
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

async function runVerify() {
  if (state.dirty) await saveSettings();
  const payload = await api('POST', '/api/verify', {});
  logOutput(payload);
}

async function initializeBaseline() {
  if (state.dirty) await saveSettings();
  const options = currentActionOptions();
  const payload = await api('POST', '/api/init', {
    dry_run: options.dry_run,
  });
  await loadState();
  logOutput(payload);
}

async function applyChanges() {
  if (state.dirty) await saveSettings();
  const options = currentActionOptions();
  const payload = await api('POST', '/api/apply', {
    dry_run: options.dry_run,
    direct: options.direct,
  });
  await loadState();
  logOutput(payload);
}

async function runUpgrade() {
  if (state.dirty) await saveSettings();
  const options = currentActionOptions();
  const payload = await api('POST', '/api/upgrade', {
    dry_run: options.dry_run,
    target_version: options.target_version || undefined,
  });
  await loadState();
  logOutput(payload);
}

async function refreshCapabilities() {
  if (state.dirty) await saveSettings();
  const payload = await api('POST', '/api/refresh-capabilities', {});
  hydrateFromPayload(payload);
  logOutput({
    status: 'capabilities_refreshed',
    target: payload.target,
    warning_count: Array.isArray(payload.warnings) ? payload.warnings.length : 0,
  });
}

async function connectTargetSession() {
  if (state.dirty) await saveSettings();
  const target = String(($('targetInput') && $('targetInput').value) || '').trim();
  const profile = String(($('profileInput') && $('profileInput').value) || '').trim();
  const payload = await api('POST', '/api/session', {
    target,
    profile,
  });
  state.session = payload && payload.session ? payload.session : null;
  state.targetStatus = payload && payload.target_status ? payload.target_status : null;
  syncSessionInputs();
  renderSessionSummary();
  await loadState();
  logOutput({
    status: 'target_connected',
    target: state.targetStatus && state.targetStatus.resolved_target,
    profile: state.session && state.session.profile || '',
  });
}

async function boot() {
  $('setTargetBtn').addEventListener('click', () => connectTargetSession().catch((error) => logOutput({ error: error.message })));
  $('refreshCapsBtn').addEventListener('click', () => refreshCapabilities().catch((error) => logOutput({ error: error.message })));
  $('initBtn').addEventListener('click', () => initializeBaseline().catch((error) => logOutput({ error: error.message })));
  $('refreshBtn').addEventListener('click', () => loadState().catch((error) => logOutput({ error: error.message })));
  $('saveBtn').addEventListener('click', () => saveSettings().catch((error) => logOutput({ error: error.message })));
  $('diffBtn').addEventListener('click', () => previewDiff().catch((error) => logOutput({ error: error.message })));
  $('doctorBtn').addEventListener('click', () => runDoctor().catch((error) => logOutput({ error: error.message })));
  $('verifyBtn').addEventListener('click', () => runVerify().catch((error) => logOutput({ error: error.message })));
  $('upgradeBtn').addEventListener('click', () => runUpgrade().catch((error) => logOutput({ error: error.message })));
  $('applyBtn').addEventListener('click', () => applyChanges().catch((error) => logOutput({ error: error.message })));

  await loadOperationsCatalog();
  await loadState();
}

boot().catch((error) => logOutput({ error: error.message }));
