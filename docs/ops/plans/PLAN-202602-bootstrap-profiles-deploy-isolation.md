---
plan_id: PLAN-202602-bootstrap-profiles-deploy-isolation
title: Profile-driven bootstrap + deploy isolation
owner: @owner
status: done # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S99
updated: 2026-02-15
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: S99 - Tests Gate
- Next: Complete + archive plan
- Blockers: None
- ETA: 2026-02-16

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted)
- [x] S01 - Scope/guardrails locked
- [x] S02 - Requirements captured (phase map + mergeable increments)
- [x] S03 - Design validation (flows, failure messaging, CI behavior; overrides explicit)
- [x] S10 - Profile-driven installer (SSOT profiles + baseline lock; bootstrap wiring + tests)
- [x] S20 - Deploy isolation (component-scoped GitHub Environments + mapping vars; workflows updated)
- [x] S21 - Deploy env map JSON (unlimited components; keep compatibility fallback)
- [x] S30 - Docs + selftests (runbooks, README, AGENTS)
- [x] S98 - Objectives Gate (record "Objectives Evidence:")
- [x] S99 - Tests Gate (record CI/local evidence)

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-15T16:12:04.380Z (commit 35e75e6208bcd00d058ce0e3e7c9291535b0a89f)
- 2026-02-15 - Add profile/module selection to baseline install/bootstrap while keeping default behavior backward compatible.
- 2026-02-15 - Deploy isolation will use component-scoped GitHub Environments by default (environment name derived from component + tier; overridable via repo vars).
- 2026-02-15 - Add `DEPLOY_ENV_MAP_JSON` (JSON map) as the preferred SSOT for deploy environment naming and bootstrap provisioning; keep legacy `DEPLOY_ENV_<COMPONENT>_<TIER>` fallback.
- PR: <add once opened>
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions/runs/22038833246
