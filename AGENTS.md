# Repository Guidelines (Baseline Kit)

This baseline kit is intended to be **copy/paste friendly** into any new repository (any stack, any domain).
Anything project-, tenant-, vendor-, or environment-specific belongs in the target project (not here).

## Our Objectives (Must)

- The system must be SIMPLE, SCALABLE, and DYNAMIC, with ZERO REDUNDANCY and ZERO HARD CODING across all layers.
- Every script must be written once - complete, reusable, and fully dynamic - ensuring it never needs to be rewritten.
- All code must be optimized for speed and high quality.
- Everything must be thoroughly tested, including edge cases:
  - Create or update proper quality tests for all work performed.
  - All tests must pass, and best practices in testing must always be followed.
- All work must strictly follow the system structure, system flow, and established system patterns to maintain consistency, clarity, and scalability across all components.
- The system must be workflow-engine oriented and row-driven by configuration.
- A single source of truth must exist for everything, including logs, decisions, flows, and configuration.
- Any major or foundational information for the agent (objectives, repository policies, architectural rules, workflows, operating principles) must be reflected and kept up to date in this `AGENTS.md` file so the system becomes self-guiding over time.
- Documentation must be created if missing and updated if existing, ensuring docs reflect the current system state, decisions, and standards. The repository must remain clean and clearly structured with no neglected, outdated, or orphaned files.
- You are encouraged to challenge anything illogical or misaligned with these objectives. When needed, search the internet for the latest approaches and standards relevant to the task (prefer primary sources/official docs) so decisions stay up to date.
- You must commit upon completing each phase. If untracked files are detected, take ownership, review them, and commit all of them.
- You must frequently open pull requests, complete reviews, and merge properly. After merging, merge `origin/dev` (or your integration/base branch) into your branch to stay up to date, then proceed to the next step and phase.
- Security by default: principle of least privilege; never commit secrets; validate access controls and denial paths.

## Generic-Only Policy (Must)

- No customer/project names, IDs, domains, or URLs in baseline source.
- No vendor scaffolds, SDK-specific wiring, or product schemas.
- Keep docs as templates and runbooks; keep automation reusable across repos.
- If a rule cannot be made generic, move it to the target project's own docs/config.

## Configuration Overrides / Scope Ladder (If Applicable; Must When Multi-Tenant)

If your system has multiple override scopes (multi-tenant, multi-client, multi-sender, etc.):

- Define a single canonical precedence ladder (example: Global < Tenant < Client < Sender < Source/Resource).
- Resolve effective settings only via a central resolver function/module (never "pick a scope" ad-hoc).
- Log resolution decisions (evaluated scopes + chosen source) in a canonical decision log so behavior is explainable.
- Add tests that assert precedence and verify resolution logs exist for critical decisions.

## Branching, PRs, Worktrees, and Merge Queue (Must)

- Prefer frequent, small PRs over long-lived branches.
- Slice work into plan phases so each PR is independently reviewable/testable (often 1 plan step/phase per PR).
- Branch naming (recommended): include the plan id + intent so parallel work stays readable, e.g. `feat/PLAN-YYYYMM-<slug>-<short>`.
- Branch policy SSOT: `config/policy/branch-policy.json` defines the integration + production branches and allowed PR targets/sources. Baseline hardened default in this repo is release-only (`dev` -> `main`) with hotfix prefixes disabled. Keep PRs targeting the integration branch except for release.
- Merge method policy (baseline default): integration PRs are squash-only; production PRs are merge-commit-only (prevents recurring integration -> production conflicts caused by squash releases). Enforced via GitHub rulesets provisioned by `npm run baseline:bootstrap -- -- --to <target-path> --github` using `config/policy/bootstrap-policy.json`.
- Optional hotfix backport automation (only when hotfix prefixes are enabled): set repo var `BACKPORT_ENABLED=1` to auto-open a production -> integration backport PR after a hotfix merge (ships as `.github/workflows/hotfix-backport.yml`).
- Keep your branch up to date with the base/integration branch (merge-based; do not rewrite published history):
  - Use your repo's canonical integration branch (commonly `origin/<default-branch>`; some orgs use `origin/dev`).
  - Before opening a PR (and before re-requesting review): `git fetch origin` then `git merge origin/<integration-branch>`.
  - After each PR iteration (new commits on base branch): merge again so you are testing against the latest base.
  - After a PR merges, update your local base branch and start the next phase/PR from the updated base (or merge the updated base into your next branch).
