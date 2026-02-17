---
plan_id: PLAN-202602-autopr-allowed-authors-variants
title: Auto-PR: support GitHub Actions author login variants
owner: @owner
status: done # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S99
updated: 2026-02-16
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: S99 - Tests Gate (ready)
- Next: Complete plan and merge PR
- Blockers: None
- ETA: 2026-02-16

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (include PR slicing plan: phase map + mergeable increments; feature flags if needed)
- [x] S03 - Design validation (flows, failure messaging, CI behavior; overrides explicitly defined or none)
- [x] S04 - Implementation (deliver via one or more small PRs; list the key deliverables)
- [x] S05 - Docs updated (update guides/runbooks/AGENTS as needed; avoid duplicating SSOT policy text)
- [x] S95 - Testing coverage design and execution (unit + integration/E2E; perf/load if applicable; evidence recorded)

Phase Map (fill during S02)
- S10: Expand bot-author allowlist defaults to include GitHub Actions login variants (docs/tests/policy updates).

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-16T17:08:11.516Z (commit f784af979dccf0c95b4540b6623a420b06a04427)
- 2026-02-16 - GitHub Actions PR author login may appear as `app/github-actions` (in addition to `github-actions[bot]`); baseline defaults now allow both to avoid false negatives and deadlocks.
- PR: https://github.com/mohammedaltoyan/baseline-repo-kit/pull/35
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions/runs/22071306083

