---
plan_id: PLAN-202602-bootstrap-prod-ready
title: Bootstrap: GitHub UI toggles + reviews + deploy baseline
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
- Now: S10 - Post-bootstrap GitHub UI checklist + review defaults
- Next: S20 - Deployment baseline templates (optional; generic)
- Blockers: Merge Queue is plan/org dependent (manual enable)
- ETA: When CI green

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (phase steps defined; non-destructive + SSOT preserved)
- [x] S03 - Design validation (GitHub UI toggles: merge queue, security, environments; bootstrap messaging)
- [ ] S10 - Bootstrap: print GitHub UI checklist + update docs
- [ ] S20 - Bootstrap policy: require 1 approval + code owners
- [ ] S30 - Deployment baseline templates (generic; opt-in)
- [ ] S95 - Testing coverage design and execution (npm test + deep verify; CI evidence recorded)

Phase Map (fill during S02)
- S10: GitHub UI readiness checklist (merge queue/security/environments) + bootstrap output guidance.
- S20: Review policy defaults (1 approval + code owner review) + optional CODEOWNERS bootstrap assist.
- S30: Deployment scaffolding (runbook + opt-in workflow template, no vendor coupling).

Objectives Gate (must pass before testing)
- [ ] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [ ] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- 2026-02-05 - Default branch is the integration branch (`dev`) to keep PR base targets safe; `main` is production-only (release/hotfix).
- 2026-02-05 - Bootstrap should finish by printing a GitHub UI checklist for the remaining manual toggles (Merge Queue, security toggles, environments).
- PR: <link(s) to PR(s) if applicable>
- CI Evidence: <CI run URL(s) for S99>
- Objectives Evidence: <short attestation and/or links to proof>


