---
plan_id: PLAN-202602-security-workflow-capability-probes
title: Harden security workflow capability detection
owner: @mohammedaltoyan
status: in_progress # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S00
updated: 2026-02-06
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: S00 - Plan preflight (scope + guardrails; no execution yet)
- Next: S01 - Scope/guardrails locked
- Blockers: <none or short>
- ETA: <date>

Checklist
- [ ] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [ ] S01 - Scope/guardrails locked; focus set
- [ ] S02 - Requirements captured (include PR slicing plan: phase map + mergeable increments; feature flags if needed)
- [ ] S03 - Design validation (flows, failure messaging, CI behavior; overrides explicitly defined or none)
- [ ] S04 - Implementation (deliver via one or more small PRs; list the key deliverables)
- [ ] S05 - Docs updated (update guides/runbooks/AGENTS as needed; avoid duplicating SSOT policy text)
- [ ] S95 - Testing coverage design and execution (unit + integration/E2E; perf/load if applicable; evidence recorded)

Phase Map (fill during S02)
- Add phase steps as needed (recommended: S10, S20, S30, ...) where each phase is a mergeable PR (or a small PR series).
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



