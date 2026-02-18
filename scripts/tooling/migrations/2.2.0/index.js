'use strict';

const { DEFAULT_MODULES } = require('../../../../tooling/apps/baseline-engine/lib/constants');

module.exports = {
  description: 'Introduce baseline v2.2 dynamic engine defaults and module registry.',

  apply({ config, state, notes }) {
    const cfg = config && typeof config === 'object' ? config : {};

    if (!cfg.modules || typeof cfg.modules !== 'object') {
      cfg.modules = { enabled: [...DEFAULT_MODULES] };
      notes.push('Added modules.enabled default list.');
    }

    if (!cfg.updates || typeof cfg.updates !== 'object') {
      cfg.updates = { channel: 'stable', apply_mode: 'pr_first', auto_pr: true };
      notes.push('Added updates block with PR-first mode.');
    }

    if (!cfg.policy || typeof cfg.policy !== 'object') {
      cfg.policy = { profile: 'strict', require_github_app: false, enforce_codeowners_protected_paths: true };
      notes.push('Added policy block for dynamic governance.');
    }

    if (state && typeof state === 'object') {
      state.schema_version = 1;
      if (!state.channel) state.channel = cfg.updates.channel || 'stable';
    }
  },
};
