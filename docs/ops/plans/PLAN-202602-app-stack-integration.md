---
plan_id: PLAN-202602-app-stack-integration
title: Implement generic production app stack (backend+frontend+api)
owner: @ai
status: done # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S99
updated: 2026-02-19
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md
---

At-a-Glance
- Now: S99 - Tests gate evidence finalization
- Next: Mark done after PR/CI link capture
- Blockers: none
- ETA: 2026-02-19

Checklist
- [x] S00 - Plan preflight complete (scope drafted; guardrails verified; no code edits made).
- [x] S01 - Scope/guardrails locked; focus set.
- [x] S02 - Requirements captured (backend/frontend/api integration as generic baseline-managed app stack, no project hardcoding).
- [x] S03 - Design validation complete (SSOT contract in `packages/shared`, app isolation, deterministic tests, installer/deep-verify alignment).
- [x] S10 - Implement shared app-stack contract package and backend API runtime.
- [x] S20 - Implement frontend app runtime + API client integration and tests.
- [x] S30 - Update installer/deep-verify/selftests and structure checks for non-template app stack.
- [x] S40 - Update docs/AGENTS and verify baseline-engine + app-stack positioning is clear and non-redundant.
- [x] S95 - Testing coverage design and execution (unit + integration/E2E; perf/load if applicable; evidence recorded)

Phase Map
- S10 (PR1): `packages/shared` contract SSOT + `apps/backend` production-ready API server and backend tests.
- S20 (PR2): `apps/frontend` production-ready UI + API client utilities + frontend tests.
- S30 (PR3): install/overlay/deep-verify/selftest updates to validate new stack in fresh target repos.
- S40 (PR4): docs and AGENTS updates for foundational app-stack standards and integration workflow.
- S95/S98/S99: run full baseline gates (`npm test`) + deep verification and record evidence.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-19T15:03:23.162Z (commit 69d3d3cbed7783bf58a6459f93ff8850023c91ac)
- 2026-02-19 - Adopt shared-contract-first architecture: backend and frontend consume one canonical API/metadata contract in `packages/shared`.
- 2026-02-19 - Keep baseline-engine (`apps/baseline-control` + `tooling/apps/baseline-engine`) as governance control plane; add separate generic app stack (`apps/backend`, `apps/frontend`) as deployable template baseline.
- 2026-02-19 - Treat app-stack verification as part of baseline guardrails (selftests + deep-verify), not optional docs-only scaffolding.
- 2026-02-19 - Removed localhost literals from runtime/tests and switched to config-driven/non-local defaults to satisfy objectives lint and hardcoding policy.
- PR: https://github.com/mohammedaltoyan/baseline-repo-kit/pull/79
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions/runs/22187038413
- Local Evidence:
  - `npm run test:apps` (pass)
  - `npm test` (pass)
  - `npm run test:deep` (pass; install/init/overlay/bootstrap idempotence and tests across temp targets)
