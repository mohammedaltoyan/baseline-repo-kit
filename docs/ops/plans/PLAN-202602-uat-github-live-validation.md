---
plan_id: PLAN-202602-uat-github-live-validation
title: Add visual UAT walkthrough and live GitHub provisioning matrix validation
owner: @codex
status: done # draft|queued|in_progress|blocked|on_hold|done|canceled|superseded
current_step: S99
updated: 2026-02-19
priority: P2 # P0|P1|P2|P3
target_window: 2026-02 # required for queued
links:
  roadmap: docs/product/roadmap.md#<anchor>
---

At-a-Glance
- Now: S99 - Tests/evidence gate finalized
- Next: Plan closeout (archive after PR merge)
- Blockers: none
- ETA: 2026-02-19

Checklist
- [x] S00 - Plan preflight complete (scope drafted; risks/dependencies noted; no execution yet)
- [x] S01 - Scope/guardrails locked; focus set
- [x] S02 - Requirements captured (include PR slicing plan: phase map + mergeable increments; feature flags if needed)
- [x] S03 - Design validation (flows, failure messaging, CI behavior; overrides explicitly defined or none)
- [x] S10 - Validation contract + reusable tooling design finalized
- [x] S20 - Implement UI visual UAT walkthrough tooling and documentation
- [x] S30 - Implement live GitHub provisioning matrix validation tooling and documentation
- [x] S40 - Execute both validations; collect and record evidence
- [x] S50 - Integrate selftests/gates and finalize docs
- [x] S95 - Testing coverage design and execution (unit + integration/E2E; perf/load if applicable; evidence recorded)

Phase Map (fill during S02)
- Add phase steps as needed (recommended: S10, S20, S30, ...) where each phase is a mergeable PR (or a small PR series).
- Each PR must include `Plan:` and `Step:` in the PR body; after merge, advance the plan to the next phase step.
- Keep phases time-logical: each phase should be independently valuable and testable.
- S10 - Lock design and acceptance criteria for both missing validations.
- S20 - Add visual UAT walkthrough runner + evidence template/checklist.
- S30 - Add live GitHub provisioning entitlement-matrix runner + report output.
- S40 - Run the visual walkthrough and live matrix validation in this environment.
- S50 - Close docs + AGENTS and run full verification gates.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-19T17:05:02.509Z (commit 50115211975920b92be0ed0d161b9b604892ec14)
- 2026-02-19 - Added reusable visual UAT runner (`scripts/tooling/ui-visual-uat.js`) that starts backend + healthy/error frontend variants, runs automated prechecks, and writes checklist/report artifacts for screenshot-driven validation.
- 2026-02-19 - Added reusable live GitHub matrix runner (`scripts/tooling/github-live-provisioning-verify.js`) for user/org owner entitlement coverage with explicit degraded-success handling.
- 2026-02-19 - Hardened bootstrap remote selection to prefer HTTPS clone URL in automation contexts (`scripts/tooling/baseline-bootstrap.js`).
- 2026-02-19 - Added runbooks and test-plan updates for both use cases:
  - `docs/ops/testing/UI_VISUAL_UAT.md`
  - `docs/ops/testing/GITHUB_LIVE_PROVISIONING_VALIDATION.md`
  - `docs/ops/testing/VERIFICATION_TESTING_PLAN.md`
  - `docs/ops/runbooks/BASELINE_BOOTSTRAP.md`
  - `AGENTS.md` command/policy updates.
- 2026-02-19 - UI walkthrough evidence:
  - Precheck report: `tmp/evidence/ui-visual-uat-precheck/ui-visual-uat.report.json`
  - Manual walkthrough report/checklist: `tmp/evidence/ui-visual-uat-manual/ui-visual-uat.report.json`, `tmp/evidence/ui-visual-uat-manual/ui-visual-uat.checklist.md`
  - Screenshots: `tmp/evidence/ui-visual-uat-manual/screenshots/01-happy-home.png`, `tmp/evidence/ui-visual-uat-manual/screenshots/02-openapi-snapshot.png`, `tmp/evidence/ui-visual-uat-manual/screenshots/03-backend-error-state.png`, `tmp/evidence/ui-visual-uat-manual/screenshots/04-settings-table.png`
- 2026-02-19 - Live GitHub matrix evidence:
  - Preview: `tmp/evidence/github-live-preview-final.json`
  - Execute: `tmp/evidence/github-live-exec-final.json` (summary: executed=2, successful=1, degraded=1, failed=0)
  - Degraded row reason captured: private personal repo ruleset entitlement limitation with explicit remediation.
- PR: pending
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions (local verification complete)
  - `npm test`
  - `npm run test:ui:walkthrough -- --artifact-dir tmp/evidence/ui-visual-uat-precheck`
  - `npm run test:ui:walkthrough -- --keep-alive --artifact-dir tmp/evidence/ui-visual-uat-manual`
  - `npm run test:github:live -- --artifact-path tmp/evidence/github-live-preview-final.json`
  - `npm run test:github:live -- --execute --artifact-path tmp/evidence/github-live-exec-final.json`
