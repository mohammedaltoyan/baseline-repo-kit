---
plan_id: PLAN-202602-ui-only-control-plane
title: Deliver complete UI-only baseline operations flow
owner: @codex
status: in_progress # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S99
updated: 2026-02-19
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: S99 - Tests Gate evidence captured for UI-only control-plane phase
- Next: Ship phase PR and merge to integration branch
- Blockers: none
- ETA: 2026-02-19

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (include PR slicing plan: phase map + mergeable increments; feature flags if needed)
- [x] S03 - Design validation (flows, failure messaging, CI behavior; overrides explicitly defined or none)
- [x] S10 - Define complete UI-only control-plane API contract and target session model
- [x] S20 - Implement engine UI API endpoints for full lifecycle actions and target switching
- [x] S30 - Implement baseline-control operational UI (target/session/options/history) with no-command flows
- [x] S40 - Add selftests/integration checks for UI API lifecycle
- [x] S50 - Update docs/AGENTS onboarding to UI-only default flow
- [x] S95 - Testing coverage design and execution (unit + integration/E2E; perf/load if applicable; evidence recorded)

Phase Map (fill during S02)
- Add phase steps as needed (recommended: S10, S20, S30, ...) where each phase is a mergeable PR (or a small PR series).
- Each PR must include `Plan:` and `Step:` in the PR body; after merge, advance the plan to the next phase step.
- Keep phases time-logical: each phase should be independently valuable and testable.
- S10 - Lock UI-only API contract and operating model.
- S20 - Expand `/api/*` coverage for full engine lifecycle + target/session operations.
- S30 - Upgrade web UI with target selector, action options, and full operation controls.
- S40 - Add API selftests and wire into lint/test gate.
- S50 - Update runbooks/README/AGENTS for UI-first onboarding and operation.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-19T17:55:12.708Z (commit 41ea766775224c054ee5e856a5474e32a76f8a87)
- 2026-02-19 - UI-only operation model finalized: one startup command (`baseline ui`), all lifecycle operations available through UI API and baseline-control interface.
- 2026-02-19 - Engine UI API hardened with explicit JSON/body error contracts (`400 invalid_json_body`, `413 request_body_too_large`) and session target/profile switching.
- 2026-02-19 - Added integration selftest `scripts/tooling/baseline-engine.ui-api.selftest.js` and wired into `lint:engine`.
- 2026-02-19 - Not included in this phase (explicitly deferred): manual visual UAT/screenshot walkthrough; live `--github` provisioning validation against external user/org entitlement matrix.
- PR: pending (branch `codex/202602-ui-only-control-plane`)
- CI Evidence: local `npm test` pass on 2026-02-19

