# Baseline install + update

This repo is the SSOT for baseline guardrails (docs, scripts, workflows, templates). Use the installer to apply the baseline into a target repository without copying baseline-only plan instances.

## Installer script (SSOT)

- Script: `scripts/tooling/baseline-install.js`
- Command wrapper: `npm run baseline:install`

Key properties:
- Copies baseline-managed files into a target repo.
- Never deletes files in the target repo (additive/overwrite only).
- Excludes baseline-only plan instances (e.g., `docs/ops/plans/PLAN-*.md`) and generated plan dashboards (`FOCUS.json`, `INDEX.md`).
- In overlay mode, merges baseline scripts/dependencies into an existing `package.json` instead of replacing it.
- In overlay mode, does not overwrite `README.md` (project identity) unless you explicitly choose to manage it yourself.

If you want a fully guided end-to-end setup (git + optional GitHub provisioning + optional tests), use `docs/ops/runbooks/BASELINE_BOOTSTRAP.md` (`npm run baseline:bootstrap`) instead.

## Install into a new repo (recommended)

From this baseline kit repo:

- Initialize a new target folder:
  - `npm run baseline:install -- <target-path> init`
- In the target repo:
  - `npm install`
  - `npm test`
  - Create your first canonical plan:
    - `npm run plans:new -- <slug> "<title>" '@owner' in_progress`

## Install into an existing repo (overlay)

From this baseline kit repo:

- Add baseline files without overwriting existing files:
  - `npm run baseline:install -- <target-path> overlay`
- Preview what would change (no writes):
  - `npm run baseline:install -- <target-path> overlay dry-run verbose`

In the target repo:
- Review/resolve any `package.json` merge conflicts (if reported).
- Run `npm install` (or `npm ci` if appropriate for the repo).
- Run `npm test`.

## Update a repo that already has the baseline

From this baseline kit repo:

- Preview the update:
  - `npm run baseline:install -- <target-path> overlay overwrite dry-run verbose`
- Apply the update (overwrites baseline-managed files that changed):
  - `npm run baseline:install -- <target-path> overlay overwrite verbose`

Notes:
- The installer still does not delete anything in the target repo.
- If the target repo has its own `package.json`, the installer merges baseline scripts/dependencies and will not replace the entire file unless you choose to do so manually.

## Optional CI/security templates

The baseline ships optional GitHub automation templates under `.github/`. Some are opt-in via repository variables (see `docs/ops/runbooks/SECURITY_AUTOMATION.md` and `docs/ops/runbooks/BRANCH_PROTECTION.md`).
