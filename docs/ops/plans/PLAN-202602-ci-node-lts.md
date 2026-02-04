---
plan_id: PLAN-202602-ci-node-lts
title: Align engines + CI Node version (SSOT via .nvmrc)
owner: @owner
status: in_progress # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S95
updated: 2026-02-04
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: S95 - Evidence captured (local)
- Next: S98/S99 plan gates -> archive
- Blockers: <none>
- ETA: 2026-02-04

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (include PR slicing plan: phase map + mergeable increments; feature flags if needed)
- [x] S03 - Design validation (flows, failure messaging, CI behavior; overrides explicitly defined or none)
- [x] S04 - Implementation (deliver via one or more small PRs; list the key deliverables)
- [x] S05 - Docs updated (update guides/runbooks/AGENTS as needed; avoid duplicating SSOT policy text)
- [ ] S95 - Testing coverage design and execution (unit + integration/E2E; perf/load if applicable; evidence recorded)

Phase Map (fill during S02)
- Add phase steps as needed (recommended: S10, S20, S30, ...) where each phase is a mergeable PR (or a small PR series).
- Each PR must include `Plan:` and `Step:` in the PR body; after merge, advance the plan to the next phase step.
- Keep phases time-logical: each phase should be independently valuable and testable.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-04T22:00:34.369Z (commit 6c5c9ddf12ca10e1e7833b7282bf6ad86d63d8dd)
- 2026-02-04 - Node version SSOT: add `.nvmrc` and update CI to use `actions/setup-node` with `node-version-file`.
- 2026-02-04 - Support policy: update `package.json` `engines.node` and local setup docs.
- 2026-02-04 - Local Evidence: `npm test`, `npm run docs:clean` (all passing).
- PR: N/A (local-only; no remote configured)
- CI Evidence: N/A (no remote/CI configured)

