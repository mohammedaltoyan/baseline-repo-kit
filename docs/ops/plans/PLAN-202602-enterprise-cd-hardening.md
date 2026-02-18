---
plan_id: PLAN-202602-enterprise-cd-hardening
title: Enterprise CD Hardening (Registry SSOT + Dynamic Approvals + Isolated Envs)
owner: @owner
status: in_progress # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S99
updated: 2026-02-18
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: S99 - Tests Gate
- Next: Complete + archive plan
- Blockers: None
- ETA: 2026-02-20

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; phase map defined)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (SSOT registry, approvals, receipts gate, bootstrap, optional lint)
- [x] S03 - Design validation (dispatch-based deploy to preserve env branch restrictions; dynamic approvals; receipts semantics)
- [x] S10 - Registry SSOT + scripts: deploy-surface-registry, changed-surfaces, deploy-receipts, env-isolation-lint (disabled by flag) + selftests
- [x] S20 - Deploy leaf: registry-aware env resolution + internal-only guard + receipts writeback + staging promotion guard
- [x] S30 - Promote workflows: staging orchestrator + production refactor (dynamic approvals + receipts gate)
- [x] S40 - Env isolation lint workflow + required-check wiring + bootstrap vars (lint remains disabled by default)
- [x] S50 - Bootstrap: create deploy-surfaces.json from example + provision deploy+approval environments from registry + docs/AGENTS updates
- [x] S98 - Objectives Gate (record "Objectives Evidence:")
- [ ] S99 - Tests Gate (record CI/local evidence)

Phase Map
- S10 (done): Add registry SSOT template + core scripts + selftests; wire into `npm test`.
- S20 (done): Update `deploy.yml` to be internal-only + registry-aware; add receipts writeback.
- S30 (done): Add `promote-staging.yml`; refactor `promote-production.yml` to support commit/surface approvals and receipts gate.
- S40 (done): Add env isolation lint workflow + bootstrap defaults for new repo vars and required checks.
- S50 (done): Bootstrap environment provisioning from registry; docs/runbooks + AGENTS policy updates.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-18T00:05:06.500Z (commit c595aea5591d24945fa6ac7bfb90918d4c74cbc1)
- 2026-02-17 - Deploy remains dispatch-based (promote workflows dispatch `deploy.yml` on the correct branch) to preserve GitHub Environment branch policy enforcement.
- 2026-02-17 - Receipts are the SSOT for promotion prerequisites; production checks staging receipts per-surface for the same deploy ref.
- 2026-02-17 - Env isolation lint ships but is disabled by default; when enabled, it fails closed if it cannot fully verify isolation.
- PR: (pending)
- CI Evidence: (pending)
