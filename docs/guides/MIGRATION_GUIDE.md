# Migration Guide (Template)

Use this guide if your project has a database schema that evolves over time.

## Principles

- Migrations are append-only (never rewrite history once shared).
- Avoid hard-coded customer/account identifiers in schema changes.
- Keep changes reversible when possible (document rollback steps).

## Workflow (example)

1. Create a plan and describe the schema change.
2. Add a new migration file in your project's migrations folder (choose your convention).
3. Run local checks/tests.
4. Record evidence in the plan (what ran, outputs, and any risks).

## RLS / Access control (if applicable)

- Enable row-level security / least-privilege policies for user-facing tables.
- Add tests that prove allowed vs denied access paths.
