---
plan_id: PLAN-202602-system-live-e2e-optimization
title: System Live E2E Optimization Pass
owner: @codex
status: done # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S99
updated: 2026-02-19
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/ops/runbooks/BASELINE_ENGINE.md#ui
---

At-a-Glance
- Now: Done.
- Next: Archive after merge.
- Blockers: none.
- ETA: 2026-02-19.

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (independent live E2E run across bootstrap, UI/API, browser UX flow, and app-stack runtime)
- [x] S03 - Design validation (identify and prioritize concrete runtime optimizations discovered from live audit)
- [x] S04 - Implementation (bootstrap git identity fallback hardening + parser/runtime hardening carried forward)
- [x] S05 - Docs updated (README, bootstrap runbook, AGENTS)
- [x] S95 - Testing coverage design and execution (manual live E2E + targeted automation + guardrail suites)

Phase Map (fill during S02)
- S10 - Live bootstrap/install run on clean temp repos to validate argument parsing and baseline install flow.
- S20 - Live engine UI/API validation (`target_not_set`, invalid target, valid target lifecycle actions).
- S30 - Real browser E2E against running control-plane UI (invalid/valid target transitions, action gating, full lifecycle actions, console/network error checks).
- S40 - App-stack backend/frontend live integration checks (healthy/error runtime config, contract/openapi, echo allow/deny behavior).
- S50 - Implement bootstrap commit identity fallback optimization discovered during live run and add selftest coverage.
- S60 - Re-run live bootstrap with missing git identity to verify fallback behavior and warnings.
- S70 - Re-run targeted suites (`baseline-bootstrap.selftest`, UI/API selftests, lint:bootstrap).

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-19T22:53:46.184Z (commit b1a811fa53f42dd6e6a663f37fc6dc1a1d7ff3bb)
- 2026-02-19 - Live bootstrap run exposed reliability gap: initial commit hard-failed when git user identity was unset in local machine context.
- 2026-02-19 - Implemented bootstrap commit identity resolver with precedence `CLI flags -> env -> git config -> default bot identity` and explicit warning/remediation when fallback is used.
- 2026-02-19 - Added new bootstrap flags `--git-user-name` and `--git-user-email` plus env support (`BASELINE_GIT_USER_NAME`, `BASELINE_GIT_USER_EMAIL`), docs updates, and selftest coverage.
- 2026-02-19 - Re-validated live UI/API/browser workflows and app-stack runtime paths without relying solely on repository test harnesses.
- PR: <link(s) to PR(s) if applicable>
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions
- Manual E2E Evidence:
  - UI/API live artifacts: `/tmp/baseline-ui-api-live-Zabj1c/http`
  - Browser live E2E + screenshots: `/tmp/baseline-ui-api-live-Zabj1c/playwright-live-e2e.json`, `/tmp/baseline-ui-api-live-Zabj1c/screens`
  - App-stack live artifacts: `/tmp/app-stack-live-e2e-PX9GMi`
  - Bootstrap identity fallback live run: `/tmp/bootstrap-git-identity-live-Y9CS3y/bootstrap.log`
