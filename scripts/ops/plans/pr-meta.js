'use strict';

function extractPlanIds(text) {
  const ids = new Set();
  const re = /Plan:\s*(PLAN-\d{6}-[A-Za-z0-9_.-]+)/gi;
  let m;
  while ((m = re.exec(text || '')) !== null) {
    const id = String(m[1] || '').trim();
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

function extractStep(text) {
  const m = /Step:\s*(S\d{2})/i.exec(text || '');
  return m && m[1] ? String(m[1]).trim() : '';
}

module.exports = {
  extractPlanIds,
  extractStep,
};

