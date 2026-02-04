# PR Policy (Baseline)

## Required in PR body

- `Plan: PLAN-YYYYMM-<slug>`
- `Step: Sxx`

Rule of thumb:
- `Step: S00` is plan-only (docs/ops/plans changes only).
- Any code/config change should reference the current plan step/phase and include matching docs/tests as required by the plan.

## PR cadence (recommended)

- Prefer frequent, small PRs over long-lived branches.
- Slice work into phases that are mergeable and reviewable in isolation (each phase maps to a plan step, typically S10+).
- Open PRs as soon as the phase is coherent (even if follow-up phases are planned).

## Keep branches up to date (recommended)

- Regularly sync your branch with the base branch to reduce merge conflicts.
- Prefer merge-based updates (avoid rewriting published history):
  - `git fetch origin`
  - `git merge origin/<default-branch>`

## Local preflight (recommended)

- `npm test`
- Optional: `npm run docs:clean` (report-only) or `DOCS_CLEAN_WRITE=1 npm run docs:clean` (apply)
- Optional: `npm run pr:ready -- --plan PLAN-YYYYMM-<slug> --require-clean`

## Plan gates

- `npm run plans:objectives:gate:auto -- --plan PLAN-YYYYMM-<slug>` (auto-check S98 when lint passes)
- `npm run plans:gate -- --plan PLAN-YYYYMM-<slug>` (runs `plans:verify`, then checks S99)
- Archive when complete: `npm run plans:archive -- PLAN-YYYYMM-<slug> done`
