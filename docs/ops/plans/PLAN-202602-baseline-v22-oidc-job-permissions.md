---
plan_id: PLAN-202602-baseline-v22-oidc-job-permissions
title: Baseline v2.2 OIDC deploy job permission hardening
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
- S10: ensure OIDC deploy permissions are emitted at both workflow and deploy job level; add dedicated workflow selftest coverage and update runbook/agent governance guidance.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- 2026-02-19 - Hardened deploy workflow generation so `deployments.oidc.enabled=true` emits `id-token: write` in both workflow-level and job-level permission blocks, avoiding job-level override regressions.
- 2026-02-19 - Added dedicated workflow selftest (`scripts/tooling/baseline-engine.workflows.selftest.js`) that parses generated YAML and asserts OIDC on/off/malformed behaviors with least-privilege defaults.
- Standards references:
  - https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#permissions
  - https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect
- PR: pending (next bot-authored codex PR)
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions
  - local: `npm test` (pass, 2026-02-19)
  - local: `npm run test:deep` (pass, 2026-02-19)
- Objectives Evidence: auto-verified at 2026-02-19T09:40:00Z - OIDC permissions are configuration-driven and least-privilege correct under GitHub permission override semantics, with centralized generator logic and explicit regression tests.
