---
plan_id: PLAN-202602-capability-rules-derivation
title: Derive module capability requirements from effective-rules SSOT
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
- S10: add `deriveModuleCapabilityRequirements` in `tooling/apps/baseline-engine/lib/policy/effective-settings.js` to combine module base requirements with matching rule rows.
- S20: refactor `tooling/apps/baseline-engine/modules/core-ci/generators/index.js` to use derived requirements instead of module-local merge-queue conditionals.
- S30: extend `scripts/tooling/baseline-engine.effective-rules.selftest.js` and docs to enforce dynamic capability derivation behavior.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-19T11:53:19.761Z (commit d8318f1f66de4ce926d9da00ca05ca822ce28b52)
- 2026-02-19 - Added shared rule-driven capability requirement derivation to remove module-local conditional capability gating.
- 2026-02-19 - `core-ci` capability requirements now dynamically track effective settings rule conditions, keeping required capability computation aligned with override policy SSOT.
- 2026-02-19 - Added selftest coverage for enabled/disabled merge-queue trigger permutations to prevent regression in dynamic capability derivation.
- Standards references:
  - https://openfeature.dev/specification/sections/flag-evaluation
  - https://json-schema.org/understanding-json-schema/reference/object
  - https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
- PR: pending (next bot-authored codex PR)
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions
  - local: `npm run lint:engine` (pass, 2026-02-19)
  - local: `npm test` (pass, 2026-02-19)
