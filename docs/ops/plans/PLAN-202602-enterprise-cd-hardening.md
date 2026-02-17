---
plan_id: PLAN-202602-enterprise-cd-hardening
title: Enterprise CD Hardening (Registry SSOT + Dynamic Approvals + Isolated Envs)
owner: @owner
status: in_progress # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S40
updated: 2026-02-17
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: S40 - Optional env isolation lint workflow + bootstrap vars/required checks
- Next: S50 - Bootstrap environments from registry + docs/AGENTS updates
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
- [ ] S40 - Env isolation lint workflow + required-check wiring + bootstrap vars (lint remains disabled by default)
- [ ] S50 - Bootstrap: create deploy-surfaces.json from example + provision deploy+approval environments from registry + docs/AGENTS updates
- [ ] S98 - Objectives Gate (record "Objectives Evidence:")
- [ ] S99 - Tests Gate (record CI/local evidence)

Phase Map
- S10 (done): Add registry SSOT template + core scripts + selftests; wire into `npm test`.
- S20: Update `deploy.yml` to be internal-only + registry-aware; add receipts writeback.
- S30: Add `promote-staging.yml`; refactor `promote-production.yml` to support commit/surface approvals and receipts gate.
- S40: Add optional env isolation lint workflow + bootstrap defaults for new repo vars and required checks.
- S50: Bootstrap environment provisioning from registry; docs/runbooks + AGENTS policy updates.

Objectives Gate (must pass before testing)
- [ ] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [ ] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- 2026-02-17 - Deploy remains dispatch-based (promote workflows dispatch `deploy.yml` on the correct branch) to preserve GitHub Environment branch policy enforcement.
- 2026-02-17 - Receipts are the SSOT for promotion prerequisites; production checks staging receipts per-surface for the same deploy ref.
- 2026-02-17 - Env isolation lint ships but is disabled by default; when enabled, it fails closed if it cannot fully verify isolation.
- PR: (pending)
- CI Evidence: (pending)
- Objectives Evidence: (pending)
