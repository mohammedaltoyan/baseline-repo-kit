---
plan_id: PLAN-202602-baseline-v22-ui-metadata-schema
title: Baseline v2.2 UI metadata schema + runtime validation
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
- S10: add UI metadata schema contract (`config/schema/baseline-ui-metadata.schema.json`) and capability key constants in engine capability adapter.
- S20: enforce runtime metadata validation in `lib/schema.js` (schema validation + semantic checks for section references and capability keys).
- S30: add dedicated metadata-schema selftest and wire into engine lint/test gate.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- 2026-02-18 - Added UI metadata schema and runtime validator path so UI metadata is a validated SSOT contract instead of trusted raw JSON.
- 2026-02-18 - Centralized capability key list in `lib/capabilities/github.js` and reused it in metadata validation/selftests to remove duplicated allowed-key lists.
- Standards references:
  - https://ajv.js.org/options.html
  - https://json-schema.org/understanding-json-schema/reference/object
  - https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions
- PR: pending (next bot-authored codex PR)
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions/runs/22161737455/job/64079864247
- Objectives Evidence: auto-verified at 2026-02-18T23:59:50Z (commit pending) - UI metadata is now validated by schema + semantic checks, eliminating ungoverned metadata drift.


