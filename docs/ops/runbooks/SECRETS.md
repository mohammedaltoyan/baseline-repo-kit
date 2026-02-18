# Secrets (Baseline)

## Rules

- Never commit real secrets, API keys, tokens, or private URLs.
- Keep local env files untracked (`config/env/.env*`).
- Prefer managed secret stores for production (CI secret stores, cloud secret managers, vaults).
- Principle of least privilege:
  - CI credentials must be scoped to the smallest surface/environment that needs them.
  - Never share "all surfaces" tokens across unrelated deploy jobs.

## Recommended setup

- Use `config/env/*.example` as the only tracked env templates.
- Use `ENV_FILE` to select an env overlay per workspace (local vs cloud).
- Rotate credentials immediately if you discover they were committed or shared.

## CI guidance

- Store secrets in your CI provider's secret store (never in repo files).
- Keep non-sensitive configuration as CI variables.
- Ensure CI does not print secrets (disable verbose env dumps; redact logs).

## GitHub Environments (Surface Isolation)

When using the baseline deploy flows:
- Secrets/vars must live only in the **surface+tier** deploy environment that uses them (example: `application-staging`).
- Approval environments (example: `staging-approval`, `production-approval-*`) must not contain deploy secrets.

## Optional: Environment Isolation Lint (Fail-Closed When Enabled)

This baseline ships an optional lint that verifies environment secret/var **names** are placed only where allowed:
- Script: `scripts/ops/env-isolation-lint.js`
- Workflow (required check): `.github/workflows/env-isolation-lint.yml`

How to enable/operate:
1) Keep repo var: `ENV_ISOLATION_LINT_ENABLED=1` (baseline default).
2) Optionally add repo secret: `ENV_ISOLATION_TOKEN` (recommended for explicit, least-privilege API auth).
3) Ensure workflow token permissions include `actions: read` so `GITHUB_TOKEN` can serve as fallback.
4) Configure allowlists in `config/deploy/deploy-surfaces.json` per surface:
   - `allowed_secret_keys[]`
   - `allowed_var_keys[]`

Behavior:
- When disabled (`ENV_ISOLATION_LINT_ENABLED=0`): the workflow exits quickly and passes (not recommended for hardened repos).
- When enabled and the token is missing or the API cannot be queried: the workflow fails (fail-closed).
