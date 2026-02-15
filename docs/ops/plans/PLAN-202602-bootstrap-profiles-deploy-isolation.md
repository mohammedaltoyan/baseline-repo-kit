---
plan_id: PLAN-202602-bootstrap-profiles-deploy-isolation
title: Profile-driven bootstrap + deploy isolation
owner: @owner
status: in_progress # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S20
updated: 2026-02-15
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: S20 - Deploy isolation
- Next: S30 - Docs + selftests
- Blockers: None
- ETA: 2026-02-16

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted)
- [x] S01 - Scope/guardrails locked
- [x] S02 - Requirements captured (phase map + mergeable increments)
- [x] S03 - Design validation (flows, failure messaging, CI behavior; overrides explicit)
- [x] S10 - Profile-driven installer (SSOT profiles + baseline lock; bootstrap wiring + tests)
- [ ] S20 - Deploy isolation (component-scoped GitHub Environments + mapping vars; workflows updated)
- [ ] S30 - Docs + selftests (runbooks, README, AGENTS)
- [ ] S98 - Objectives Gate (record "Objectives Evidence:")
- [ ] S99 - Tests Gate (record CI/local evidence)

Decisions & Notes
- 2026-02-15 - Add profile/module selection to baseline install/bootstrap while keeping default behavior backward compatible.
- 2026-02-15 - Deploy isolation will use component-scoped GitHub Environments by default (environment name derived from component + tier; overridable via repo vars).
- PR: <add once opened>
- CI Evidence: <add for S99>
- Objectives Evidence: <add for S98>
