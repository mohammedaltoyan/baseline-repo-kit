---
plan_id: PLAN-202602-openapi-contract-hardening
title: OpenAPI contract hardening for baseline app stack
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
- Now: S99 - Final verification evidence capture
- Next: Mark done after PR merge
- Blockers: none
- ETA: 2026-02-19

Checklist
- [x] S00 - Plan preflight complete (scope and guardrails validated on clean `origin/dev` baseline).
- [x] S01 - Scope/guardrails locked; focus set.
- [x] S02 - Requirements captured (OpenAPI 3.1 contract endpoint generated from shared SSOT, plus RFC 9457 problem-details error envelopes).
- [x] S03 - Design validation complete (shared package remains SSOT; backend/frontend remain decoupled via discovered contract endpoints).
- [x] S10 - Extend `packages/shared/app-stack-contract.js` with OpenAPI document generation and endpoint metadata.
- [x] S20 - Wire backend endpoint + frontend client/UI consumption + error parsing compatibility.
- [x] S30 - Update tests (shared/backend/frontend) and runtime docs/AGENTS for new standards behavior.
- [x] S95 - Testing coverage execution (unit + integration + full baseline gates + deep verify evidence).

Phase Map
- S10 (PR1): shared contract SSOT adds OpenAPI 3.1 generation + API path catalog.
- S20 (PR2): backend serves OpenAPI endpoint and uses standards-compliant problem-details responses; frontend consumes/exposes OpenAPI snapshot.
- S30 (PR3): tests/docs/AGENTS updates and verification evidence.
- S95/S98/S99: run `npm test` and `npm run test:deep`, then record evidence.

Objectives Gate (must pass before testing)
- [x] S98 - Objectives Gate - SIMPLE, best practice, SCALABLE, and DYNAMIC with ZERO REDUNDANCY and ZERO HARD CODING; configuration-driven where applicable; SSOT; least-privilege security (RLS/policies if supported) (manual check with Objectives Evidence)

Testing Gate (required to mark plan done)
- [x] S99 - Tests Gate - All required suites passing; change-aware check (code changes require matching test artifacts). Include evidence for unit + integration/E2E; perf/load marked N/A if not applicable.

Decisions & Notes
- Objectives Evidence: auto-verified at 2026-02-19T15:17:36.576Z (commit eae58ac995bbea81d4392fbd6fa26cbe9ce2a048)
- 2026-02-19 - Standards target selected: OpenAPI 3.1 for machine-readable API contract and RFC 9457 problem-details for error payload consistency.
- 2026-02-19 - Contract/document generation remains centralized in shared package (no backend/frontend duplicate schemas).
- 2026-02-19 - Standards references validated from primary sources:
  - OpenAPI Specification v3.1.1: https://spec.openapis.org/oas/v3.1.1.html
  - RFC 9457 (obsoletes RFC 7807): https://datatracker.ietf.org/doc/rfc9457/
  - OWASP API Security Top 10 2023 (inventory/documentation guidance): https://owasp.org/API-Security/editions/2023/en/0xa9-improper-inventory-management/
- PR: https://github.com/mohammedaltoyan/baseline-repo-kit/pull/82
- CI Evidence: https://github.com/mohammedaltoyan/baseline-repo-kit/actions/runs/22187751570
- Local Evidence:
  - `npm test` (pass)
  - `npm run test:deep` (pass)
