# Testing Guide

This baseline kit ships process + lightweight repo gates. It does not include application-specific test suites.

## Baseline checks (always available)

- `npm test` runs the baseline lint gates:
  - plan lint (`npm run lint:plans`)
  - objectives lint (`npm run lint:objectives`)
  - structure lint (`npm run lint:structure`)

## Adding test suites in a real project

Wire your project's suites into `npm test` (or add a `verify` script), for example:

- Unit tests (language/framework dependent)
- Integration tests
- E2E tests (only when a UI or external system needs coverage)
- Load/performance tests (when performance-sensitive)

Keep tests change-aware and tied to the plan gate (S99).

