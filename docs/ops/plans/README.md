# Planning System

Canonical plans live under `docs/ops/plans/` and are required for non-trivial work.

## Files

- `PLAN-YYYYMM-<slug>.md` - a single canonical plan (frontmatter + checklist)
- `FOCUS.json` - per-owner focus pointer (generated via commands)
- `INDEX.md` - generated dashboard (generated via commands)
- `archive/` - archived plans
- `review/` - optional plan summaries (generated via `plans:summarize`)

## Commands

- Create: `npm run plans:new -- <slug> "<title>" '@owner' in_progress`
- Focus: `npm run plans:focus -- '@owner' PLAN-YYYYMM-<slug> Sxx`
- Advance step: `npm run plans:advance -- PLAN-YYYYMM-<slug> Sxx`
- Verify: `npm run plans:verify` (runs `npm test`)
- Gate tests: `npm run plans:gate -- --plan PLAN-YYYYMM-<slug>` (checks off S99)
- Archive: `npm run plans:archive -- PLAN-YYYYMM-<slug> done`
- Regenerate dashboard: `npm run plans:index`

## Rules

- No plan, no work.
- Do not edit `FOCUS.json` or `INDEX.md` by hand.
- Keep plan steps small and mergeable.
- Prefer phase-based steps (often S10/S20/...) so each PR maps cleanly to a single plan phase.
