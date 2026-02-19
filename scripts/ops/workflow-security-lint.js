#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

function toString(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeBool(value) {
  if (typeof value === 'boolean') return value;
  const raw = toString(value).toLowerCase();
  if (!raw) return null;
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true;
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
  return null;
}

function fail(message) {
  console.error(`[workflow-security-lint] ${message}`);
  process.exit(1);
}

function loadPolicy(root) {
  const file = path.join(root, 'config', 'policy', 'workflow-security.json');
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`Unable to read policy file ${file}: ${error.message}`);
  }

  const checkout = parsed && typeof parsed === 'object' && parsed.checkout && typeof parsed.checkout === 'object'
    ? parsed.checkout
    : null;
  if (!checkout) fail(`Invalid policy file ${file}: missing checkout policy.`);

  const enforceExplicit = checkout.enforce_explicit_persist_credentials !== false;
  const defaultPersist = normalizeBool(checkout.default_persist_credentials);
  if (defaultPersist == null) {
    fail(`Invalid policy file ${file}: checkout.default_persist_credentials must be boolean.`);
  }

  const allowRowsRaw = Array.isArray(checkout.allow_persist_true) ? checkout.allow_persist_true : [];
  const allowMap = new Map();
  for (const row of allowRowsRaw) {
    const workflow = toString(row && row.workflow);
    const step = toString(row && row.step);
    if (!workflow || !step) {
      fail(`Invalid policy file ${file}: allow_persist_true entries require workflow + step.`);
    }
    allowMap.set(`${workflow}::${step}`, true);
  }

  return {
    enforceExplicit,
    defaultPersist,
    allowMap,
    file,
  };
}

function listWorkflowFiles(root) {
  const dir = path.join(root, '.github', 'workflows');
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (error) {
    fail(`Unable to read workflows directory ${dir}: ${error.message}`);
  }
  return names
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()
    .map((name) => path.join(dir, name));
}

function checkoutVersion(uses) {
  const raw = toString(uses);
  const m = /^actions\/checkout@(.+)$/.exec(raw);
  return m ? m[1] : '';
}

function lintWorkflowFile({ absFile, root, policy }) {
  const relFile = path.relative(root, absFile).replace(/\\/g, '/');
  const raw = fs.readFileSync(absFile, 'utf8');
  let parsed;
  try {
    parsed = YAML.parse(raw);
  } catch (error) {
    return [`${relFile}: invalid YAML (${error.message})`];
  }

  const jobs = parsed && typeof parsed === 'object' && parsed.jobs && typeof parsed.jobs === 'object'
    ? parsed.jobs
    : {};
  const errors = [];

  for (const [jobId, jobValue] of Object.entries(jobs)) {
    const steps = jobValue && typeof jobValue === 'object' && Array.isArray(jobValue.steps)
      ? jobValue.steps
      : [];

    for (const step of steps) {
      const version = checkoutVersion(step && step.uses);
      if (!version) continue;

      const stepName = toString(step && step.name) || '<unnamed>';
      const key = `${relFile}::${stepName}`;
      const withBlock = step && typeof step === 'object' && step.with && typeof step.with === 'object'
        ? step.with
        : {};
      const hasExplicitPersist = Object.prototype.hasOwnProperty.call(withBlock, 'persist-credentials');
      const actualPersist = normalizeBool(withBlock['persist-credentials']);
      const allowTrue = policy.allowMap.has(key);
      const expectedPersist = allowTrue ? true : policy.defaultPersist;

      if (policy.enforceExplicit && !hasExplicitPersist) {
        errors.push(`${relFile} [job=${jobId} step="${stepName}"]: checkout must set with.persist-credentials explicitly.`);
        continue;
      }

      if (hasExplicitPersist && actualPersist == null) {
        errors.push(`${relFile} [job=${jobId} step="${stepName}"]: persist-credentials must be a boolean-like value.`);
        continue;
      }

      if (hasExplicitPersist && actualPersist !== expectedPersist) {
        errors.push(
          `${relFile} [job=${jobId} step="${stepName}"]: persist-credentials=${actualPersist} but expected ${expectedPersist}.`
        );
      }
    }
  }

  return errors;
}

function lintWorkflows({ root }) {
  const repoRoot = path.resolve(root || process.cwd());
  const policy = loadPolicy(repoRoot);
  const workflowFiles = listWorkflowFiles(repoRoot);
  const errors = [];
  for (const absFile of workflowFiles) {
    errors.push(...lintWorkflowFile({ absFile, root: repoRoot, policy }));
  }
  return { ok: errors.length === 0, errors };
}

function main() {
  const result = lintWorkflows({ root: process.cwd() });
  if (!result.ok) {
    for (const err of result.errors) console.error(`[workflow-security-lint] ${err}`);
    process.exit(1);
  }
  console.log('[workflow-security-lint] OK');
}

if (require.main === module) {
  main();
}

module.exports = {
  lintWorkflows,
  loadPolicy,
  normalizeBool,
};
