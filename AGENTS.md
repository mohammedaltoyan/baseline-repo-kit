# Repository Guidelines (Baseline Kit)

This baseline kit is intended to be **copy/paste friendly** into any new repository (any stack, any domain).
Anything project-, tenant-, vendor-, or environment-specific belongs in the target project (not here).

## Core System Objectives (Must)

- SIMPLE, SCALABLE, DYNAMIC, and FAST.
- ZERO REDUNDANCY and ZERO HARD CODING across all layers.
- Each script is written once: reusable, parameterized, and dynamic (no copy/paste variants).
- Workflow/row-driven where applicable: behavior is data-defined (rows/config/templates), not scattered hardcoded branches.
- Single source of truth (SSOT): configuration, decisions, and logs live in canonical modules/tables/files (no shadow copies).
- Optimization matters: prioritize fast feedback loops (local + CI) and good runtime performance; measure before/after for performance-sensitive work.
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
- Keep your branch up to date with the base branch (merge-based; do not rewrite published history):
  - Before opening a PR (and before re-requesting review): `git fetch origin` then `git merge origin/<default-branch>`.
  - After each PR iteration (new commits on base branch): merge again so you are testing against the latest base.
  - After a PR merges, update your local base branch and start the next phase/PR from the updated base (or merge the updated base into your next branch).
- Avoid destructive git operations on shared branches: no `git reset --hard`, no force-push, no rebase-after-push.
- If you use `git worktree` (recommended for parallel work):
  - One worktree per branch/PR to prevent cross-branch contamination.
  - Keep env overlays per worktree (`ENV_FILE=...`) and keep caches/build artifacts isolated when they cause nondeterminism.
- If GitHub Merge Queue is enabled:
  - Do not re-queue repeatedly. Queue once and wait for completion in order.
  - Do not push new commits while queued (it invalidates the queue run). If changes are required, update the branch, then queue once.
- Do not "spam" update/queue actions; let the queue proceed and only intervene when a run completes/fails.

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

- Add tests with every change when applicable; update tests when modifying existing behavior.
- Prefer deterministic tests and reproducible local/CI runs.
- Keep evidence plan-scoped (S99): record what ran and what passed (CI links and/or artifact paths).
- For workflow/orchestration changes, include integration/E2E scenarios that exercise the configuration-driven paths.
- For security/permissions changes, include explicit allow/deny tests.

## Database Change Policy (If Applicable; Must When Using a DB)

- Never change shared environments manually (no ad-hoc DDL/DML). Changes must be tracked (migrations, versioned config, or approved tooling).
- Treat migrations as append-only: fix prior objects with new migrations (`ALTER`, `CREATE OR REPLACE`), never edit history once shared.
- RLS/policies (if supported): enable least-privilege access for user-facing tables and test allow/deny paths.
- Avoid hard-coded customer/account identifiers inside migrations and seed data.

## Project Structure & Module Organization (Baseline Rules)

- Keep baseline artifacts generic: no vendor SDK scaffolds, no product schemas, no one-off demos.
- Keep repo root clean; prefer `scripts/`, `config/`, `docs/`, `.github/` for baseline tooling and templates.
- Do not track generated artifacts (logs, caches, exports, `node_modules`, secret env files).
- Keep "generated dashboards" generated: do not hand-edit; regenerate via commands.

## Build, Test, and Development Commands (Baseline)

- `npm test` runs baseline guardrails (plans + objectives + structure).
- `npm run docs:clean` validates docs hygiene (and can optionally fix issues via env flags when supported).
- `npm run pr:ready` runs baseline gates before opening a PR (and can optionally enforce clean/up-to-date branches).
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
