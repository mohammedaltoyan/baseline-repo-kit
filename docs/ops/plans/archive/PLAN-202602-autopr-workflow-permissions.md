---
plan_id: PLAN-202602-autopr-workflow-permissions
title: Auto PR workflow permissions hardening
owner: @owner
status: done # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S99
updated: 2026-02-18
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: Completed (S99 passed)
- Next: Archive plan post-merge
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
- S10: Bootstrap policy + engine updates for GitHub Actions workflow permissions provisioning.
- S20: Auto-PR token fallback and actionable permission-failure guidance.
- S30: Documentation + tests updates (including new selftest for auto-pr token selection/error classifier).

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-16T11:17:54.462Z (commit f650ad346bc4ad10985454b9dc5550ffa5f25f74)
- 2026-02-16 - Root cause confirmed via run log: Actions API returned 403 (`GitHub Actions is not permitted to create or approve pull requests`) for PR creation.
- 2026-02-16 - Added policy-driven bootstrap provisioning for `/actions/permissions/workflow` to keep one-button setup deterministic.
- 2026-02-16 - Added Auto-PR fallback to `AUTOPR_TOKEN` for orgs that disable Actions PR creation with `GITHUB_TOKEN`.
- PR: https://github.com/mohammedaltoyan/baseline-repo-kit/pull/34
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions/runs/22043638697 (baseline CI green); local `npm test` also passed on 2026-02-16 for this change set.
