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
- Branch policy SSOT: `config/policy/branch-policy.json` defines the integration + production branches and allowed PR targets/sources (default: `dev` -> `main`, hotfix via `hotfix/*`). Keep PRs targeting the integration branch except for release/hotfix.
- Optional hotfix backport automation (recommended): enable repo var `BACKPORT_ENABLED=1` to auto-open a production -> integration backport PR after a hotfix merge (ships as `.github/workflows/hotfix-backport.yml`).
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
- Keep evidence plan-scoped (S99): record what ran and what passed (CI links and/or artifact paths).
- For workflow/orchestration changes, include integration/E2E scenarios that exercise the configuration-driven paths.
- For security/permissions changes, include explicit allow/deny tests.

## Frontend UI/UX Screenshot Iteration (If Applicable; Must When Doing UI Work)

When working on frontend UI/UX:

- Work is screenshot-driven: request/review screenshots for the affected screens and states (including edge/error/empty/loading states) and iterate until the result matches the objectives and scope.
- Analyze screenshots for usability, accessibility, responsiveness, consistency, and clarity (no redundant UI patterns; no hard-coded environment assumptions).
- Provide concrete, actionable iteration notes per screen/state, and re-review updated screenshots until complete.
- Record UI verification evidence in the plan (S99) and/or PR (screenshots, short videos, notes) in the target repo (do not commit project-specific evidence into this baseline kit).

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

## Build, Test, and Development Commands (Baseline)

- `npm test` runs baseline guardrails (plans + objectives + structure).
- `npm run docs:clean` validates docs hygiene (and can optionally fix issues via env flags when supported).
- `npm run pr:ready` runs baseline gates before opening a PR (and can optionally enforce clean/up-to-date branches).
- One-button new repo setup (recommended): `npm run baseline:bootstrap -- --to <target-path> [--github]` (installs baseline, inits git/branches, optional GitHub provisioning, optional tests).
- Optional installer to overlay this kit onto another repo:
  - Safe positional form: `npm run baseline:install -- <target-path> [overlay|init] [overwrite] [dry-run] [verbose]`
  - Flag form (safe with modern npm): `npm run baseline:install -- --to <path> --mode overlay --dry-run`

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
