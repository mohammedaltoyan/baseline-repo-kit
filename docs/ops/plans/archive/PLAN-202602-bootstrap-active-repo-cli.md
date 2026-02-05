---
plan_id: PLAN-202602-bootstrap-active-repo-cli
title: Bootstrap: active repo CLI adoption + merge queue API
owner: @owner
status: done # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S99
updated: 2026-02-05
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: S30 - GitHub hardening (environments + security)
- Next: S95 - Testing coverage design and execution
- Blockers: <none or short>
- ETA: <date>

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (include PR slicing plan: phase map + mergeable increments; feature flags if needed)
- [x] S03 - Design validation (flows, failure messaging, CI behavior; overrides explicitly defined or none)
- [x] S10 - Rulesets: enable Merge Queue via API when supported (fallback when not supported)
- [x] S20 - Bootstrap: active repo adoption mode (PR-based, edge-case safe)
- [x] S30 - GitHub hardening: environments + security toggles (CLI best-effort; no vendor lock-in)
- [x] S95 - Testing coverage design and execution (npm test + deep verify; evidence recorded)

Phase Map (fill during S02)
- S10: Add merge queue ruleset support via GitHub Rulesets API; degrade gracefully when unavailable.
- S20: Add `--adopt` flow to baseline bootstrap for active repos (creates PR instead of pushing protected branches).
- S30: Add optional CLI provisioning for GitHub environments + security toggles where supported.
- Each PR must include `Plan:` and `Step:` in the PR body; after merge, advance the plan to the next phase step.
- Keep phases time-logical: each phase should be independently valuable and testable.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-05T15:04:56.154Z (commit f34c65ae32d0ca32e90a16d0a307836626a4193c)
- YYYY-MM-DD - <decision> (link to evidence)
- PR: https://github.com/mohammedaltoyan/baseline-repo-kit/pull/12
- PR: https://github.com/mohammedaltoyan/baseline-repo-kit/pull/13
- PR: https://github.com/mohammedaltoyan/baseline-repo-kit/pull/14
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions/runs/21716503801
