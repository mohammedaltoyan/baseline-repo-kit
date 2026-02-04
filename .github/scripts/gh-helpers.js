/**
 * Shared helpers for `actions/github-script` steps.
 *
 * Notes:
 * - Keep this file dependency-free (no node_modules) so it can be required from workflows.
 * - All functions accept `{ github, owner, repo, ... }` to stay reusable across workflows.
 */

function norm(value) {
  return String(value || '').trim();
}

async function ensureLabel({ github, owner, repo, name, color, description }) {
  const labelName = norm(name);
  if (!labelName) throw new Error('ensureLabel: missing label name');
  try {
    await github.rest.issues.getLabel({ owner, repo, name: labelName });
  } catch (_) {
    await github.rest.issues.createLabel({
      owner,
      repo,
      name: labelName,
      color: norm(color) || 'ededed',
      description: norm(description),
    });
  }
}

async function upsertComment({ github, owner, repo, issueNumber, marker, body }) {
  const num = parseInt(String(issueNumber || '').trim(), 10);
  if (!num) throw new Error(`upsertComment: invalid issueNumber: ${issueNumber || '<empty>'}`);

  const m = norm(marker);
  if (!m) throw new Error('upsertComment: missing marker');

  const text = norm(body);
  if (!text) throw new Error('upsertComment: missing body');

  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: num,
    per_page: 100,
  });

  const existing = (Array.isArray(comments) ? comments : []).find((c) => String(c?.body || '').includes(m));
  if (existing?.id) {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body: text,
    });
    return;
  }

  await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: num,
    body: text,
  });
}

async function requireMaintainer({ github, owner, repo, username, purpose }) {
  const user = norm(username);
  if (!user) throw new Error('requireMaintainer: missing username');
  const why = norm(purpose);

  const { data } = await github.rest.repos.getCollaboratorPermissionLevel({
    owner,
    repo,
    username: user,
  });

  const permission = String(data?.permission || '').toLowerCase();
  if (permission !== 'admin' && permission !== 'maintain') {
    const label = why ? ` to ${why}` : '';
    throw new Error(`User @${user} is not authorized${label} (permission=${permission || '<unknown>'}).`);
  }
}

async function enableAutoMerge({ github, pullRequestId, mergeMethod = 'MERGE' }) {
  const prId = norm(pullRequestId);
  if (!prId) throw new Error('enableAutoMerge: missing pullRequestId');

  const resolvedMergeMethod = norm(mergeMethod) || 'MERGE';

  try {
    await github.graphql(
      `mutation($prId: ID!, $mergeMethod: PullRequestMergeMethod!) {
        enablePullRequestAutoMerge(input: { pullRequestId: $prId, mergeMethod: $mergeMethod }) {
          pullRequest { number }
        }
      }`,
      { prId, mergeMethod: resolvedMergeMethod }
    );
    return { ok: true, message: 'enabled' };
  } catch (e) {
    return { ok: false, message: String(e?.message || e) };
  }
}

async function updatePullRequestBranch({ github, pullRequestId, expectedHeadOid }) {
  const prId = norm(pullRequestId);
  if (!prId) throw new Error('updatePullRequestBranch: missing pullRequestId');

  const oid = norm(expectedHeadOid);
  if (!oid) throw new Error('updatePullRequestBranch: missing expectedHeadOid');

  try {
    await github.graphql(
      `mutation($prId: ID!, $oid: GitObjectID!) {
        updatePullRequestBranch(input: { pullRequestId: $prId, expectedHeadOid: $oid }) {
          pullRequest { number }
        }
      }`,
      { prId, oid }
    );
    return { ok: true, message: 'updated' };
  } catch (e) {
    return { ok: false, message: String(e?.message || e) };
  }
}

module.exports = {
  ensureLabel,
  enableAutoMerge,
  norm,
  requireMaintainer,
  updatePullRequestBranch,
  upsertComment,
};
