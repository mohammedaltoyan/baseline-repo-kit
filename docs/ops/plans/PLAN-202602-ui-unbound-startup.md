---
plan_id: PLAN-202602-ui-unbound-startup
title: UI unbound startup and repo selection hardening
owner: @codex
status: done # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S99
updated: 2026-02-19
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/ops/runbooks/BASELINE_ENGINE.md#ui
---

At-a-Glance
- Now: S99 - Verification and closeout
- Next: Archive after merge
- Blockers: none
- ETA: 2026-02-19

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (UI starts without `--target`; target selection/clearing moved entirely to UI session controls)
- [x] S03 - Design validation (engine returns explicit `target_required` state and blocks target-bound operations with clear errors)
- [x] S04 - Implementation (engine session/state hardening, UI set/clear target UX, action-blocking logic, API + UI E2E updates)
- [x] S05 - Docs updated (runbooks, engine/UI READMEs, AGENTS command guidance)
- [x] S95 - Testing coverage design and execution (engine API selftest + UI E2E selftest + full repo gates)

Phase Map (fill during S02)
- S10 - Engine unbound startup model (`target_not_set`, `target_required`, target-bound endpoint guards).
- S20 - UI session/UX updates (set target, clear target, action readiness blocking/unblocking).
- S30 - E2E hardening (engine API + UI flow tests covering no-target boot, clear target, edge error states).

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-19T19:35:03.027Z (commit 7a60515eff7540450eede10aae709ef5fe707ff5)
- 2026-02-19 - Baseline UI startup is now unbound by default; target repository is selected/cleared only through `POST /api/session`.
- 2026-02-19 - `GET /api/state` returns non-error guidance payload (`target_required=true`) when no target is selected; execution endpoints return `400 target_not_set`.
- 2026-02-19 - UI blocks target-bound actions when target is missing/invalid and surfaces explicit reason (`target_not_set`, `target_exists_but_not_directory`, `target_not_writable`).
- PR: <link(s) to PR(s) if applicable>
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions
- CI Evidence:
  - `node scripts/tooling/baseline-engine.ui-api.selftest.js` (pass)
  - `node scripts/tooling/baseline-control.ui-e2e.selftest.js` (pass)
  - `npm run lint:engine` (pass)
  - `npm test` (pass)
