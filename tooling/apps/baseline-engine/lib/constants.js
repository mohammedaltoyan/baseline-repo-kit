'use strict';

const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const ENGINE_VERSION = '2.2.0';
const CONFIG_VERSION = 1;

const BASELINE_DIR = '.baseline';
const CONFIG_FILE = path.posix.join(BASELINE_DIR, 'config.yaml');
const STATE_FILE = path.posix.join(BASELINE_DIR, 'state.json');
const MANAGED_FILES_FILE = path.posix.join(BASELINE_DIR, 'managed-files.json');
const CAPABILITIES_FILE = path.posix.join(BASELINE_DIR, 'capabilities', 'github.json');

const SCHEMA_FILE = path.join(REPO_ROOT, 'config', 'schema', 'baseline-config.schema.json');
const UI_METADATA_FILE = path.join(REPO_ROOT, 'config', 'schema', 'baseline-ui-metadata.json');
const MODULES_DIR = path.resolve(__dirname, '..', 'modules');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'scripts', 'tooling', 'migrations');
const UI_APP_DIR = path.join(REPO_ROOT, 'apps', 'baseline-control');

const DEFAULT_ENVIRONMENTS = ['dev', 'staging', 'production'];
const DEFAULT_MODULES = ['core-governance', 'core-ci', 'core-deployments', 'core-planning'];

module.exports = {
  BASELINE_DIR,
  CAPABILITIES_FILE,
  CONFIG_FILE,
  CONFIG_VERSION,
  DEFAULT_ENVIRONMENTS,
  DEFAULT_MODULES,
  ENGINE_VERSION,
  MANAGED_FILES_FILE,
  MIGRATIONS_DIR,
  MODULES_DIR,
  SCHEMA_FILE,
  STATE_FILE,
  UI_APP_DIR,
  UI_METADATA_FILE,
};
