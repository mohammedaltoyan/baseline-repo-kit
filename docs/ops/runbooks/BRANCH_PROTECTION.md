# Branch Protection (Template)

Goal
- Prevent merges unless required checks are green.

Recommended branches (enterprise default)
- Integration: `dev`
- Production: `main`
- Hotfix: disabled by default in this repo (can be enabled via `config/policy/branch-policy.json`)

Recommended required status checks
- Require the baseline CI job that runs `npm test` (this repo ships `.github/workflows/ci.yml`, job: `test`).
- Require the PR metadata policy job (this repo ships `.github/workflows/pr-policy.yml`, job: `validate`).
- Require the main-release policy job (this repo ships `.github/workflows/release-policy-main.yml`, job: `release-main-policy`).

Notes
- GitHub required checks must match the emitted check-run names exactly; copy them from a successful PR run.
- If you enable GitHub Merge Queue, make sure required checks also run on `merge_group` events.
- Consider enabling "Require branches to be up to date before merging" (or enforce via Merge Queue) to reduce post-merge breakage.
- Automation option: `npm run baseline:bootstrap -- -- --to <repo> --github` can provision GitHub repo settings + rulesets/branch protection using SSOT defaults in `config/policy/bootstrap-policy.json`. Merge Queue is configured via rulesets when supported; otherwise enable manually in the GitHub UI.

Branch rules (recommended)

- Protect `dev` (integration):
  - Require PRs (no direct pushes).
  - Require required checks.
  - Require at least 1 approving review (recommended baseline default).
  - Require code owner review (recommended baseline default when CODEOWNERS exists).
  - Allowed merge method: squash-only (keeps integration history clean and avoids merge commits into `dev`).
  - Backports: do not open PRs from `main` directly into `dev`; use a `backport/*` branch (automation can create these).
  - Enable GitHub Merge Queue to serialize merges safely when multiple PRs are active.
- Protect `main` (production):
  - Require PRs (no direct pushes).
  - Require required checks.
  - Require at least 1 approving review (recommended baseline default).
  - Require code owner review (recommended baseline default when CODEOWNERS exists).
  - Allowed merge method: merge-commit-only (prevents recurring `dev` -> `main` conflicts caused by squash releases).
  - Only accept changes via:
    - Release PR: `dev` -> `main`
  - Optional hotfix mode (configuration-driven):
    - Hotfix PR: `hotfix/*` -> `main` (and backport to `dev`) when hotfix prefixes are configured in `config/policy/branch-policy.json`.
  - Optional automation: use `Release PR (bot)` workflow (`.github/workflows/release-pr-bot.yml`) to open/refresh the release PR as a bot, then have a human approve and merge.
  - Enforce allowed PR source branches via CI (SSOT is `config/policy/branch-policy.json`).
  - Enforce required approver logins via `Release Policy (main)` check (repo variable: `MAIN_REQUIRED_APPROVER_LOGINS`).
  - Default for required checks strictness (`Require branches to be up to date before merging`): disabled. This avoids release deadlocks when `dev` is squash-only and `main` is merge-commit-only.
  - If you enable strict mode on `main`, also implement automated ancestry back-merge from `main` into `dev` (non-squash) to keep release PRs mergeable.
  - Optional: enable repo variable `BACKPORT_ENABLED=1` to automatically open a backport PR from production -> integration after a hotfix merge (ships as `.github/workflows/hotfix-backport.yml`).

Optional (quality-of-life)
- Set the repository default branch to `dev` so new PRs default to the integration branch (avoids accidental PRs to `main`).

Optional (team policy)
- Require approvals (baseline default is `1`; raise to `2+` for larger teams)
- Require code owners (add `.github/CODEOWNERS` and assign teams/owners per path)
- Require conversation resolution
- Require linear history (only if you do not use merge commits)