- Avoid destructive git operations on shared branches: no `git reset --hard`, no force-push, no rebase-after-push.
- Prefer short-lived branches:
  - Open PRs early (phase-scoped) and merge as soon as green + reviewed.
  - Avoid stacking unrelated changes in a single branch; use multiple branches/worktrees instead.
- If you use `git worktree` (recommended for parallel work):
  - One worktree per branch/PR to prevent cross-branch contamination.
  - Strict isolation: work only within your assigned worktree. Do not modify, interfere with, or depend on files in other worktrees. Synchronize changes only through the approved branching/PR merge process.
  - Keep env overlays per worktree (`ENV_FILE=...`) and keep caches/build artifacts isolated when they cause nondeterminism.
- If GitHub Merge Queue is enabled:
  - Do not re-queue repeatedly. Queue once and wait for completion in order.
  - Do not push new commits while queued (it invalidates the queue run). If changes are required, update the branch, then queue once.
  - Do not spam update/queue actions; let the queue proceed and only intervene when a run completes/fails.

## Mandatory Plan Gate (No Edits Without a Plan) (Must)

- Every non-trivial change requires a canonical plan under `docs/ops/plans/PLAN-YYYYMM-<slug>.md`.
- Do not ship code/docs changes without an open plan (`draft|queued|in_progress`).
- PR bodies must include `Plan:` and `Step:` and should state what changed + how it was verified.
- Do not edit generated plan dashboards by hand (`docs/ops/plans/FOCUS.json`, `docs/ops/plans/INDEX.md`). Use commands.

Plan lifecycle commands (baseline defaults):
- `npm run plans:new -- <slug> "<title>" '@owner' in_progress`
- `npm run plans:focus -- '@owner' PLAN-YYYYMM-<slug> Sxx`
- `npm run plans:advance -- PLAN-YYYYMM-<slug> Sxx`
- `npm run plans:index`
- `npm run plans:verify` (runs baseline verification)
- `npm run plans:gate -- --plan PLAN-YYYYMM-<slug>` (checks off S99 after verification)
- `npm run plans:archive -- PLAN-YYYYMM-<slug> done`

Planning discipline:
- Treat each plan phase as a logical unit of time and scope (often mapped to a single PR).
- Prefer phase steps like `S10`, `S20`, `S30`, ... for PR-sized increments.
- Keep phase boundaries explicit: each phase should be independently valuable, testable, and mergeable.

## Objective Compliance Before Submission (Must)

- Zero hardcoding: behavior is driven by configuration and environment (no inline constants tied to a specific project/customer/flow).
- Zero redundancy: shared logic lives in common modules/templates; avoid duplicated scripts/SQL/logic.
- Dynamic by design: scripts/functions accept parameters, are idempotent where applicable, and avoid provider assumptions.
- Fast by default: keep PR checks fast; move slow suites behind explicit commands and run them when needed.
- Workflow/row-driven where applicable: behavior is steered by configuration, not scattered conditionals.
- SSOT: decisions/state/config do not drift across duplicated files or shadow logs.
- Security: secrets never committed; least privilege; validate allow/deny paths for sensitive operations.
- Tests: every behavior change is validated by appropriate tests; update tests when behavior changes.
- Documentation: update templates/runbooks so future projects can extend without hardcoding.

## Change Management & Testing Policy (Must)

- Add tests with every change when applicable; update tests when modifying existing behavior (including edge cases and failure modes).
- Prefer deterministic tests and reproducible local/CI runs.
- Selftests must be hermetic across baseline install/bootstrap contexts (do not rely on repo-specific canonical plans or local-only fixtures unless they are created/cleaned up by the test itself).
- Keep evidence plan-scoped (S99): record what ran and what passed (CI links and/or artifact paths).
- For workflow/orchestration changes, include integration/E2E scenarios that exercise the configuration-driven paths.
- For security/permissions changes, include explicit allow/deny tests.
- For GitHub bootstrap/provisioning capability changes, run live matrix verification (`npm run test:github:live -- --execute`) against at least one user-owned and one org-owned scenario when org access exists.

## Frontend UI/UX Screenshot Iteration (If Applicable; Must When Doing UI Work)

When working on frontend UI/UX:

- Work is screenshot-driven: request/review screenshots for the affected screens and states (including edge/error/empty/loading states) and iterate until the result matches the objectives and scope.
- Analyze screenshots for usability, accessibility, responsiveness, consistency, and clarity (no redundant UI patterns; no hard-coded environment assumptions).
- Provide concrete, actionable iteration notes per screen/state, and re-review updated screenshots until complete.
- Record UI verification evidence in the plan (S99) and/or PR (screenshots, short videos, notes) in the target repo (do not commit project-specific evidence into this baseline kit).
- Use `npm run test:ui:walkthrough` to generate a repeatable screenshot checklist and precheck report before/while collecting UI evidence.

