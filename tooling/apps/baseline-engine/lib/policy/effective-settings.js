'use strict';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
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

function getCapability(capabilities, key) {
  const map = capabilities && capabilities.capabilities && typeof capabilities.capabilities === 'object'
    ? capabilities.capabilities
    : {};
  const selected = map[String(key || '').trim()];
  return selected && typeof selected === 'object' ? selected : null;
}

function getModuleEntry(moduleEvaluation, moduleId) {
  const modules = Array.isArray(moduleEvaluation && moduleEvaluation.modules)
    ? moduleEvaluation.modules
    : [];
  return modules.find((entry) => String(entry && entry.id || '') === String(moduleId || '')) || null;
}

function getMissingCapability(moduleEntry, capability) {
  const missing = Array.isArray(moduleEntry && moduleEntry.missing) ? moduleEntry.missing : [];
  return missing.find((entry) => String(entry && entry.capability || '') === String(capability || '')) || null;
}

function buildEffectiveConfig({ config, capabilities, moduleEvaluation }) {
  const sourceConfig = config && typeof config === 'object' ? config : {};
  const effectiveConfig = cloneJson(sourceConfig);
  const overrides = [];

  const mergeQueuePath = 'ci.full_lane_triggers.merge_queue';
  const configuredMergeQueue = getPath(sourceConfig, mergeQueuePath) !== false;
  const capability = getCapability(capabilities, 'merge_queue');
  const mergeQueueSupported = !!(capability && capability.supported === true);
  const moduleEntry = getModuleEntry(moduleEvaluation, 'core-ci');
  const missing = getMissingCapability(moduleEntry, 'merge_queue');
  const shouldAutoDegrade = configuredMergeQueue && (!mergeQueueSupported || !!missing);

  if (shouldAutoDegrade) {
    setPath(effectiveConfig, mergeQueuePath, false);
    const reason = missing
      ? String(missing.reason || capability && capability.reason || 'capability_unavailable')
      : String(capability && capability.reason || 'capability_unavailable');
    const capabilityState = String(capability && capability.state || 'unknown');
    const remediation = String(missing && missing.remediation || '').trim()
      || 'Disable merge queue trigger or enable merge queue support in repository rulesets.';

    overrides.push({
      path: mergeQueuePath,
      configured: configuredMergeQueue,
      effective: false,
      source: 'core-ci',
      reason: 'capability_auto_degrade',
      detail: `merge_queue capability is ${capabilityState} (${reason})`,
      capability: 'merge_queue',
      remediation,
    });
  }

  const byPath = Object.fromEntries(overrides.map((entry) => [entry.path, entry]));

  return {
    config: effectiveConfig,
    overrides,
    by_path: byPath,
    override_count: overrides.length,
  };
}

module.exports = {
  buildEffectiveConfig,
  getPath,
  setPath,
};
