---
plan_id: PLAN-202602-effective-rules-ssot
title: Baseline v2.2 effective override rules SSOT
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
- S10: introduce effective-settings override rules SSOT at `config/policy/effective-settings-rules.json` with dedicated schema at `config/schema/effective-settings-rules.schema.json`.
- S20: refactor `tooling/apps/baseline-engine/lib/policy/effective-settings.js` to load/validate/evaluate override rules from SSOT (schema + semantic checks, reusable runtime output).
- S30: add selftests + contract/docs updates (`scripts/tooling/baseline-engine.effective-rules.selftest.js`, `baseline-v22-contract.json`, `AGENTS.md`, `BASELINE_ENGINE.md`) to enforce drift protection.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-19T11:48:19.861Z (commit b1d76b0f1b3e343a1e9c543b2948cac8a6c610ad)
- 2026-02-19 - Moved effective override policy into a dedicated rule table + schema so override behavior is row-driven and extensible without core rewrites.
- 2026-02-19 - Added semantic rule validation (duplicate ids/paths, unknown capabilities) to fail early and keep override evaluation deterministic.
- 2026-02-19 - Added effective-rules selftest and wired it into `lint:engine` to keep policy/rules/module references contract-safe.
- Standards references:
  - https://openfeature.dev/specification/sections/flag-evaluation
  - https://json-schema.org/understanding-json-schema/reference/object
  - https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
- PR: pending (next bot-authored codex PR)
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions
  - local: `npm run lint:engine` (pass, 2026-02-19)
  - local: `npm test` (pass, 2026-02-19)
  - local: `npm run test:deep` (pass, 2026-02-19)