## Database Change Policy (If Applicable; Must When Using a DB)

- Never change shared environments manually (no ad-hoc DDL/DML). Changes must be tracked (migrations, versioned config, or approved tooling).
- Treat migrations as append-only: fix prior objects with new migrations (`ALTER`, `CREATE OR REPLACE`), never edit history once shared.
- RLS/policies (if supported): enable least-privilege access for user-facing tables and test allow/deny paths.
- Avoid hard-coded customer/account identifiers inside migrations and seed data.

## Project Structure & Module Organization (Baseline Rules)

- Keep baseline artifacts generic: no vendor SDK scaffolds, no product schemas, no one-off demos.
- Keep repo root clean and predictable. Baseline tooling lives under `scripts/`, `config/`, `docs/`, `.github/`, `tooling/`.
- Monorepo (recommended default): keep backend + frontend in a single repo with clear boundaries:
  - `apps/` - deployable units (example: `apps/backend/`, `apps/frontend/`).
  - `packages/` - shared libraries/config (no direct app-to-app coupling; share through packages).
  - `tooling/` - internal tooling and scripts (standalone tooling apps go under `tooling/apps/`).
- Do not track generated artifacts (logs, caches, exports, `node_modules`, secret env files).
- Keep "generated dashboards" generated: do not hand-edit; regenerate via commands.

## App Stack Contract SSOT (Must)

- Baseline runtime app integration is contract-first:
  - Shared SSOT: `packages/shared/app-stack-contract.js`
  - Backend runtime: `apps/backend/`
  - Frontend runtime: `apps/frontend/`
- Backend and frontend must not duplicate contract/config parsing logic; both must consume shared helpers from `packages/shared/`.
- Frontend endpoint wiring must be contract-discovered (`/api/v1/contract`), OpenAPI-discovered (`/api/v1/openapi.json`), and metadata-driven (`/api/v1/meta`) rather than hardcoded route tables.
- Backend API errors should use RFC 9457 problem-details payloads (`application/problem+json`) with stable machine-readable codes.
- Any new cross-app runtime setting must be added once in the shared contract module and surfaced in metadata catalog for UI explanations.

## Build, Test, and Development Commands (Baseline)

- `npm test` runs baseline guardrails and app-stack tests (shared + backend + frontend).
- `npm run docs:clean` validates docs hygiene (and can optionally fix issues via env flags when supported).
- `npm run pr:ready` runs baseline gates before opening a PR (and can optionally enforce clean/up-to-date branches).
- `npm run start:backend` runs the generic backend API runtime.
- `npm run start:frontend` runs the generic frontend runtime server.
- `npm run test:apps` runs integrated app-stack suites.
- `npm run test:ui:walkthrough` runs app-stack prechecks and generates manual screenshot walkthrough artifacts.
- `npm run test:github:live` previews GitHub owner-type entitlement matrix validation (`--execute` for live ephemeral provisioning validation).
- One-button new repo setup (recommended): `npm run baseline:bootstrap -- -- --to <target-path> [--github]` (installs baseline, inits git/branches, optional GitHub provisioning, optional tests).
  - Initial bootstrap commit identity is configurable via `--git-user-name` / `--git-user-email` (or env `BASELINE_GIT_USER_NAME` / `BASELINE_GIT_USER_EMAIL`); if missing, bootstrap falls back to a default bot identity and emits a warning.
- Optional installer to overlay this kit onto another repo:
  - Safe positional form: `npm run baseline:install -- <target-path> [overlay|init] [overwrite] [dry-run] [verbose]`
  - Flag form (safe with modern npm): `npm run baseline:install -- --to <path> --mode overlay --dry-run`
- Baseline Engine v2.2 (settings-driven, capability-aware):
  - `npm run baseline:init -- --target <target-path>`
  - `npm run baseline:ui` (no target required at startup; set/clear target in UI)
  - `npm run baseline:diff -- --target <target-path>`
  - `npm run baseline:apply -- --target <target-path>`
  - `npm run baseline:upgrade -- --target <target-path>`
  - `npm run baseline:doctor -- --target <target-path>`
