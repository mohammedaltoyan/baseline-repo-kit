---
plan_id: PLAN-202602-effective-settings-ssot
title: Baseline v2.2 effective settings SSOT transparency
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
- ETA: done (2026-02-19)

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (include PR slicing plan: phase map + mergeable increments; feature flags if needed)
- [x] S03 - Design validation (flows, failure messaging, CI behavior; overrides explicitly defined or none)
- [x] S04 - Implementation (deliver via one or more small PRs; list the key deliverables)
- [x] S05 - Docs updated (update guides/runbooks/AGENTS as needed; avoid duplicating SSOT policy text)
- [x] S95 - Testing coverage design and execution (unit + integration/E2E; perf/load if applicable; evidence recorded)

Phase Map (fill during S02)
- S10: add centralized effective-settings evaluator (`lib/policy/effective-settings.js`) for capability-driven configured-vs-effective decisions.
- S20: refactor `core-ci` generation and insights/UI payloads to consume the shared evaluator (no duplicate override logic).
- S30: update control UI to show configured vs effective values with explicit override reason/remediation, and add selftests for the new contract.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- 2026-02-19 - Added `buildEffectiveConfig` as the single evaluator for capability-based setting overrides; this removed per-surface merge-queue override logic and made decisions reusable by generation/insights/UI.
- 2026-02-19 - Updated UI API/state rendering to expose and display configured vs effective values plus override reason/remediation per setting.
- 2026-02-19 - Added dedicated effective-settings selftest and expanded capability/insights selftests to verify override behavior and emitted artifacts.
- Standards references:
  - https://openfeature.dev/specification/sections/flag-evaluation
  - https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
  - https://docs.github.com/en/actions/how-tos/security-for-github-actions/security-guides/security-hardening-for-github-actions
- PR: pending (next bot-authored codex PR)
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions
  - local: `npm run lint:engine` (pass, 2026-02-19)
  - local: `npm test` (pass, 2026-02-19)
  - local: `npm run test:deep` (pass, 2026-02-19)
- Objectives Evidence: auto-verified at 2026-02-19T14:40:00Z - effective override behavior is centralized in one policy evaluator reused by generated CI config, insights/resolution log, and UI, eliminating duplicate override logic and keeping runtime behavior settings-driven.
