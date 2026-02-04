# Objectives Lint Rules (Baseline)

This repo includes a lightweight "objectives lint" to catch obvious violations of baseline engineering rules.

## Scope

- Scans code and SQL files in the repo (skips `docs/`, `tests/`, `config/env/`, and `node_modules/`).
- Use `OBJECTIVES_LINT_INCLUDE` (regex) to limit scope when needed.

## Rules (high level)

- `DSN_URL`: hard-coded `postgres://` / `postgresql://` DSNs in source.
- `LOCALHOST`: localhost literals in non-test code.
- `ID_LITERAL`: hard-coded identifier literals for configured field names (optional; driven by `config/lint/objectives-lint.json` or `OBJECTIVES_ID_LITERAL_FIELDS`).
- `RLS_OFF`: disabling row-level security in SQL.
- `RLS_MISSING` / `POLICY_MISSING`: heuristics for database migrations (enforced only when you opt in).

## Suppressions (with justification)

- JS/TS: `// objectives:allow <RULE_CODE> Justification: ...`
- SQL: `-- objectives:allow <RULE_CODE> Justification: ...`
