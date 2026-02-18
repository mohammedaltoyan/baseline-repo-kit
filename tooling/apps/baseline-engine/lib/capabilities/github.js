'use strict';

const { spawnSync } = require('child_process');

const CAPABILITY_KEYS = Object.freeze([
  'rulesets',
  'merge_queue',
  'environments',
  'code_scanning',
  'dependency_review',
  'repo_variables',
  'github_app_required',
]);

function defaultCapabilitiesState() {
  const out = {};
  for (const key of CAPABILITY_KEYS) {
    if (key === 'github_app_required') {
      out[key] = { supported: true, state: 'supported', reason: 'feature_dependent' };
      continue;
    }
    out[key] = { supported: false, state: 'unknown', reason: 'unprobed' };
  }
  return out;
}

function normalizeRepoSlug(value) {
  const slug = String(value || '').trim();
  const m = /^([^/]+)\/([^/]+)$/.exec(slug);
  if (!m) return { owner: '', repo: '' };
  return { owner: m[1], repo: m[2] };
}

function parseOriginRemote(value) {
  const raw = String(value || '').trim();
  if (!raw) return { owner: '', repo: '' };

  const scp = /[:/]([^/]+)\/([^/.]+)(?:\.git)?$/.exec(raw);
  if (scp) return { owner: scp[1], repo: scp[2] };

  return { owner: '', repo: '' };
}

function detectRepositorySlug() {
  const fromEnv = normalizeRepoSlug(process.env.GITHUB_REPOSITORY);
  if (fromEnv.owner && fromEnv.repo) return fromEnv;

  const remote = spawnSync('git', ['remote', 'get-url', 'origin'], {
    encoding: 'utf8',
    timeout: 2000,
  });
  if (remote.status !== 0) return { owner: '', repo: '' };
  return parseOriginRemote(remote.stdout);
}

function resolveToken() {
  const envToken = String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
  if (envToken) return { token: envToken, source: 'env' };

  const gh = spawnSync('gh', ['auth', 'token'], {
    encoding: 'utf8',
    timeout: 2000,
    env: {
      ...process.env,
      GH_PROMPT_DISABLED: '1',
    },
  });
  if (gh.status === 0) {
    const token = String(gh.stdout || '').trim();
    if (token) return { token, source: 'gh_auth_token' };
  }

  return { token: '', source: 'none' };
}

function parseScopes(headers) {
  const raw = headers.get('x-oauth-scopes') || headers.get('X-OAuth-Scopes') || '';
  return String(raw || '')
    .split(',')
    .map((scope) => String(scope || '').trim())
    .filter(Boolean);
}

async function ghApi({ endpoint, token }) {
  const cleanEndpoint = String(endpoint || '').startsWith('/') ? String(endpoint || '') : `/${String(endpoint || '')}`;
  const url = `https://api.github.com${cleanEndpoint}`;
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'baseline-repo-kit-engine',
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  let response;
  try {
    response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
  } catch (error) {
    clearTimeout(timeout);
    return {
      ok: false,
      status: 0,
      data: null,
      reason: `network_error:${String(error && error.message || error)}`,
      scopes: [],
    };
  }
  clearTimeout(timeout);

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    reason: response.ok ? 'ok' : String(data && data.message || response.statusText || 'request_failed'),
    scopes: parseScopes(response.headers),
  };
}

function resolveCapability(result, successStatuses = [200]) {
  if (!result) return { supported: false, state: 'unknown', reason: 'no_result' };
  if (successStatuses.includes(result.status)) {
    return { supported: true, state: 'supported', reason: 'api_success' };
  }
  if (result.status === 401 || result.status === 403) {
    return { supported: false, state: 'unknown', reason: 'permission_limited' };
  }
  if (result.status === 404) {
    return { supported: false, state: 'unsupported', reason: 'not_available' };
  }
  return { supported: false, state: 'unknown', reason: result.reason || `status_${result.status}` };
}

function inferOwnerType(value) {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'user') return 'User';
  if (type === 'organization') return 'Organization';
  return 'unknown';
}

function roleFromPermissions(permissions) {
  const perms = permissions && typeof permissions === 'object' ? permissions : {};
  if (perms.admin === true) return 'admin';
  if (perms.maintain === true) return 'maintain';
  if (perms.push === true) return 'write';
  if (perms.pull === true) return 'read';
  return 'none';
}

