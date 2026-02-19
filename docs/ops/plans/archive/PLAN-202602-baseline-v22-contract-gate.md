---
plan_id: PLAN-202602-baseline-v22-contract-gate
title: Baseline v2.2 locked-decision contract gate
owner: @owner
status: done # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S99
updated: 2026-02-19
priority: P1 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md
---

At-a-Glance
- Now: S99 - validation complete; awaiting merge evidence finalization
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
- [x] S10 - Add locked-decision policy SSOT (`config/policy/baseline-v22-contract.json`).
- [x] S20 - Implement machine-enforced contract lint (`scripts/ops/baseline-v22-contract-lint.js`) + negative-path selftests.
- [x] S30 - Wire contract gate into main CI (`npm test` via `lint:contract`) and keep install/bootstrap deep-verify coverage green.
- [x] S40 - Document contract gate in AGENTS and baseline engine runbook/README.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-19T10:36:54.121Z (commit dcb9e9d3bfb77dfbfe33f15fe51c0e7486d8361c)
- 2026-02-19 - Added policy-as-code contract SSOT for locked v2.2 decisions and enforced it in CI/test gates.
- 2026-02-19 - Added explicit module-contract and defaults drift detection to prevent silent divergence from strict/profile/apply-mode/module opt-in rules.
- 2026-02-19 - Added contract lint regression selftests and validated deep install/bootstrap compatibility.
- PR: pending
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions (local validation complete: `npm test`, `npm run test:deep`, `npm run plans:verify`, `npm run plans:gate -- --plan PLAN-202602-baseline-v22-contract-gate`)
