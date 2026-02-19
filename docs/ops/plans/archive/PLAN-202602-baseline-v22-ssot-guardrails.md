---
plan_id: PLAN-202602-baseline-v22-ssot-guardrails
title: Baseline v2.2 SSOT schema and UI metadata guardrails
owner: @owner
status: done # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S99
updated: 2026-02-19
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: S99 - Tests gate complete
- Next: Archive after merge
- Blockers: none
- ETA: done (2026-02-18)

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (include PR slicing plan: phase map + mergeable increments; feature flags if needed)
- [x] S03 - Design validation (flows, failure messaging, CI behavior; overrides explicitly defined or none)
- [x] S04 - Implementation (deliver via one or more small PRs; list the key deliverables)
- [x] S05 - Docs updated (update guides/runbooks/AGENTS as needed; avoid duplicating SSOT policy text)
- [x] S95 - Testing coverage design and execution (unit + integration/E2E; perf/load if applicable; evidence recorded)

Phase Map (fill during S02)
- S10: migrate runtime config validation to JSON Schema SSOT (`config/schema/baseline-config.schema.json`)
- S20: make control UI leaf-driven with metadata inheritance for full setting explanation coverage
- S30: add governance/schema/metadata capability selftests and CI wiring

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- 2026-02-18 - Replaced duplicated ad-hoc config checks with compiled JSON Schema validation in engine runtime.
- 2026-02-18 - Updated control panel to render leaf settings and inherit nearest metadata explanation source for uncovered leaf keys.
- 2026-02-18 - Added selftests for schema validation, UI metadata coverage, governance defaults, and GitHub App enforcement failure mode.
- PR: https://github.com/mohammedaltoyan/baseline-repo-kit/pull/53
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions/runs/22140572634/job/64003486214
- Objectives Evidence: auto-verified at 2026-02-18T18:18:00Z (commit pending) - SSOT strengthened (schema/runtime alignment + metadata explanation coverage) with no hardcoded per-repo overrides introduced.
