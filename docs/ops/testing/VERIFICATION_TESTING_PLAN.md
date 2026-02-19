# Verification & Testing Plan (Template)

## Goals

- Prove changes are correct, safe, and maintainable.
- Keep verification change-aware (tests + docs evolve with code).

## Baseline (always)

- `npm test` (repo gates)
- `npm run test:deep` (installer/bootstrap end-to-end)

## Project suites (fill in per project)

- Unit tests:
- Integration tests:
- E2E tests:
- Load/perf tests (if applicable):

## UI/UX verification (when UI changes)

- `npm run test:ui:walkthrough` to generate precheck report + screenshot checklist.
- `npm run test:ui:walkthrough -- --keep-alive` while capturing screenshots.
- Runbook: `docs/ops/testing/UI_VISUAL_UAT.md`

## GitHub provisioning verification (when bootstrap/capabilities change)

- `npm run test:github:live` for preview matrix.
- `npm run test:github:live -- --execute` for live validation.
- Runbook: `docs/ops/testing/GITHUB_LIVE_PROVISIONING_VALIDATION.md`

## Evidence

Record:
- Commands executed
- Logs / reports
- Key metrics (if applicable)
- Links to any dashboards/screenshots