- `npm run baseline:verify -- --target <target-path>`
- UI-first operation mode is mandatory for interactive usage:
  - Start once with `npm run baseline:ui`.
  - After startup, run lifecycle actions from UI only (`init`, `diff`, `doctor`, `verify`, `upgrade`, `apply`, capability refresh, config save, target/profile set/clear).
- UI flow E2E selftest coverage is mandatory in engine gates:
  - `scripts/tooling/baseline-control.ui-e2e.selftest.js` validates unbound startup (no target), target set/clear, invalid-target handling (`target_exists_but_not_directory`, `target_not_writable`), action blocking/unblocking by target validity, settings save, full action-button lifecycle, and UI error-surface behavior through browser-flow logic (no CLI command invocation for lifecycle operations).

## Baseline Engine v2.2 (Must)

- Baseline behavior must be generated from settings (`.baseline/config.yaml`) and capability probes (`.baseline/capabilities/github.json`), not hardcoded in scripts/workflows.
- Config schema SSOT is `config/schema/baseline-config.schema.json`; runtime validation must compile/execute this schema (do not duplicate parallel rule sets in command code).
- Locked-decision SSOT for v2.2 is `config/policy/baseline-v22-contract.json`; CI must enforce it via `scripts/ops/baseline-v22-contract-lint.js` (`npm run lint:contract`).
- Managed upgrades must be migration-based (`scripts/tooling/migrations/<semver>/`) with explicit state tracking in `.baseline/state.json`.
- Generated file ownership and merge strategy must be tracked in `.baseline/managed-files.json`.
- Module generators are the only source for managed outputs; core engine orchestrates modules and does not hardcode module artifacts.
- New baseline features must ship as modules under `tooling/apps/baseline-engine/modules/` with:
  - `module.json`
  - `schema.fragment.json`
  - `capability_requirements.json`
  - `generators/`
  - `migrations/`
- Managed file writes must use declared strategies (`replace`, `json_merge`, `yaml_merge`, `three_way`) and preserve explicit user blocks marked with `baseline:user-block <id>:begin/end`.
- `three_way` merges must use baseline base snapshots from `.baseline/internal/base-content.json`; upgrade rollback snapshots must be written under `.baseline/snapshots/`.
- Capability-aware behavior is mandatory:
  - Engine computes required capabilities from enabled modules.
  - Required capabilities must be settings-aware (only enforce capabilities for enabled behaviors).
  - Unsupported capabilities auto-degrade and warn.
  - `policy.require_github_app=true` enforces capability requirements as hard failures.
- Dynamic normalization is mandatory:
  - For `branching.topology` values `two_branch|three_branch|trunk`, `branching.branches` must be regenerated from the preset graph (no drift between preset selection and branch graph).
  - Only `branching.topology=custom` may persist user-defined branch graphs.
  - `deployments.approval_matrix` must be normalized to the `{environment x component}` cartesian matrix while preserving explicit row overrides.
- Decision logging is mandatory: emit effective governance/capability decisions to `config/policy/baseline-resolution-log.json` so matrix/threshold/topology behavior is explainable from SSOT artifacts.
- Effective settings SSOT is mandatory: define rule rows in `config/policy/effective-settings-rules.json` (schema `config/schema/effective-settings-rules.schema.json`) and derive configured-vs-effective overrides once in `tooling/apps/baseline-engine/lib/policy/effective-settings.js`; reuse that output in generators, insights, UI, and decision logs (no per-surface override logic duplication).
- Effective rule conditions must be predicate-based and extensible (`equals`, `not_equals`, `in`, `not_in`) so new setting gates can be added via config rows without evaluator rewrites; legacy boolean condition fields are compatibility-only.
- Auto-degrade visibility is mandatory: every effective override must be emitted as an explicit warning in apply output (path + reason + remediation), never silently applied.
- Module capability requirements must be derived from module base requirements plus matching effective-rule rows (for example via `deriveModuleCapabilityRequirements`) so settings-driven capability gating never depends on module-local hardcoded conditions.
- Governance matrix SSOT is mandatory: reviewer thresholds, branch-role required checks, deployment approval enforcement mode, and GitHub App status/reason must be computed once in `tooling/apps/baseline-engine/lib/insights.js` and consumed by doctor/UI/log outputs (no duplicated derivation logic).
- GitHub entitlement advisories are mandatory in the same SSOT path: derive owner-type/visibility feature advisories (for example merge queue and deployment environment protections) centrally and surface them as non-blocking guidance in UI/log outputs.
- CI lane control must remain classifier-driven via generated `config/ci/baseline-change-profiles.json` and `scripts/ops/ci/change-classifier.js` (no per-repo hardcoded lane logic).
- Workflow action references must be settings-driven (`ci.action_refs`) so pinning policy can be centrally controlled.
- Baseline GitHub workflows must follow checkout credential SSOT in `config/policy/workflow-security.json`: `actions/checkout` must set `persist-credentials` explicitly, default `false`, with explicit allowlisted write flows only.
- UI explanation + capability-label SSOT is `config/schema/baseline-ui-metadata.json`, governed by `config/schema/baseline-ui-metadata.schema.json`; runtime and CI must validate metadata structure, section references, and capability keys.
- UI control-plane API is contracted in engine runtime (`tooling/apps/baseline-engine/lib/commands/ui.js`) and must include lifecycle endpoints (`/api/init|diff|doctor|verify|upgrade|apply`), settings/session endpoints (`/api/config`, `/api/session`), and discovery/state endpoints (`/api/operations`, `/api/state`, `/api/refresh-capabilities`) with explicit error signaling for invalid JSON (`400`) and oversized payloads (`413`).
- If `security.require_pinned_action_refs=true`, generated workflow action refs must be full SHA pins and doctor must fail otherwise.
- Deployment OIDC behavior must be settings-driven (`deployments.oidc`) with secure defaults and no hardcoded cloud vendor assumptions.
- For generated GitHub Actions workflows, if a job defines `permissions`, include every required scope there (for OIDC: `id-token: write`) because job-level `permissions` override workflow-level defaults.
- Backward compatibility default: new modules/features are opt-in unless an explicit migration enables them.

