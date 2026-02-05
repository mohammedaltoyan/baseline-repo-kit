---
plan_id: PLAN-202602-bootstrap-prod-ready
title: Bootstrap: GitHub UI toggles + reviews + deploy baseline
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
- Now: S98 - Objectives Gate (auto)
- Next: S99 - Tests Gate
- Blockers: Merge Queue is plan/org dependent (manual enable)
- ETA: When CI green

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (phase steps defined; non-destructive + SSOT preserved)
- [x] S03 - Design validation (GitHub UI toggles: merge queue, security, environments; bootstrap messaging)
- [x] S10 - Bootstrap: print GitHub UI checklist + update docs
- [x] S20 - Bootstrap policy: require 1 approval + code owners
- [x] S30 - Deployment baseline templates (generic; opt-in)
- [x] S95 - Testing coverage design and execution (npm test + deep verify; CI evidence recorded)

Phase Map (fill during S02)
- S10: GitHub UI readiness checklist (merge queue/security/environments) + bootstrap output guidance.
- S20: Review policy defaults (1 approval + code owner review) + optional CODEOWNERS bootstrap assist.
- S30: Deployment scaffolding (runbook + opt-in workflow template, no vendor coupling).

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-05T13:00:30.404Z (commit ea5a3380fbab5f849dfe1309acd0c3fcb9ad87b0)
- 2026-02-05 - Default branch is the integration branch (`dev`) to keep PR base targets safe; `main` is production-only (release/hotfix).
- 2026-02-05 - Bootstrap should finish by printing a GitHub UI checklist for the remaining manual toggles (Merge Queue, security toggles, environments).
- PR: https://github.com/mohammedaltoyan/baseline-repo-kit/pull/10
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions/runs/21711870438

