---
plan_id: PLAN-202602-github-entitlement-advisory
title: Baseline v2.2 GitHub entitlement advisory matrix
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
- Now: S99 - Validation complete; awaiting final evidence closure
- Next: merge + archive
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
- [x] S10 - Add GitHub entitlement advisory model (owner type + visibility + feature) as reusable SSOT helper using official-doc assumptions.
- [x] S20 - Thread entitlement advisories into insights + UI capability/governance summaries (clear state + remediation guidance).
- [x] S30 - Add selftests for entitlement matrix and insight/UI integration behavior.
- [x] S40 - Update runbook + AGENTS for entitlement advisory semantics and source-of-truth rule.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-19T11:06:37.061Z (commit 68603e6c27745c19125ead3461adbab1824a7b94)
- 2026-02-19 - Scope limited to advisory entitlement modeling only (no hard-fail policy changes in this phase).
- 2026-02-19 - Feature advisories remain non-blocking and are designed to complement runtime API probing, not replace it.
- 2026-02-19 - Added centralized entitlement policy helper (`lib/policy/entitlements.js`) and merged entitlement rows into capability matrix output.
- 2026-02-19 - UI capability panel now displays runtime probe rows plus entitlement advisory rows with source, docs link, and remediation context.
- 2026-02-19 - Added entitlement selftest (`baseline-engine.entitlements.selftest.js`) and wired it into engine lint gate.
- PR: pending
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions (local validation complete: `npm test`, `npm run test:deep`, `npm run plans:objectives:gate:auto -- --plan PLAN-202602-github-entitlement-advisory`, `npm run plans:gate -- --plan PLAN-202602-github-entitlement-advisory`)