## Profiles (Baseline Install/Bootstrap)

- SSOT: `config/policy/install-profiles.json` defines available baseline install profiles and optional bootstrap defaults.
- `baseline:install` and `baseline:bootstrap` accept `--profile <name>` to filter which baseline artifacts are installed.
- Target repos receive a small lock file `config/baseline/baseline.lock.json` to record the selected profile so overlay updates remain deterministic.
- Profiles may define `bootstrap_defaults` (for example `enableDeploy`, `enableSecurity`, hardening toggles) that apply when bootstrap flags are omitted.

## Deploy Isolation + Approvals (GitHub Environments)

SSOT (recommended):
- Deploy surface registry: `config/deploy/deploy-surfaces.json` (project-owned; created from `config/deploy/deploy-surfaces.example.json` by bootstrap when deploy is enabled).
  - Defines surfaces (`surface_id`), change matchers (`paths_include_re`, `paths_exclude_re`), environment naming, approval environment naming, and optional allowed secret/var keys.

Workflows:
- Leaf executor: `.github/workflows/deploy.yml`
  - Internal-only: refuses direct human runs (expects to be dispatched by promote workflows).
  - Runs each deploy job in a **surface+tier GitHub Environment** (secrets isolation boundary).
  - Writes auditable deploy receipts to an evidence branch on success (`DEPLOY_RECEIPTS_BRANCH`, `DEPLOY_RECEIPTS_PREFIX`).
- Orchestrators:
  - `.github/workflows/promote-staging.yml` requires an explicit GitHub Environment approval click before staging deploys.
  - `.github/workflows/promote-production.yml` requires an explicit GitHub Environment approval click before production deploys and can enforce staging receipts for the same SHA.

Approval modes (dynamic):
- `commit`: one approval unlocks all affected surfaces for the promotion run.
- `surface`: one approval per affected surface.
- Precedence: workflow input `approval_mode` > repo var default (`STAGING_APPROVAL_MODE_DEFAULT`, `PRODUCTION_APPROVAL_MODE_DEFAULT`) > registry default.

Fallback (when registry is missing):
- Deploy environment name resolution falls back to:
  - `DEPLOY_ENV_MAP_JSON` (preferred legacy SSOT; JSON mapping: component -> {staging, production})
  - Legacy override (takes precedence when set): `DEPLOY_ENV_<COMPONENT>_<TIER>`
- Promote workflows fall back to a single `component` input when they cannot auto-detect surfaces.

Isolation lint (API-based):
- Script: `scripts/ops/env-isolation-lint.js`
- Workflow: `.github/workflows/env-isolation-lint.yml` (required check; fail-closed when enabled)
- Hardened default: `ENV_ISOLATION_LINT_ENABLED=1`; auth token resolution order is `ENV_ISOLATION_TOKEN` then `GITHUB_TOKEN` (workflow needs `actions: read`). If no usable token exists, lint fails closed.

