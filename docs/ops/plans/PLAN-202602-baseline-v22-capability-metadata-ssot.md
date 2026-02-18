---
plan_id: PLAN-202602-baseline-v22-capability-metadata-ssot
title: Baseline v2.2 capability mapping SSOT in UI metadata
owner: @owner
status: done # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S99
updated: 2026-02-18
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
- S10: move UI capability mapping from hardcoded JS map into metadata SSOT (`config/schema/baseline-ui-metadata.json`).
- S20: update UI runtime to resolve capability labels from metadata entries (with inherited metadata support).
- S30: extend metadata selftests to validate capability key integrity and required mappings.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- 2026-02-18 - Removed hardcoded UI capability map and made capability labeling metadata-driven to preserve SSOT and extensibility.
- 2026-02-18 - Added metadata integrity checks for `capability_key` values and expected governed paths.
- Standards references:
  - https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions
  - https://docs.github.com/en/actions/using-workflows/reusing-workflows
  - https://json-schema.org/understanding-json-schema/reference/annotations
- PR: pending (next bot-authored codex PR)
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions/runs/22161554713/job/64079243320
- Objectives Evidence: auto-verified at 2026-02-18T23:59:30Z (commit pending) - capability mapping is now metadata SSOT with no duplicated UI hardcoding.


