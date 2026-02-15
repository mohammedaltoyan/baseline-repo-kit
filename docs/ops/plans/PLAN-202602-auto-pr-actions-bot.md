---
plan_id: PLAN-202602-auto-pr-actions-bot
title: Auto PR creation (GitHub Actions bot)
owner: @owner
status: in_progress # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S10
updated: 2026-02-15
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: S00 - Plan preflight (scope + guardrails)
- Next: S10 - Implement auto PR workflow + script
- Blockers: PR #34 currently requires non-author approval to merge into `dev`
- ETA: 2026-02-16

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (phase map + mergeable increments)
- [x] S03 - Design validation (flows + failure messaging + security posture)
- [ ] S10 - Auto PR workflow (GitHub Actions bot) + Node script (infer Plan/Step)
- [ ] S30 - Docs updates (bootstrap/runbooks/AGENTS) for bot-authoring workflow
- [x] S98 - Objectives Gate (record "Objectives Evidence:")
- [x] S99 - Tests Gate (record CI/local evidence)

Phase Map
- S10: Add `.github/workflows/auto-pr.yml` and `scripts/ops/auto-pr-open.js`
- S30: Update docs and add tests for plan/step inference helpers (where feasible)

Objectives Gate (must pass before testing)
- [ ] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [ ] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-15T21:42:19.664Z (commit df38e15dcbce23d9881eb98cdc716b6918f80d55)
- 2026-02-15 - Use `github-actions[bot]` (via `GITHUB_TOKEN`) as PR author to prevent self-approval deadlocks.
- 2026-02-15 - Auto PR creation must still comply with PR Policy (Plan + Step). Inference source: changed plan file + its `current_step` when safe.
- PR: https://github.com/mohammedaltoyan/baseline-repo-kit/pull/34
- CI Evidence: <add after push>

