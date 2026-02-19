---
plan_id: PLAN-202602-ui-full-e2e-audit
title: Independent full-system E2E audit and optimization hardening
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
- Now: Done
- Next: Archive after merge
- Blockers: none
- ETA: 2026-02-19

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (independent live E2E without relying on repo selftests as the sole source)
- [x] S03 - Design validation (invalid-target behavior and npm arg-forwarding hardening requirements validated)
- [x] S04 - Implementation (engine/UI invalid-target state hardening + bootstrap parser resilience for npm `-- -- --to` forwarding)
- [x] S05 - Docs updated (runbooks, engine/UI README, AGENTS)
- [x] S95 - Testing coverage design and execution (manual live E2E + targeted + full automated gates)

Phase Map (fill during S02)
- S10 - Independent live UI/API E2E audit and issue discovery.
- S20 - Apply hardening fixes for invalid-target runtime state and UI gating.
- S30 - Apply bootstrap parser fix for npm `-- -- --to` forwarding and add regression selftest.
- S40 - Re-run live manual E2E and full repo verification gates.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-19T22:40:04.892Z (commit b1a811fa53f42dd6e6a663f37fc6dc1a1d7ff3bb)
- 2026-02-19 - Live UI E2E exposed invalid-target runtime crash path: connecting a non-writable/non-directory target could trigger `/api/state` runtime exceptions.
- 2026-02-19 - Engine now returns structured invalid-target state (`target_invalid=true`, explicit `status`) and target-bound actions fail fast with deterministic 400 errors.
- 2026-02-19 - UI now treats invalid targets as first-class state (`target_invalid`) with clean action blocking and explicit output messaging.
- 2026-02-19 - Live bootstrap audit exposed npm forwarding fragility for documented usage `npm run baseline:bootstrap -- -- --to ...`; parser now recovers flag tokens passed through positional `_` and selftest enforces this behavior.
- PR: <link(s) to PR(s) if applicable>
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions
- Manual E2E Evidence:
  - Baseline bootstrap + app-stack run artifacts: `/tmp/baseline-manual-e2e-0b5rBq/logs`
  - Live UI browser flow validation executed against `http://127.0.0.1:4190` (unbound startup, invalid target handling, valid target action execution)
