# PR Policy (Baseline)

## Required in PR body

- `Plan: PLAN-YYYYMM-<slug>`
- `Step: Sxx`

Exception (recommended):
- Dependency automation PRs (Dependabot/Renovate) targeting the integration branch may bypass Plan/Step to keep security and dependency updates flowing. This baseline enforces this in `scripts/ops/pr-policy-validate.js`.
  - When repositories intentionally have zero active canonical plans, `scripts/ops/plan-lint.js` also allows zero-plan PR context for dependency automation PRs (so security/dependency updates are not deadlocked).
- Release promotion PRs (integration -> production) may bypass Plan/Step when repo variable `RELEASE_PR_BYPASS_PLAN_STEP=1` (recommended; avoids redundant planning for a mechanical promotion PR).

Rule of thumb:
- `Step: S00` is plan-only (docs/ops/plans changes only).
- Any code/config change should reference the current plan step/phase and include matching docs/tests as required by the plan.

## CI enforcement (recommended)

- Enable a PR policy check (this repo ships `.github/workflows/pr-policy.yml` which validates `Plan:` + `Step:`, enforces S00 scope, and validates PR target branches using `config/policy/branch-policy.json`).
- If you use GitHub Merge Queue, ensure required checks also run on `merge_group` events (this repo ships `merge_group` triggers on the relevant workflows).
- Bot author enforcement (recommended for agent branches):
  - `AUTOPR_ENFORCE_BOT_AUTHOR` (default `1`)
  - `AUTOPR_ALLOWED_AUTHORS` (default `github-actions[bot],app/github-actions`)
  - `AUTOPR_ENFORCE_HEAD_PREFIXES` (default `codex/`; set `*` to enforce on all PR branches)
  - When enforced, matching branches must have PR author in `AUTOPR_ALLOWED_AUTHORS` or PR Policy fails.
- Release promotion Plan/Step bypass (optional):
  - `RELEASE_PR_BYPASS_PLAN_STEP` (default `1` via bootstrap policy)

## PR targets (enterprise default)

Single integration branch model (recommended):
- Integration branch: `dev` (configurable; SSOT is `config/policy/branch-policy.json`)
- Production branch: `main` (configurable; SSOT is `config/policy/branch-policy.json`)

Rules:
- All feature/fix PRs target `dev`.
- No PRs merge directly into `main` except:
  - Release PR: `dev` -> `main`
- Baseline default in this repo: production is `dev`-only (hotfix prefixes disabled in `config/policy/branch-policy.json`).
- Optional hotfix mode (configuration-driven):
  - Set `hotfix_branch_prefixes` in `config/policy/branch-policy.json` (for example `["hotfix/"]`).
  - If enabled, hotfix PRs to `main` must include a backport note and be reflected back into `dev`.
- Optional automation:
  - Use `Release PR (bot)` workflow (`.github/workflows/release-pr-bot.yml`) to open/refresh the release PR as a bot so a human can approve/merge under required-review rules.

Hotfix backport note (required only when hotfix mode is enabled):
- Add a line in the PR body matching one of the configured markers (SSOT is `config/policy/branch-policy.json`), for example:
  - `Backport: <dev-pr-link>`
  - `Dev PR: <dev-pr-link>`
- Optional automation:
  - Enable repo variable `BACKPORT_ENABLED=1` to turn on `.github/workflows/hotfix-backport.yml`.
  - When enabled, merging a `hotfix/*` PR into production will automatically open a backport PR from production -> integration (default: `main` -> `dev`).
  - You may use `Backport: auto` in the hotfix PR body to satisfy the marker requirement; the workflow will comment with the created backport PR link.

## PR cadence (recommended)

- Prefer frequent, small PRs over long-lived branches.
- Slice work into phases that are mergeable and reviewable in isolation (each phase maps to a plan step, typically S10+).
- Open PRs as soon as the phase is coherent (even if follow-up phases are planned).

## Keep branches up to date (recommended)

- Regularly sync your branch with the base branch to reduce merge conflicts.
- Prefer merge-based updates (avoid rewriting published history):
  - `git fetch origin`
  - `git merge origin/<integration-branch>` (commonly `origin/dev`)

## Local preflight (recommended)

- `npm test`
- Optional: `npm run docs:clean` (report-only) or `DOCS_CLEAN_WRITE=1 npm run docs:clean` (apply)
- Optional (deeper): `npm run test:deep` (E2E: installs baseline into temp repos, runs `npm test`, and runs local bootstrap)
- Optional: `npm run pr:ready -- PLAN-YYYYMM-<slug> require-clean`

## Plan gates

- `npm run plans:objectives:gate:auto -- --plan PLAN-YYYYMM-<slug>` (auto-check S98 when lint passes)
- `npm run plans:gate -- --plan PLAN-YYYYMM-<slug>` (runs `plans:verify`, then checks S99)
- Archive when complete: `npm run plans:archive -- PLAN-YYYYMM-<slug> done`
