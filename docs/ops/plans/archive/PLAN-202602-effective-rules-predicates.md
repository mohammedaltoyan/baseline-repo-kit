---
plan_id: PLAN-202602-effective-rules-predicates
title: Generalize effective rule conditions with predicate operators
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
- Now: S99 - tests gate complete
- Next: open bot-authored PR and merge
- Blockers: none
- ETA: phase implementation done (2026-02-19)

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (include PR slicing plan: phase map + mergeable increments; feature flags if needed)
- [x] S03 - Design validation (flows, failure messaging, CI behavior; overrides explicitly defined or none)
- [x] S04 - Implementation (deliver via one or more small PRs; list the key deliverables)
- [x] S05 - Docs updated (update guides/runbooks/AGENTS as needed; avoid duplicating SSOT policy text)
- [x] S95 - Testing coverage design and execution (unit + integration/E2E; perf/load if applicable; evidence recorded)

Phase Map (fill during S02)
- S10: extend `config/schema/effective-settings-rules.schema.json` with predicate condition objects (`when.operator`) while preserving legacy boolean compatibility.
- S20: refactor `tooling/apps/baseline-engine/lib/policy/effective-settings.js` to normalize/evaluate predicate conditions and reuse them for both override application and capability-requirement derivation.
- S30: update rule policy payload + selftests/docs to validate predicate format and behavior (`equals`, `not_equals`, `in`, `not_in`).

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-19T12:05:21.871Z (commit 35ab112fbc8f74a4b94c05499bc71cfc90e650ef)
- 2026-02-19 - Generalized rule conditions to predicate operators so future capability/setting gates can be added as data rows instead of evaluator rewrites.
- 2026-02-19 - Kept backward compatibility for legacy `when_configured_equals` in normalization to avoid migration breakage while moving policy payloads to `when`.
- 2026-02-19 - Added predicate operator selftest coverage to lock evaluator semantics for `equals`, `not_equals`, `in`, and `not_in`.
- Standards references:
  - https://openfeature.dev/specification/sections/flag-evaluation
  - https://json-schema.org/understanding-json-schema/reference/object
  - https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
- PR: pending (next bot-authored codex PR)
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions
  - local: `npm run lint:engine` (pass, 2026-02-19)
  - local: `npm test` (pass, 2026-02-19)