async function detectGithubCapabilities({ targetRoot }) {
  void targetRoot;
  const detectedAt = new Date().toISOString();
  const repo = detectRepositorySlug();
  const tokenInfo = resolveToken();

  const base = {
    provider: 'github',
    detected_at: detectedAt,
    repository: {
      owner: repo.owner,
      repo: repo.repo,
      owner_type: 'unknown',
      private: null,
      permissions: {
        admin: false,
        maintain: false,
        push: false,
        pull: false,
      },
    },
    auth: {
      token_present: !!tokenInfo.token,
      token_source: tokenInfo.source,
      token_scopes: [],
      viewer_login: '',
    },
    collaborators: {
      maintainers: [],
      maintainer_count: 0,
      role_counts: {
        admin: 0,
        maintain: 0,
        write: 0,
      },
    },
    capabilities: defaultCapabilitiesState(),
    warnings: [],
  };

  if (!repo.owner || !repo.repo) {
    base.warnings.push('Unable to resolve repository owner/repo. Capability probing skipped.');
    return base;
  }

  const userRes = await ghApi({ endpoint: '/user', token: tokenInfo.token });
  if (userRes.ok && userRes.data) {
    base.auth.viewer_login = String(userRes.data.login || '');
  }
  if (Array.isArray(userRes.scopes) && userRes.scopes.length > 0) {
    base.auth.token_scopes = userRes.scopes;
  } else if (userRes.status === 401 || userRes.status === 403) {
    base.warnings.push('Unable to resolve token scopes from GitHub API.');
  }

  const repoRes = await ghApi({
    endpoint: `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`,
    token: tokenInfo.token,
  });
  if (repoRes.ok && repoRes.data) {
    base.repository.owner_type = inferOwnerType(repoRes.data.owner && repoRes.data.owner.type);
    base.repository.private = !!repoRes.data.private;
    const perms = repoRes.data.permissions && typeof repoRes.data.permissions === 'object'
      ? repoRes.data.permissions
      : {};
    base.repository.permissions = {
      admin: !!perms.admin,
      maintain: !!perms.maintain,
      push: !!perms.push,
      pull: !!perms.pull,
    };
  } else {
    base.warnings.push(`Repository probe failed: ${repoRes.reason || 'unknown'}`);
  }

  const rulesetsRes = await ghApi({
    endpoint: `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/rulesets`,
    token: tokenInfo.token,
  });
  base.capabilities.rulesets = resolveCapability(rulesetsRes, [200]);

  if (rulesetsRes.ok && Array.isArray(rulesetsRes.data)) {
    const hasMergeQueue = rulesetsRes.data.some((ruleSet) => {
      const rules = Array.isArray(ruleSet && ruleSet.rules) ? ruleSet.rules : [];
      return rules.some((rule) => String(rule && rule.type || '') === 'merge_queue');
    });
    base.capabilities.merge_queue = {
      supported: hasMergeQueue,
      state: hasMergeQueue ? 'supported' : 'unsupported',
      reason: hasMergeQueue ? 'ruleset_contains_merge_queue' : 'merge_queue_rule_not_found',
    };
  } else {
    base.capabilities.merge_queue = resolveCapability(rulesetsRes, [200]);
  }

  const envRes = await ghApi({
    endpoint: `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/environments`,
    token: tokenInfo.token,
  });
  base.capabilities.environments = resolveCapability(envRes, [200]);

  const codeScanningRes = await ghApi({
    endpoint: `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/code-scanning/default-setup`,
    token: tokenInfo.token,
  });
  base.capabilities.code_scanning = resolveCapability(codeScanningRes, [200]);

  const depReviewRes = await ghApi({
    endpoint: `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/dependency-graph/sbom`,
    token: tokenInfo.token,
  });
  base.capabilities.dependency_review = resolveCapability(depReviewRes, [200]);

  const variableRes = await ghApi({
    endpoint: `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/actions/variables`,
    token: tokenInfo.token,
  });
  base.capabilities.repo_variables = resolveCapability(variableRes, [200]);

  const collaboratorsRes = await ghApi({
    endpoint: `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/collaborators?per_page=100`,
    token: tokenInfo.token,
  });
  if (collaboratorsRes.ok && Array.isArray(collaboratorsRes.data)) {
    const maintainers = [];
    const roleCounts = {
      admin: 0,
      maintain: 0,
      write: 0,
    };

    for (const entry of collaboratorsRes.data) {
      const login = String(entry && entry.login || '').trim();
      if (!login) continue;
      const role = roleFromPermissions(entry.permissions);
      if (!['admin', 'maintain', 'write'].includes(role)) continue;
      maintainers.push(login);
      roleCounts[role] += 1;
    }

    base.collaborators.maintainers = maintainers;
    base.collaborators.maintainer_count = maintainers.length;
    base.collaborators.role_counts = roleCounts;
  } else {
    base.warnings.push('Unable to list collaborators. Reviewer thresholds will use conservative defaults.');
  }

  return base;
}

module.exports = {
  CAPABILITY_KEYS,
  detectGithubCapabilities,
};
