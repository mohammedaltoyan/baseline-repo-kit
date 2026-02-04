# Verification Playbook (Template)

## 1) Preflight
- Confirm you are on the intended branch/commit.
- Confirm you have an active plan and the PR body includes `Plan:` and `Step:`.

## 2) Run baseline gates
- `npm test`

## 3) Run project suites (if present)
- Unit:
- Integration:
- E2E:
- Load/perf:

## 4) Record evidence
- Attach logs/reports and link to CI runs.
- Check off S98/S99 in the plan when appropriate.

