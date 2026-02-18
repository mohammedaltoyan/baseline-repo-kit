'use strict';

const path = require('path');
const {
  CAPABILITIES_FILE,
  CONFIG_FILE,
  CONFIG_VERSION,
  DEFAULT_MODULES,
  STATE_FILE,
} = require('./constants');
const { resolveTopology } = require('./policy/branching');
const { defaultEnvironments, buildApprovalMatrix } = require('./policy/deployments');
const { computeAdaptiveReviewThresholds } = require('./policy/reviewers');
const { fileExists, readJsonSafe, readYamlSafe, writeJson, writeYaml } = require('./util/fs');
const { validateConfig } = require('./schema');

function defaultChangeProfiles() {
  return [
    {
      id: 'docs',
      description: 'Docs-only changes',
      include_re: ['^docs/', '\\.(md|mdx)$'],
      exclude_re: [],
      skip_full_lane: true,
      run_fast_checks: true,
    },
    {
      id: 'ci',
      description: 'CI/policy changes',
      include_re: ['^\\.github/', '^config/ci/', '^scripts/ops/ci/'],
      exclude_re: [],
      skip_full_lane: false,
      run_fast_checks: true,
    },
    {
      id: 'app',
      description: 'Application/runtime changes',
      include_re: ['^apps/', '^packages/', '^scripts/'],
      exclude_re: ['^docs/'],
      skip_full_lane: false,
      run_fast_checks: true,
    },
  ];
}

function defaultConfig({ maintainersCount, components, profile }) {
  const reviewerDefaults = computeAdaptiveReviewThresholds(maintainersCount || 0);
  const policyProfile = String(profile || 'strict').trim().toLowerCase() || 'strict';
  const detectedComponents = Array.isArray(components) && components.length
    ? components
    : [{ id: 'application', name: 'application', path: 'apps', enabled: true }];
  const environments = defaultEnvironments();

  return {
    version: CONFIG_VERSION,
    platform: {
      provider: 'github',
    },
    policy: {
      profile: policyProfile,
      require_github_app: false,
      enforce_codeowners_protected_paths: true,
    },
    branching: {
      topology: 'two_branch',
      branches: resolveTopology('two_branch'),
      review_thresholds: reviewerDefaults.defaults,
    },
    ci: {
      mode: 'two_lane',
      change_profiles: defaultChangeProfiles(),
      full_lane_triggers: {
        merge_queue: true,
        manual_dispatch: true,
        label: 'ci:full',
        paths: ['.github/workflows/', 'config/policy/', 'scripts/ops/'],
      },
    },
    deployments: {
      environments,
      components: detectedComponents,
      approval_matrix: buildApprovalMatrix({
        environments,
        components: detectedComponents,
        policyProfile,
      }),
    },
    planning: {
      required: true,
      automation_allowlist: [
        {
          id: 'plan_archive',
          head_ref_prefix: 'automation/plan-archive/',
          base_ref: 'dev',
          allowed_paths: ['docs/ops/plans/'],
        },
      ],
    },
    security: {
      codeql: true,
      dependency_review: true,
      secret_scanning: true,
    },
    updates: {
      channel: 'stable',
      apply_mode: 'pr_first',
      auto_pr: true,
    },
    modules: {
      enabled: [...DEFAULT_MODULES],
    },
  };
}

function defaultState({ capabilities }) {
  const maintainerCount = Number(capabilities && capabilities.collaborators && capabilities.collaborators.maintainer_count || 0);

  return {
    schema_version: 1,
    installed_version: '2.2.0',
    installed_at: new Date().toISOString(),
    last_applied_at: '',
    channel: 'stable',
    maintainer_count_observed: maintainerCount,
    migrations: [],
    warnings: [],
  };
}

function loadConfig(targetRoot) {
  const configPath = path.join(targetRoot, CONFIG_FILE);
  const statePath = path.join(targetRoot, STATE_FILE);
  const capsPath = path.join(targetRoot, CAPABILITIES_FILE);

  const config = readYamlSafe(configPath, null);
  const state = readJsonSafe(statePath, null);
  const capabilities = readJsonSafe(capsPath, null);

  return {
    config,
    configPath,
    state,
    statePath,
    capabilities,
    capabilitiesPath: capsPath,
  };
}

function saveConfigArtifacts({ targetRoot, config, state, capabilities }) {
  writeYaml(path.join(targetRoot, CONFIG_FILE), config);
  writeJson(path.join(targetRoot, STATE_FILE), state);
  if (capabilities) {
    writeJson(path.join(targetRoot, CAPABILITIES_FILE), capabilities);
  }
}

function ensureConfig({ targetRoot, capabilities, components, profile }) {
  const current = loadConfig(targetRoot);
  let config = current.config;
  let state = current.state;

  if (!config || typeof config !== 'object') {
    config = defaultConfig({
      maintainersCount: capabilities && capabilities.collaborators && capabilities.collaborators.maintainer_count,
      components,
      profile,
    });
  }

  validateConfig(config);

  if (!state || typeof state !== 'object') {
    state = defaultState({ capabilities });
  }

  const shouldWriteCaps = !!capabilities && !fileExists(current.capabilitiesPath);
  if (!fileExists(current.configPath) || !fileExists(current.statePath) || shouldWriteCaps) {
    saveConfigArtifacts({ targetRoot, config, state, capabilities });
  }

  return {
    config,
    state,
    capabilities: capabilities || current.capabilities,
  };
}

module.exports = {
  defaultConfig,
  defaultState,
  ensureConfig,
  loadConfig,
  saveConfigArtifacts,
};
