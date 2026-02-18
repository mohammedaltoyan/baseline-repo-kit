'use strict';

const { spawnSync } = require('child_process');

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
    timeout: 1500,
  });
  if (remote.status !== 0) return { owner: '', repo: '' };
  return parseOriginRemote(remote.stdout);
}

function resolveToken() {
  const envToken = String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
  if (envToken) return { token: envToken, source: 'env' };

  const gh = spawnSync('gh', ['auth', 'token'], {
    encoding: 'utf8',
    timeout: 1500,
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

async function ghApi({ owner, repo, endpoint, token }) {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${endpoint}`;
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'baseline-repo-kit-engine',
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  let response;
  try {
    response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
  } catch (error) {
    clearTimeout(timeout);
    return { ok: false, status: 0, data: null, reason: `network_error:${String(error && error.message || error)}` };
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
    },
    auth: {
      token_present: !!tokenInfo.token,
      token_source: tokenInfo.source,
    },
    collaborators: {
      maintainers: [],
      maintainer_count: 0,
    },
    capabilities: {
      rulesets: { supported: false, state: 'unknown', reason: 'unprobed' },
      merge_queue: { supported: false, state: 'unknown', reason: 'unprobed' },
      environments: { supported: false, state: 'unknown', reason: 'unprobed' },
      code_scanning: { supported: false, state: 'unknown', reason: 'unprobed' },
      dependency_review: { supported: false, state: 'unknown', reason: 'unprobed' },
      repo_variables: { supported: false, state: 'unknown', reason: 'unprobed' },
      github_app_required: { supported: true, state: 'supported', reason: 'feature_dependent' },
    },
    warnings: [],
  };

  if (!repo.owner || !repo.repo) {
    base.warnings.push('Unable to resolve repository owner/repo. Capability probing skipped.');
    return base;
  }

  const repoRes = await ghApi({ owner: repo.owner, repo: repo.repo, endpoint: '', token: tokenInfo.token });
  if (repoRes.ok && repoRes.data) {
    base.repository.owner_type = String(repoRes.data.owner && repoRes.data.owner.type || 'unknown');
  } else {
    base.warnings.push(`Repository probe failed: ${repoRes.reason || 'unknown'}`);
  }

  const rulesetsRes = await ghApi({ owner: repo.owner, repo: repo.repo, endpoint: '/rulesets', token: tokenInfo.token });
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

  const envRes = await ghApi({ owner: repo.owner, repo: repo.repo, endpoint: '/environments', token: tokenInfo.token });
  base.capabilities.environments = resolveCapability(envRes, [200]);

  const codeScanningRes = await ghApi({ owner: repo.owner, repo: repo.repo, endpoint: '/code-scanning/default-setup', token: tokenInfo.token });
  base.capabilities.code_scanning = resolveCapability(codeScanningRes, [200]);

  const depReviewRes = await ghApi({ owner: repo.owner, repo: repo.repo, endpoint: '/dependency-graph/sbom', token: tokenInfo.token });
  base.capabilities.dependency_review = resolveCapability(depReviewRes, [200]);

  const variableRes = await ghApi({ owner: repo.owner, repo: repo.repo, endpoint: '/actions/variables', token: tokenInfo.token });
  base.capabilities.repo_variables = resolveCapability(variableRes, [200]);

  const collaboratorsRes = await ghApi({ owner: repo.owner, repo: repo.repo, endpoint: '/collaborators?per_page=100', token: tokenInfo.token });
  if (collaboratorsRes.ok && Array.isArray(collaboratorsRes.data)) {
    const maintainers = collaboratorsRes.data
      .filter((entry) => {
        const permissions = entry && entry.permissions && typeof entry.permissions === 'object'
          ? entry.permissions
          : {};
        return permissions.admin === true || permissions.maintain === true || permissions.push === true;
      })
      .map((entry) => String(entry && entry.login || '').trim())
      .filter(Boolean);

    base.collaborators.maintainers = maintainers;
    base.collaborators.maintainer_count = maintainers.length;
  } else {
    base.warnings.push('Unable to list collaborators. Reviewer thresholds will use conservative defaults.');
  }

  return base;
}

module.exports = {
  detectGithubCapabilities,
};
