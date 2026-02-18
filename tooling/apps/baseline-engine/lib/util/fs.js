'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

function toPosix(value) {
  return String(value || '').replace(/\\/g, '/');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonSafe(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readYamlSafe(filePath, fallback = null) {
  try {
    return YAML.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeYaml(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, YAML.stringify(value), 'utf8');
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(value || ''), 'utf8');
}

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function readTextSafe(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function sha256(content) {
  return crypto.createHash('sha256').update(String(content || ''), 'utf8').digest('hex');
}

function walkFiles(rootPath, rel = '') {
  const base = path.join(rootPath, rel);
  let out = [];
  const entries = fs.readdirSync(base, { withFileTypes: true });
  for (const entry of entries) {
    const nextRel = rel ? path.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      out = out.concat(walkFiles(rootPath, nextRel));
      continue;
    }
    out.push(toPosix(nextRel));
  }
  return out;
}

module.exports = {
  ensureDir,
  fileExists,
  readJsonSafe,
  readTextSafe,
  readYamlSafe,
  sha256,
  toPosix,
  walkFiles,
  writeJson,
  writeText,
  writeYaml,
};
