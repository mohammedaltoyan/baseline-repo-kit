# Operations Configuration Guide (Template)

This guide describes operating a **configuration-driven** system: behavior changes are made by updating canonical configuration (not by hardcoded branches in code).

## Principles

- **Single source of truth (SSOT):** configuration and decisions live in canonical modules/stores.
- **Precedence ladder (if applicable):** define a clear scope order (example: `Global -> Environment -> Project -> Service -> Resource`) and resolve via a single resolver (no ad-hoc overrides).
- **No manual changes in shared environments:** apply changes via versioned configuration, migrations, or approved ops tooling; avoid ad-hoc changes that bypass review.

## Typical building blocks (optional)

Exact names vary by project, but common patterns include:

- **Settings registry + schemas:** categories are governed and validated (data-driven).
- **Versioned configuration:** changes are staged and then promoted to "current" projections.
- **Secrets management:** secrets live in a secrets manager/vault; runtime config references secret identifiers.
- **Routing/mapping rules as data:** transformations and routing are defined as configuration.
- **Decision/audit logs:** resolutions write provenance for audit/debug.

## Safe change workflow

1) Create a plan (`docs/ops/plans/`) and define the change.
2) Apply the configuration change through the approved mechanism.
3) Verify via the relevant test suites and record evidence in the plan.
