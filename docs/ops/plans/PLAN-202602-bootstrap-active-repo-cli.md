---
plan_id: PLAN-202602-bootstrap-active-repo-cli
title: Bootstrap: active repo CLI adoption + merge queue API
owner: @owner
status: in_progress # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S10
updated: 2026-02-05
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: S10 - Rulesets: Merge Queue via API (best-effort)
- Next: S20 - Bootstrap: active repo adoption (PR-based)
- Blockers: <none or short>
- ETA: <date>

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (include PR slicing plan: phase map + mergeable increments; feature flags if needed)
- [x] S03 - Design validation (flows, failure messaging, CI behavior; overrides explicitly defined or none)
- [ ] S10 - Rulesets: enable Merge Queue via API when supported (fallback when not supported)
- [ ] S20 - Bootstrap: active repo adoption mode (PR-based, edge-case safe)
- [ ] S30 - GitHub hardening: environments + security toggles (CLI best-effort; no vendor lock-in)
- [ ] S95 - Testing coverage design and execution (npm test + deep verify; evidence recorded)

Phase Map (fill during S02)
- S10: Add merge queue ruleset support via GitHub Rulesets API; degrade gracefully when unavailable.
- S20: Add `--adopt` flow to baseline bootstrap for active repos (creates PR instead of pushing protected branches).
- S30: Add optional CLI provisioning for GitHub environments + security toggles where supported.
- Each PR must include `Plan:` and `Step:` in the PR body; after merge, advance the plan to the next phase step.
- Keep phases time-logical: each phase should be independently valuable and testable.

Objectives Gate (must pass before testing)
- [ ] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [ ] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- YYYY-MM-DD - <decision> (link to evidence)
- PR: <link(s) to PR(s) if applicable>
- CI Evidence: <CI run URL(s) for S99>
- Objectives Evidence: <short attestation and/or links to proof>


