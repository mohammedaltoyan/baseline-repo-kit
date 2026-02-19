---
plan_id: PLAN-202602-autopr-existing-pr-race
title: Auto-PR existing-PR race hardening
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
- S10: make Auto-PR opening idempotent under duplicate-PR races by handling GitHub 422 duplicate responses as non-fatal and resolving the existing PR.
- S20: add regression tests for duplicate-PR detection and keep bot-authored PR policy guidance in AGENTS.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- 2026-02-19 - Hardened `scripts/ops/auto-pr-open.js` to treat duplicate pull-request 422 responses as an idempotent success path by resolving and reusing an existing PR.
- 2026-02-19 - Added deterministic duplicate-PR classifier tests in `scripts/ops/auto-pr-open.selftest.js` so unrelated 422 errors remain fail-fast.
- 2026-02-19 - Updated `AGENTS.md` Auto-PR policy contract to require idempotent duplicate-PR handling.
- Standards references:
  - https://docs.github.com/en/rest/pulls/pulls#create-a-pull-request
  - https://docs.github.com/en/rest/pulls/pulls#list-pull-requests
- PR: https://github.com/mohammedaltoyan/baseline-repo-kit/pull/59
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions
  - local: `npm test` (pass, 2026-02-19)
  - local: `npm run test:deep` (pass, 2026-02-19)
- Objectives Evidence: auto-verified at 2026-02-19T10:05:00Z - Auto-PR behavior stays configuration-driven and idempotent without hardcoded repo exceptions, while preserving strict failure semantics for non-duplicate API errors.


