# Contributing (Template)

This repository enforces a plan-driven workflow optimized for many contributors and small, frequent PRs.

Start with:
- `AGENTS.md` (repo rules + objectives)
- `docs/ops/plans/README.md` (planning system)
- `docs/ops/runbooks/PR_POLICY.md` (PR requirements + gates)

## Workflow (required)

1) Create a canonical plan (non-trivial work):
- `npm run plans:new -- <slug> "<title>" '@owner' in_progress`

2) Create a short-lived branch (recommended):
- Use a branch name that includes the plan id (example: `feat/PLAN-YYYYMM-<slug>-<short>`).

3) Open a small PR (phase-scoped):
- PR body must include:
  - `Plan: PLAN-YYYYMM-<slug>`
  - `Step: Sxx`

4) Verify locally:
- `npm install`
- `npm test`
- Optional (deeper): `npm run test:deep`
- Optional (preflight helper): `npm run pr:ready -- --plan PLAN-YYYYMM-<slug> --require-clean --require-up-to-date --fetch`

5) Keep your branch up to date (merge-based):
- `git fetch origin`
- `git merge origin/<default-branch>` (or your integration branch)

## Rules of thumb

- Prefer one plan phase step per PR (S10/S20/...).
- Keep PRs independently mergeable (no "merge this first" chains).
- Avoid hard-coded environment values and duplicated scripts/config.
- Never commit secrets; use `config/env/*.example` templates and local overlays.