## Code Owner Review Automation (Baseline)

- CODEOWNERS SSOT is policy-driven via `config/policy/bootstrap-policy.json` (`github.codeowners`).
- `baseline:bootstrap --github` ensures fallback `.github/CODEOWNERS` ownership when missing/template-only:
  - Default owners from `github.codeowners.default_owners` (default: `$repo_owner_user`)
  - CLI override supported: `--codeowners=<csv>` (users and/or `org/team`)
- Deadlock prevention is mandatory:
  - If required approvals + code-owner review are enabled, PR author identity must be different from reviewer identity.
  - Use a dedicated automation account/token for authored PRs; keep human maintainers/code owners as approvers.
  - Preferred baseline default: Auto-PR workflow (`.github/workflows/auto-pr.yml`) opens PRs as the GitHub Actions bot (`github-actions[bot]` / `app/github-actions`) for `codex/**` branches (gated by `AUTOPR_ENABLED` repo var).
  - Auto-PR opening must be idempotent: if GitHub reports a duplicate existing PR for the same head/base, treat it as non-fatal and continue using the existing PR.
  - Auto-PR should no-op successfully when a `codex/**` branch has no file diff against integration (for example, post-merge sync commits), rather than failing plan inference.
  - Auto-PR plan inference must accept canonical plan changes in both active and archived paths (`docs/ops/plans/PLAN-*.md` and `docs/ops/plans/archive/PLAN-*.md`) so lifecycle archive PRs remain policy-compliant.
  - Bootstrap SSOT enables required Actions workflow permission (`github.workflow_permissions.can_approve_pull_request_reviews=true`) so `GITHUB_TOKEN` can create PRs.
  - Fallback for restricted org policy: configure repo secret `AUTOPR_TOKEN` (bot PAT); Auto-PR uses it when present.
  - PR Policy can enforce bot-only authorship for agent branches:
    - `AUTOPR_ENFORCE_BOT_AUTHOR` (default `1`)
    - `AUTOPR_ALLOWED_AUTHORS` (default `github-actions[bot],app/github-actions`)
    - `AUTOPR_ENFORCE_HEAD_PREFIXES` (default `codex/`; set `*` for all branches)
  - Release promotion PR automation:
    - Workflow: `.github/workflows/release-pr-bot.yml` (opens/refreshes `dev` -> `main` as a bot so a human can approve/merge)
    - Optional redundancy reduction: `RELEASE_PR_BYPASS_PLAN_STEP=1` allows release promotion PRs to omit `Plan:`/`Step:` (recommended default; underlying changes already carried plans).
  - Plan lint compatibility for automation PRs:
    - `scripts/ops/plan-lint.js` allows zero-plan PR context for dependency automation PRs (Dependabot/Renovate), preventing CI deadlocks when no active canonical plans currently exist.
    - `scripts/ops/plan-lint.js` also allows zero-plan release promotion PRs when `RELEASE_PR_BYPASS_PLAN_STEP=1`.

## Commit & Pull Request Guidelines (Recommended)

- Keep commits and PRs scoped and phase-aligned.
- Prefer additive changes over breaking changes.
- Include verification notes in the PR (what you ran) and link evidence when relevant.
- Refresh your branch with the latest base branch before final review/merge/queue.

## Multi-Agent Collaboration Policy (Must)

- Commit all relevant files touched for a change (docs + tooling + tests); do not leave partial work untracked in shared repos.
- Never reset/force-push/rewrite history on shared branches.
- Prefer additive changes; do not delete shared-contract files without explicit intent and coordination.
- Do not edit files that another agent is actively changing unless coordinating.
- Keep migrations append-only and contracts stable; coordinate breaking changes explicitly.
- Avoid cross-PR coupling:
  - Do not land changes that require a follow-up PR to "make it work".
  - Keep each PR independently green, mergeable, and plan-scoped.

## Agent Response Style (Recommended)

- Keep replies brief and high-level by default.
- Avoid deep technical details unless explicitly requested.
- Prefer actionable next steps over long explanations.

## Planning & Execution Tracking (Must)

- Source of truth: `docs/ops/plans/README.md` and canonical plans under `docs/ops/plans/`.
- Canonical plans are required for non-trivial work; PRs must reference `Plan:` and `Step:`.
- Use only commands for plan lifecycle changes (create/advance/focus/gate/archive/index).
- S98 (Objectives Gate) is a deliberate check: record "Objectives Evidence:" in the plan.
- S99 (Tests Gate) requires recording evidence of passing suites and relevant verification.
