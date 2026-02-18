'use strict';

const path = require('path');
const {
  CAPABILITIES_FILE,
  CONFIG_FILE,
  ENGINE_VERSION,
  MANAGED_FILES_FILE,
  STATE_FILE,
} = require('./constants');
const { generateDeployWorkflow, generateNodeRunWorkflow, generatePrGateWorkflow } = require('./generator/workflows');
const { sha256 } = require('./util/fs');

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildGeneratedArtifacts({ config, capabilities, state, modules }) {
  const generationStamp = String(state && (state.last_applied_at || state.installed_at) || '').trim();
  const enabled = new Set(Array.isArray(config && config.modules && config.modules.enabled)
    ? config.modules.enabled
    : []);
  const moduleList = Array.isArray(modules) ? modules : [];
  const activeModules = moduleList.filter((mod) => enabled.has(String(mod && mod.id || '').trim()));

  const artifacts = [];

  artifacts.push({
    path: CONFIG_FILE,
    owner: 'engine-core',
    strategy: 'yaml_merge',
    content: null,
  });

  artifacts.push({
    path: STATE_FILE,
    owner: 'engine-core',
    strategy: 'json_merge',
    content: stableJson(state),
  });

  artifacts.push({
    path: CAPABILITIES_FILE,
    owner: 'engine-core',
    strategy: 'json_merge',
    content: stableJson(capabilities),
  });

  artifacts.push({
    path: 'config/ci/baseline-change-profiles.json',
    owner: 'core-ci',
    strategy: 'replace',
    content: stableJson({
      version: 1,
      profile_source: 'settings',
      profiles: config.ci.change_profiles,
    }),
  });

  artifacts.push({
    path: 'config/policy/baseline-branch-topology.json',
    owner: 'core-governance',
    strategy: 'replace',
    content: stableJson({
      version: 1,
      topology: config.branching.topology,
      branches: config.branching.branches,
      generated_at: generationStamp,
    }),
  });

  artifacts.push({
    path: 'config/policy/baseline-review-thresholds.json',
    owner: 'core-governance',
    strategy: 'replace',
    content: stableJson({
      version: 1,
      thresholds: config.branching.review_thresholds,
    }),
  });

  artifacts.push({
    path: 'config/policy/baseline-deployment-approval-matrix.json',
    owner: 'core-deployments',
    strategy: 'replace',
    content: stableJson({
      version: 1,
      environments: config.deployments.environments,
      components: config.deployments.components,
      approval_matrix: config.deployments.approval_matrix,
    }),
  });

  artifacts.push({
    path: '.github/workflows/baseline-node-run.yml',
    owner: 'core-ci',
    strategy: 'replace',
    content: generateNodeRunWorkflow(config),
  });

  artifacts.push({
    path: '.github/workflows/baseline-pr-gate.yml',
    owner: 'core-ci',
    strategy: 'replace',
    content: generatePrGateWorkflow(config),
  });

  artifacts.push({
    path: '.github/workflows/baseline-deploy.yml',
    owner: 'core-deployments',
    strategy: 'replace',
    content: generateDeployWorkflow(config),
  });

  artifacts.push({
    path: 'config/policy/baseline-modules.json',
    owner: 'engine-core',
    strategy: 'replace',
    content: stableJson({
      version: 1,
      engine_version: ENGINE_VERSION,
      enabled_modules: Array.from(enabled),
      active_modules: activeModules.map((mod) => ({
        id: mod.id,
        name: mod.name,
        version: mod.version,
        description: mod.description,
      })),
    }),
  });

  const manifest = {
    version: 1,
    engine_version: ENGINE_VERSION,
    generated_at: generationStamp,
    files: artifacts
      .filter((item) => item.path !== CONFIG_FILE)
      .map((item) => ({
        path: item.path,
        owner: item.owner,
        strategy: item.strategy,
        checksum: sha256(item.content || ''),
      })),
  };

  artifacts.push({
    path: MANAGED_FILES_FILE,
    owner: 'engine-core',
    strategy: 'replace',
    content: stableJson(manifest),
  });

  return artifacts;
}

function computeDiff({ targetRoot, artifacts, readTextSafe }) {
  const changes = [];
  for (const artifact of artifacts) {
    if (artifact.path === CONFIG_FILE) continue;
    const abs = path.join(targetRoot, artifact.path);
    const current = readTextSafe(abs, null);
    const next = String(artifact.content || '');

    if (current == null) {
      changes.push({ path: artifact.path, type: 'create', owner: artifact.owner, strategy: artifact.strategy });
      continue;
    }

    if (String(current) !== next) {
      changes.push({ path: artifact.path, type: 'update', owner: artifact.owner, strategy: artifact.strategy });
    }
  }

  return changes;
}

module.exports = {
  buildGeneratedArtifacts,
  computeDiff,
};
