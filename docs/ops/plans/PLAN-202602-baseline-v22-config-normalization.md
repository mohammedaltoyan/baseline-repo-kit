---
plan_id: PLAN-202602-baseline-v22-config-normalization
title: Baseline v2.2 config normalization for topology and approval matrix
owner: @owner
status: in_progress # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S99
updated: 2026-02-19
priority: P1 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md
---

At-a-Glance
- Now: S99 - Final gate/closeout after PR evidence
- Next: archive after merge
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
- [x] S10 - Add centralized dynamic normalization (`branching.topology -> branches`, `deployments.{environments,components} -> approval_matrix`).
- [x] S20 - Add effective-governance insights surface for engine/UI (`doctor`, `/api/state`, control panel summary).
- [x] S30 - Emit canonical decision log artifact (`config/policy/baseline-resolution-log.json`) and harden config persistence behavior.
- [x] S40 - Expand regression coverage for topology/materialization and matrix normalization drift scenarios.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [ ] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- 2026-02-19 - Confirmed and fixed two settings-drift defects: topology preset changes did not rematerialize branch graphs, and deployment matrices could drift from environment/component rows.
- 2026-02-19 - Introduced centralized normalization in engine policy layer and ensured normalized config is persisted (no read-only drift).
- 2026-02-19 - Added shared insights model powering UI/doctor and canonical `baseline-resolution-log.json` for explainable decision SSOT.
- 2026-02-19 - Added/updated regression tests to lock topology and matrix normalization behavior plus insights output.
- PR: pending
- CI Evidence: pending (local validation complete: `npm test`, `npm run test:deep`)
- Objectives Evidence: Dynamic behavior is now settings-driven and centralized (single normalization path, no duplicated ad-hoc branch/matrix fixes), with SSOT decision output emitted in `config/policy/baseline-resolution-log.json`.

