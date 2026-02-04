---
plan_id: PLAN-202602-deep-audit-optimization
title: Deep audit + optimization (env precedence, tests, deep verify)
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
- Now: S95 - Evidence captured (local + deep verify)
- Next: Archive plan
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
- Objectives Evidence: auto-verified at 2026-02-04T21:55:13.964Z (commit a136d5078506d481273c62d147f571a812b0d4e7)
- 2026-02-04 - Fix env precedence SSOT: align `scripts/utils/load-env.js` to documented load order (cloud -> local -> base -> root).
- 2026-02-04 - Harden installer: exclude plan instances from installs; support positional CLI; apply `--overwrite` consistently to `package.json` merges.
- 2026-02-04 - Add tests: `lint:env` selftest for env precedence; update change guard to treat `*.selftest.*` as tests; add `test:deep` install+verify runner.
- 2026-02-04 - Local Evidence: `npm test`, `npm run test:deep`, `npm run docs:clean`, `npm run plans:verify` (all passing).
- PR: N/A (local audit; no remote configured)
- CI Evidence: N/A (no remote/CI configured)
