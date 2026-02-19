---
plan_id: PLAN-202602-workflow-checkout-credentials
title: Workflow checkout credential hardening
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
- Now: S99 - Tests gate complete
- Next: Archive after merge
- Blockers: none
- ETA: done (2026-02-19)

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (include PR slicing plan: phase map + mergeable increments; feature flags if needed)
- [x] S03 - Design validation (flows, failure messaging, CI behavior; overrides explicitly defined or none)
- [x] S04 - Implementation (deliver via one or more small PRs; list the key deliverables)
- [x] S05 - Docs updated (update guides/runbooks/AGENTS as needed; avoid duplicating SSOT policy text)
- [x] S95 - Testing coverage design and execution (unit + integration/E2E; perf/load if applicable; evidence recorded)

Phase Map (fill during S02)
- S10: define checkout credential policy SSOT in `config/policy/workflow-security.json` and introduce lint/selftest enforcement in `scripts/ops/workflow-security-lint*.js`.
- S20: harden `.github/workflows/*.yml` checkout steps with explicit `persist-credentials` values (least-privilege default false, allowlisted true on controlled write jobs).
- S30: wire security lint into default test gate and update AGENTS/runbook references.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- 2026-02-19 - Added workflow checkout credential SSOT policy (`config/policy/workflow-security.json`) with explicit allowlist for write-required checkout steps.
- 2026-02-19 - Added deterministic lint + selftest coverage (`scripts/ops/workflow-security-lint.js` and `scripts/ops/workflow-security-lint.selftest.js`) and wired into `npm test`.
- 2026-02-19 - Hardened all `actions/checkout@v6` usages in `.github/workflows` to explicit `persist-credentials` settings.
- Standards references:
  - https://docs.github.com/en/actions/how-tos/security-for-github-actions/security-guides/security-hardening-for-github-actions
  - https://github.com/actions/checkout
- PR: pending (next bot-authored codex PR)
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions
  - local: `npm test` (pass, 2026-02-19)
  - local: `npm run test:deep` (pass, 2026-02-19)
- Objectives Evidence: auto-verified at 2026-02-19T11:10:00Z - workflow checkout credential handling is now policy-driven and lint-enforced (explicit least-privilege defaults with allowlisted write paths only), with no duplicated per-workflow hardcoded exceptions.


