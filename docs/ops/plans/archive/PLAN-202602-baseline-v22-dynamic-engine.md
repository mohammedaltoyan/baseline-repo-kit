---
plan_id: PLAN-202602-baseline-v22-dynamic-engine
title: Baseline v2.2 Dynamic Engine/UI
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
- Next: Archive plan as done after final commit
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
- Objectives Evidence: auto-verified at 2026-02-18T19:08:45.885Z (commit bda120ef43bfc9696ae25ef4f2c88bdf6a060dab)
- 2026-02-18 - Added Baseline Engine v2.2 (CLI, module SDK, capability probes, migration runtime, and schema-driven UI) with managed-file generation and compatibility delegation hooks.
- 2026-02-18 - Added schema/UI metadata SSOT and baseline engine selftest coverage.
- 2026-02-18 - Refactored generation to module-first runtime (`core-governance`, `core-ci`, `core-deployments`, `core-planning`) and removed hardcoded module artifacts from engine core.
- 2026-02-18 - Added capability-aware module evaluation, GitHub App requirement resolution, and degraded-mode warnings/remediation propagation into UI/doctor/apply.
- 2026-02-18 - Implemented managed merge strategies (`replace`, `json_merge`, `yaml_merge`, `three_way`) with user-block preservation and base snapshots in `.baseline/internal/base-content.json`.
- 2026-02-18 - Added upgrade rollback snapshots under `.baseline/snapshots/` and policy-impact summary in `upgrade` payload.
- 2026-02-18 - Added generated CI risk classifier (`scripts/ops/ci/change-classifier.js`) and branch-role required-check outputs.
- 2026-02-18 - Expanded engine selftests with merge strategy and capability degradation coverage.
- PR: local working tree implementation (PR not opened in this environment).
- CI Evidence: local `npm test` pass on 2026-02-18.
