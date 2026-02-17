# Baseline bootstrap (one-button setup)

This baseline kit is a SSOT that can be installed into any new project repo. The bootstrap script runs the full non-destructive setup flow end-to-end:

- Install/update baseline-managed files into a target repo
- Create local env scaffolding (no secrets)
- Initialize `git` and create baseline branches (SSOT: `config/policy/branch-policy.json`)
- Optional: provision/configure GitHub (repo, repo settings, workflow permissions, rulesets/branch protection, repo variables) using `gh`
- Optional: configure GitHub Merge Queue via rulesets API when supported (workflows already support `merge_group`)
- Optional: provision baseline labels, CODEOWNERS fallback, security toggles, and environments (best-effort via API; non-destructive)
- Optional: enable Auto-PR (bot authoring) for `codex/**` branches (default: enabled via repo var `AUTOPR_ENABLED=1`)
- Optional: enforce release/deploy governance controls (main approver check, production promotion flow, deploy guard variables)
- Optional: run `npm install`/`npm test` in the target repo

## Command

- Script: `scripts/tooling/baseline-bootstrap.js`
- NPM: `npm run baseline:bootstrap`

## Requirements

- `git` installed and available on PATH
- Node.js (per `.nvmrc`)
- Optional GitHub automation:
  - `gh` installed
  - Authenticated for the target host (default `github.com`): `gh auth login -h github.com`

## Examples

Local-only bootstrap (no GitHub):

- `npm run baseline:bootstrap -- -- --to <target-path>`

Bootstrap with an install profile:

- `npm run baseline:bootstrap -- -- --to <target-path> --profile enterprise`

Bootstrap + GitHub provisioning (creates repo if missing, applies repo settings + rulesets + variables):

- `npm run baseline:bootstrap -- -- --to <target-path> --github`
- `npm run baseline:bootstrap -- -- --to <target-path> --github --codeowners 'owner-login,org/platform-team'`

Update an existing repo from baseline SSOT (overwrite baseline-managed files; never deletes target files):

- `npm run baseline:bootstrap -- -- --to <target-path> --mode overlay --overwrite --github`

Active repo (protected branches) adoption (recommended):

- `npm run baseline:bootstrap -- -- --to <target-path> --mode overlay --overwrite --github --adopt --reviewers <user-or-team> --auto-merge`

Dry-run preview (no writes):

- `npm run baseline:bootstrap -- -- --to <target-path> --dry-run --github`

## Non-destructive guarantees

- Never deletes files in the target repo.
- Does not overwrite an existing `origin` remote; it only validates that it points to the expected repo (host/owner/name). If it does not match, bootstrap fails and prints the mismatch.
- Does not create or commit secret env files. If it creates `config/env/.env.local`, it is gitignored by default.
- When run with `--adopt`, baseline changes are committed to a new branch and applied via a PR (avoids pushing directly to protected branches).

## Output: end-of-run summary

Bootstrap is "best-effort" for some GitHub features (plan/permission dependent). It will:

- Attempt every enabled feature (based on flags + `config/policy/bootstrap-policy.json`).
- Print `WARN:` lines when a feature cannot be enabled (e.g., plan limitation, missing permissions, API validation).
- Print an end-of-run `Summary:` section that lists which steps/features were **attempted vs skipped**, and repeats any warnings with their associated step.

## GitHub enterprise defaults (SSOT)

Defaults live in `config/policy/bootstrap-policy.json` and can be changed in the baseline SSOT (then applied via updates):

- Required check contexts are derived from workflow files (default: `test`, `validate`, `release-main-policy`).
- Rulesets are created/updated by name:
  - `baseline: integration`
  - `baseline: production`
- Pull request review defaults (via rulesets):
  - Required approvals: `1`
  - Require code owner review: enabled
  - CODEOWNERS fallback: bootstrap ensures `.github/CODEOWNERS` exists with at least one owner from policy/defaults (or `--codeowners=<csv>`)
- Repo settings (patched):
  - Merge methods (derived from policy and enforced via rulesets):
    - Integration (`dev` by default): squash-only
    - Production (`main` by default): merge-commit-only (prevents recurring `dev` -> `main` conflicts caused by squash releases)
  - Delete branch on merge (default: enabled)
- Workflow permissions (patched):
  - Policy SSOT: `github.workflow_permissions` in `config/policy/bootstrap-policy.json`
  - Default token permissions: `read`
  - Allow GitHub Actions to create/approve PRs: enabled (required for Auto-PR with `GITHUB_TOKEN`)
- Merge Queue:
  - Recommended by policy for integration branch by default.
  - Bootstrap attempts to configure it via rulesets when supported; when unsupported (plan/org dependent), enable manually in the GitHub UI.
