# Testing Guide

This baseline kit ships process + lightweight repo gates. It does not include application-specific test suites.

## Baseline checks (always available)

- `npm test` runs baseline guardrails:
  - plan lint (`npm run lint:plans`)
  - PR policy selftest (`npm run lint:pr-policy`)
  - branch policy selftest (`npm run lint:branch-policy`)
  - docs hygiene lint (`npm run lint:docs`)
  - objectives lint (`npm run lint:objectives`)
  - structure lint (`npm run lint:structure`)
  - installer selftest (`npm run lint:installer`)
  - env loader selftest (`npm run lint:env`)

## Deeper verification (optional)

- `npm run test:deep` installs the baseline into temp repos (init + overlay) and runs `npm test` in the installed copies.

## Plan verification and gates

- `npm run plans:verify` runs `npm test` (set `VERIFY_DEEP=1` to include `npm run test:deep`).
- `npm run plans:gate -- --plan PLAN-YYYYMM-<slug>` runs verification and checks off S99 in the plan.

## Adding test suites in a real project

Wire your project's suites into `npm test` (or add a `verify` script), for example:

- Unit tests (language/framework dependent)
- Integration tests
- E2E tests (only when a UI or external system needs coverage)
- Load/performance tests (when performance-sensitive)

Keep tests change-aware and tied to the plan gate (S99).
