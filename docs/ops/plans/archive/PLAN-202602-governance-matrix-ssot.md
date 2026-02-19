---
plan_id: PLAN-202602-governance-matrix-ssot
title: Baseline v2.2 governance matrix SSOT + UI transparency
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
- [x] S10 - Expand governance decision SSOT in `buildInsights` with explicit team, reviewer, branching, deployment-approval, and GitHub App rationale rows.
- [x] S20 - Surface enriched governance matrix in `baseline ui` summaries with clear effective values and fallback/remediation visibility.
- [x] S30 - Add/extend selftests for insights/runtime contract behavior (including solo/small/large maintainer scenarios and approval matrix metrics).
- [x] S40 - Update runbook/docs for governance matrix semantics and operator interpretation.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-19T10:55:54.302Z (commit 76cd921e0dd88620ded4a16ebef2c618440c509b)
- 2026-02-19 - Scope fixed to governance SSOT and UI transparency only; no provider expansion in this phase.
- 2026-02-19 - Design decision: reuse existing insights pipeline (`buildInsights` -> resolution log -> doctor/UI) as the single governance decision source.
- 2026-02-19 - Centralized required-check derivation into `lib/policy/required-checks.js` and removed duplicate generator-local policy calculation.
- 2026-02-19 - Enriched governance insights with threshold matrix rows, branch-role policy coverage, deployment approval enforcement mode, and capability remediation matrix.
- 2026-02-19 - UI now surfaces maintainer-role context and effective governance matrix details directly from engine insights payload.
- PR: pending
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions (local validation complete: `npm test`, `npm run test:deep`, `npm run plans:objectives:gate:auto -- --plan PLAN-202602-governance-matrix-ssot`, `npm run plans:gate -- --plan PLAN-202602-governance-matrix-ssot`)
