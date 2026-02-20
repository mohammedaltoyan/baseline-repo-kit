---
plan_id: PLAN-202602-ui-only-e2e-hardening
title: Harden baseline-control UI-only end-to-end flow
owner: @codex
status: done # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S99
updated: 2026-02-19
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: S99 - UI-only E2E flow coverage and error-handling validation complete
- Next: Merge PR and keep UI-only lifecycle policy enforced
- Blockers: none
- ETA: 2026-02-19

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (include PR slicing plan: phase map + mergeable increments; feature flags if needed)
- [x] S03 - Design validation (flows, failure messaging, CI behavior; overrides explicitly defined or none)
- [x] S04 - Implementation (deliver via one or more small PRs; list the key deliverables)
- [x] S05 - Docs updated (update guides/runbooks/AGENTS as needed; avoid duplicating SSOT policy text)
- [x] S95 - Testing coverage design and execution (unit + integration/E2E; perf/load if applicable; evidence recorded)

Phase Map (fill during S02)
- Add phase steps as needed (recommended: S10, S20, S30, ...) where each phase is a mergeable PR (or a small PR series).
- Each PR must include `Plan:` and `Step:` in the PR body; after merge, advance the plan to the next phase step.
- Keep phases time-logical: each phase should be independently valuable and testable.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-19T19:15:34.709Z (commit 45133a6e28f397e5b95d390f6ecca7dac01a7a5e)
- 2026-02-19 - Added dedicated UI-only E2E selftest `scripts/tooling/baseline-control.ui-e2e.selftest.js` to validate UI startup URL flow, target/profile selection, settings edits + auto-save, action lifecycle (`init|diff|doctor|verify|upgrade|apply|refresh capabilities`), and output-panel error handling.
- 2026-02-19 - Wired UI E2E selftest into engine gate chain via `lint:engine` in `package.json` so `npm test` enforces UI flow integrity continuously.
- 2026-02-19 - Updated UI-first policy docs to include the new E2E coverage contract:
  - `AGENTS.md`
  - `docs/ops/runbooks/BASELINE_ENGINE.md`
- PR: https://github.com/mohammedaltoyan/baseline-repo-kit/pull/87
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions/runs/22195775435 (CI pass on codex branch) + local `npm test` pass on 2026-02-19

