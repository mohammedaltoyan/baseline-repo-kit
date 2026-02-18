---
plan_id: PLAN-202602-baseline-v22-deep-verify-hardening
title: Baseline v2.2 deep-verify hermetic selftest hardening
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
- Now: S99 - Tests gate complete
- Next: Archive after merge
- Blockers: none
- ETA: done (2026-02-18)

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (include PR slicing plan: phase map + mergeable increments; feature flags if needed)
- [x] S03 - Design validation (flows, failure messaging, CI behavior; overrides explicitly defined or none)
- [x] S04 - Implementation (deliver via one or more small PRs; list the key deliverables)
- [x] S05 - Docs updated (update guides/runbooks/AGENTS as needed; avoid duplicating SSOT policy text)
- [x] S95 - Testing coverage design and execution (unit + integration/E2E; perf/load if applicable; evidence recorded)

Phase Map (fill during S02)
- S10: harden `pr-policy-validate` selftest to be hermetic in copied/installed baseline contexts.
- S20: run deep verification across install/overlay/bootstrap target simulations and close regression.
- S30: codify hermetic-selftest rule in AGENTS testing policy.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- 2026-02-18 - `pr-policy-validate.selftest` now creates and cleans its own canonical plan fixture so it no longer depends on repo-local archived plans.
- 2026-02-18 - Deep verification (`npm run test:deep`) now passes for init/overlay/bootstrap target simulations with full lint/test gates.
- 2026-02-18 - Added explicit hermetic selftest policy rule to AGENTS.md testing section.
- Standards references:
  - https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions
  - https://docs.github.com/en/actions/concepts/workflows-and-actions/reusing-workflow-configurations
  - https://docs.npmjs.com/cli/v11/commands/npm-ci
- PR: pending (next bot-authored codex PR)
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions/runs/22161239451/job/64078208573
- Objectives Evidence: auto-verified at 2026-02-18T23:59:00Z (commit pending) - fix is configuration-agnostic, non-hardcoded, and validated in multi-target simulation.

