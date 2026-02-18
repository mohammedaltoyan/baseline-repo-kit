#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const { parseFlagArgs } = require('../utils/cli-args');
const {
  defaultRegistry,
  loadRegistryFromFile,
  normalizeTier,
  normalizeApprovalMode,
  normalizeSurfaceId,
  resolveApprovalMode,
  resolveApprovalEnvName,
} = require('./deploy-surface-registry');

function toString(value) {
  return String(value == null ? '' : value).trim();
}

function die(msg) {
  console.error(`[approval-matrix] ${msg}`);
  process.exit(1);
}

function loadRegistryMaybe(registryPath) {
  const rel = toString(registryPath) || toString(process.env.DEPLOY_SURFACES_PATH) || 'config/deploy/deploy-surfaces.json';
  const abs = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(abs)) return { loaded: false, path: abs, registry: null };
  return loadRegistryFromFile(abs);
}

function parseSurfaces({ surfacesJson, surfacesCsv }) {
  const jsonText = toString(surfacesJson);
  if (jsonText) {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      die(`--surfaces-json invalid JSON: ${e.message || e}`);
    }
    if (!Array.isArray(parsed)) die('--surfaces-json must be a JSON array');
    return parsed.map((s) => normalizeSurfaceId(s)).filter(Boolean);
  }

  const csv = toString(surfacesCsv);
  if (!csv) return [];
  return csv.split(',').map((s) => normalizeSurfaceId(s)).filter(Boolean);
}

function buildApprovalMatrix({ tier, surfaces, inputApprovalMode, repoVarApprovalMode, registry }) {
  const t = normalizeTier(tier);
  if (!t) throw new Error(`invalid tier "${toString(tier)}"`);

  const reg = registry || { ...defaultRegistry(), surfaces: [] };
  const mode = resolveApprovalMode({ tier: t, inputApprovalMode, repoVarApprovalMode, registry: reg });

  const commitEnv = resolveApprovalEnvName({ registry: reg, tier: t, approvalMode: 'commit' });
  const surfaceMatrix = (Array.isArray(surfaces) ? surfaces : []).map((surface) => {
    const s = normalizeSurfaceId(surface);
    if (!s) throw new Error(`invalid surface "${toString(surface)}"`);
    return {
      surface: s,
      approval_env: resolveApprovalEnvName({ registry: reg, tier: t, approvalMode: 'surface', surfaceId: s }),
    };
  });

  return {
    approvalMode: mode,
    approvalEnvCommit: commitEnv,
    surfaceApprovalMatrix: surfaceMatrix,
  };
}

function appendOutput(name, value) {
  const outPath = toString(process.env.GITHUB_OUTPUT);
  const line = `${name}=${toString(value).replace(/\n/g, ' ')}`.trim() + '\n';
  if (outPath) {
    fs.appendFileSync(outPath, line, 'utf8');
  } else {
    process.stdout.write(line);
  }
}

function main() {
  const args = parseFlagArgs(process.argv.slice(2));
  if (args.h || args.help) {
    console.log(
      'Usage: node scripts/ops/approval-matrix.js --tier <staging|production> --surfaces-json <json> [--approval-mode <commit|surface>]\n' +
      '\n' +
      'Resolves approval mode (input -> repo var -> registry default) and emits commit/surface approval environments.'
    );
    process.exit(0);
  }

  const tier = toString(args.tier || process.env.TIER);
  const surfaces = parseSurfaces({ surfacesJson: args['surfaces-json'] || args.surfacesJson, surfacesCsv: args.surfaces });
  if (surfaces.length < 1) die('No surfaces provided (surfaces-json or surfaces csv).');

  const inputMode = normalizeApprovalMode(args['approval-mode'] || args.approvalMode || process.env.APPROVAL_MODE || '') || '';
  const repoVarMode = normalizeApprovalMode(args['repo-var-approval-mode'] || args.repoVarApprovalMode || process.env.REPO_VAR_APPROVAL_MODE || '') || '';

  const regRes = loadRegistryMaybe(args.registry);
  const reg = regRes.registry || { ...defaultRegistry(), surfaces: [] };

  const m = buildApprovalMatrix({
    tier,
    surfaces,
    inputApprovalMode: inputMode,
    repoVarApprovalMode: repoVarMode,
    registry: reg,
  });

  appendOutput('approval_mode', m.approvalMode);
  appendOutput('approval_env_commit', m.approvalEnvCommit);
  appendOutput('surface_approval_matrix_json', JSON.stringify(m.surfaceApprovalMatrix));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    die(err && err.message ? err.message : String(err));
  }
}

module.exports = { buildApprovalMatrix };

