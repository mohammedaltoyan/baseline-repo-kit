---
plan_id: PLAN-202602-release-pr-bot
title: Release PR (bot) workflow + PR-policy support
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
- Now: Implementation ready; awaiting CI evidence + merge
- Next: Merge PR, then archive plan
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
- S10: Add `Release PR (bot)` workflow + release PR opener script.
- S20: Ensure required checks are reachable for bot-created PRs (run on `pull_request_review` as a fallback trigger).
- S30: PR policy: allow optional Plan/Step bypass for release promotion PRs (integration -> production) via `RELEASE_PR_BYPASS_PLAN_STEP`.
- S40: Docs + tests updates.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-16T17:42:28.821Z (commit 195549e62c89456376852d1c728486f927b158cf)
- 2026-02-16 - Add one-button `Release PR (bot)` workflow to open/refresh the canonical release PR (integration -> production) as a bot so a human can approve/merge under required-review rules.
- 2026-02-16 - Add `pull_request_review` triggers to `PR Policy` and `Release Policy (main)` so required checks are always reachable even when a PR was opened by automation.
- 2026-02-16 - Add optional `RELEASE_PR_BYPASS_PLAN_STEP=1` to avoid redundant planning on the mechanical release promotion PR (underlying changes already carried plans).
- PR: https://github.com/mohammedaltoyan/baseline-repo-kit/pull/36
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions/runs/22072557119

