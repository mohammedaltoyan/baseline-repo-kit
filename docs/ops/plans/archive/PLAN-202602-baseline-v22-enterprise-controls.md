---
plan_id: PLAN-202602-baseline-v22-enterprise-controls
title: Baseline v2.2 Enterprise Controls (Action Pinning + OIDC)
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
- 2026-02-18 - Added settings-driven action reference controls (`ci.action_refs`) and schema/UI coverage so workflow refs are centrally managed.
- 2026-02-18 - Added strict pinned-action enforcement (`security.require_pinned_action_refs`) with doctor fail-fast and regression tests.
- 2026-02-18 - Added settings-driven deployment OIDC controls (`deployments.oidc`) and deploy workflow generation support.
- 2026-02-18 - Confirmed generated workflow security posture against latest official guidance (least privilege permissions, checkout credential hardening, OIDC model references).
- PR: local working tree implementation (PR not opened in this environment).
- CI Evidence: local `npm test` pass on 2026-02-18.
- Objectives Evidence: manual attestation complete - all new behavior is settings-driven, reusable, no hardcoded repo-specific logic, and tested.


