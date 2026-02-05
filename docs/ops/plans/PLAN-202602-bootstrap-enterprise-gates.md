---
plan_id: PLAN-202602-bootstrap-enterprise-gates
title: Bootstrap enterprise gates (release + promotion + deploy guards)
owner: @owner
status: in_progress # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S98
updated: 2026-02-05
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: S98 - Objectives Gate
- Next: S99 - Tests Gate
- Blockers: none
- ETA: 2026-02-05

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (include PR slicing plan: phase map + mergeable increments; feature flags if needed)
- [x] S03 - Design validation (flows, failure messaging, CI behavior; overrides explicitly defined or none)
- [x] S04 - Implementation (deliver via one or more small PRs; list the key deliverables)
- [x] S05 - Docs updated (update guides/runbooks/AGENTS as needed; avoid duplicating SSOT policy text)
- [x] S95 - Testing coverage design and execution (unit + integration/E2E; perf/load if applicable; evidence recorded)

Phase Map (fill during S02)
- Add phase steps as needed (recommended: S10, S20, S30, ...) where each phase is a mergeable PR (or a small PR series).
- Each PR must include `Plan:` and `Step:` in the PR body; after merge, advance the plan to the next phase step.
- Keep phases time-logical: each phase should be independently valuable and testable.

Objectives Gate (must pass before testing)
- [ ] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [ ] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- 2026-02-05 - Added baseline release and promotion governance controls: `Release Policy (main)` workflow, `Promote (Production)` workflow, deploy guard enforcement, and bootstrap SSOT policy fields for repo variables/environment reviewer controls.
- 2026-02-05 - Bootstrap now configures repo guard variables from SSOT policy and supports `--main-approvers=<csv>` override for `MAIN_REQUIRED_APPROVER_LOGINS`.
- 2026-02-05 - Validation evidence (local):
  - `npm test` (pass)
  - `npm run test:deep` (pass)
  - `node scripts/tooling/baseline-bootstrap.js --to . --mode overlay --overwrite --dry-run --github --skip-tests --skip-env` (pass; summary printed with attempted/skipped gates)
- 2026-02-05 - Active repo application (non-dry-run) succeeded for repo variables and environment reviewer hardening; ruleset update failed with HTTP 422 until the new required check workflow (`release-policy-main`) is merged and available to GitHub checks.
- PR: <link(s) to PR(s) if applicable>
- CI Evidence: <CI run URL(s) for S99>
- Objectives Evidence: <short attestation and/or links to proof>

