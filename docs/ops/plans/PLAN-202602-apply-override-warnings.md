---
plan_id: PLAN-202602-apply-override-warnings
title: Surface effective override degradations in apply warnings
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
- S10: extend `tooling/apps/baseline-engine/lib/commands/apply.js` to derive effective override warning rows from SSOT insights.
- S20: include per-override warning details (path + detail + remediation) in apply output warnings payload.
- S30: update `scripts/tooling/baseline-engine.capabilities.selftest.js` and docs/agent guidance to enforce visible auto-degrade warnings.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-19T12:15:21.607Z (commit 243227ca30ec77e5d1004cfe09b6dd6d6126d66e)
- 2026-02-19 - Added explicit apply warnings for each effective override so capability-driven auto-degrades are always visible in CLI/JSON output.
- 2026-02-19 - Reused centralized insights/effective-settings evaluator in apply command to avoid duplicated override calculations.
- 2026-02-19 - Added selftest assertion that apply output includes merge-queue auto-degrade warning in unsupported capability scenario.
- Standards references:
  - https://openfeature.dev/specification/sections/flag-evaluation
  - https://json-schema.org/understanding-json-schema/reference/object
  - https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
- PR: pending (next bot-authored codex PR)
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions
  - local: `npm run lint:engine` (pass, 2026-02-19)
  - local: `npm test` (pass, 2026-02-19)
