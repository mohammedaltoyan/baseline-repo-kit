---
plan_id: PLAN-202602-baseline-v22-final-hardening
title: Baseline v2.2 Final Hardening and Closure
owner: @codex
status: done # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S99
updated: 2026-02-18
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: S99 - Final verification + closure
- Next: Archive plan as done after commit
- Blockers: none
- ETA: 2026-02-18

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
- 2026-02-18 - Added settings-aware capability requirement resolution per module to prevent false degradation when feature toggles disable a capability-dependent behavior.
- 2026-02-18 - Hardened generated GitHub workflows to least-privilege defaults and disabled checkout credential persistence for non-push jobs.
- 2026-02-18 - Added GitHub REST API version header to capability probes for forward-compatible API behavior.
- 2026-02-18 - Added regression coverage validating dynamic merge-queue capability gating behavior in capability selftests.
- PR: local working tree implementation (PR not opened in this environment).
- CI Evidence: local `npm test` pass on 2026-02-18.
- Objectives Evidence: manual attestation complete - settings-driven capability enforcement, least-privilege defaults, and no hardcoded per-repo logic added.


