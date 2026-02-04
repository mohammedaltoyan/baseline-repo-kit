const fs = require('fs');
const path = require('path');

function stripBom(raw) {
  return String(raw || '').replace(/^\uFEFF/, '');
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(stripBom(raw));
}

function readJsonSafe(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

module.exports = {
  stripBom,
  readJson,
  readJsonSafe,
  writeJson,
};