- Repo variables set:
  - `BACKPORT_ENABLED` (default: `1`)
  - `SECURITY_ENABLED` (default: `0`)
  - `DEPLOY_ENABLED` (default: `0`)
  - `AUTOPR_ENABLED` (default: `1`) - enables `.github/workflows/auto-pr.yml` to open PRs as the GitHub Actions bot (`github-actions[bot]` / `app/github-actions`) for `codex/**` branches
  - `AUTOPR_ENFORCE_BOT_AUTHOR` (default: `1`) - PR policy requires bot author for configured branch prefixes
  - `AUTOPR_ALLOWED_AUTHORS` (default: `github-actions[bot],app/github-actions`) - allowed PR author login(s) when bot-author policy is enforced
  - `AUTOPR_ENFORCE_HEAD_PREFIXES` (default: `codex/`) - branch prefix list for bot-author enforcement (`*` to enforce on all branches)
  - `RELEASE_PR_BYPASS_PLAN_STEP` (default: `1`) - allow release promotion PRs (`dev` -> `main`) to omit `Plan:`/`Step:` (reduces redundancy)
  - Deploy environment mapping (used by `.github/workflows/deploy.yml`):
    - `DEPLOY_ENV_MAP_JSON` (JSON mapping: component -> {staging, production})
    - Legacy override (optional; takes precedence): `DEPLOY_ENV_<COMPONENT>_<TIER>`
  - `EVIDENCE_SOURCE_BRANCH` (set to integration branch)
  - `MAIN_REQUIRED_APPROVER_LOGINS` (default policy template: `$repo_owner_user`; can be overridden with `--main-approvers=<csv>`)
  - `MAIN_APPROVER_ALLOW_AUTHOR_FALLBACK` (default: `1`, avoids solo-maintainer deadlocks)
  - `PRODUCTION_PROMOTION_REQUIRED` (default: `enabled`)
  - `STAGING_DEPLOY_GUARD` (default: `enabled`)
  - `PRODUCTION_DEPLOY_GUARD` (default: `disabled`)
  - `DOCS_PUBLISH_GUARD` (default: `disabled`)
  - `API_INGRESS_DEPLOY_GUARD` (default: `disabled`)
- Labels:
  - Baseline label definitions SSOT: `config/policy/github-labels.json`
  - Bootstrap ensures labels exist when `github.labels.enabled=true` (default; non-destructive).
- CODEOWNERS:
  - Policy SSOT: `github.codeowners` in `config/policy/bootstrap-policy.json`
  - Default owners: `github.codeowners.default_owners` (default: `$repo_owner_user`)
  - CLI override: `--codeowners=<csv>` (users and/or `org/team` handles)
  - Bootstrap warns on self-review deadlock when rules require code-owner review and all owners resolve to the PR author.
- Security toggles (best-effort):
  - Bootstrap can enable vulnerability alerts + automated security fixes and patch `security_and_analysis` settings when supported by the repo/plan.
- Environments (best-effort):
  - Bootstrap can create component-scoped environments derived from `DEPLOY_ENV_MAP_JSON` (and legacy `DEPLOY_ENV_<COMPONENT>_<TIER>` overrides when present) (example: `application-staging`, `application-production`).
  - Bootstrap adds deployment branch policies derived from the branch policy SSOT (integration branch for `*-staging`, production branch for `*-production`).
  - Tier templates (`staging`, `production`) are used as policy templates; they are not created by default (policy: `github.environments.create_tier_environments=false`).
  - Bootstrap can apply environment reviewer policies (`required_reviewers`, `prevent_self_review`, `can_admins_bypass`) when configured.

## Post-bootstrap verification (UI or CLI)

Bootstrap configures everything it can via API, but some settings are plan/feature dependent.

Recommended toggles:

1) Merge Queue (if available in your plan)
   - Bootstrap attempts to enable it via rulesets API.
   - Verify required checks run on `merge_group` (this baseline already triggers `CI` + `PR Policy` on `merge_group`).

2) Security & analysis (recommended)
   - Bootstrap attempts best-effort enablement via API (where supported).
   - When ready, set repo variable `SECURITY_ENABLED=1` to enable the baseline CodeQL + dependency review workflows.

3) Deployment environments (recommended; generic)
   - Bootstrap can create environments and add branch policies (best-effort).
   - Configure required reviewers for `production` (release approvals) per org policy.
   - When ready, set repo variable `DEPLOY_ENABLED=1` and implement the project-specific deploy hook (see `docs/ops/runbooks/DEPLOYMENT.md`).
   - Production promotion path is `Promote (Production)` workflow (`.github/workflows/promote-production.yml`) using `/approve-prod` or workflow dispatch (maintainer-gated).

4) Main release approval policy (recommended)
   - Baseline required check: `Release Policy (main)` (`.github/workflows/release-policy-main.yml`).
   - Set `MAIN_REQUIRED_APPROVER_LOGINS` to one or more comma-separated GitHub logins.
   - Optional: keep `MAIN_APPROVER_ALLOW_AUTHOR_FALLBACK=1` for solo-maintainer repos; set to `0` when you have a separate reviewer pool.
   - Optional: use `Release PR (bot)` workflow (`.github/workflows/release-pr-bot.yml`) to open/refresh the release PR (`dev` -> `main`) as the GitHub Actions bot so a human can approve and merge.

5) Reviewer identity separation (required when approvals are mandatory)
   - GitHub does not count PR author approval toward required reviews.
   - For agent-driven PRs, use a separate automation account/token for authoring and keep human maintainers/code owners as reviewers.
   - If you use one account for both authoring and reviewing, required-review rules can deadlock.
  - Baseline fix: keep PR author as the GitHub Actions bot (`github-actions[bot]` / `app/github-actions`) using Auto-PR workflow (`.github/workflows/auto-pr.yml`) so humans can approve.
  - Bootstrap auto-enables the required Actions setting via policy (`github.workflow_permissions.can_approve_pull_request_reviews=true`) when permissions allow.
  - Fallback: configure secret `AUTOPR_TOKEN` (bot PAT) if your org policy blocks that Actions setting.
