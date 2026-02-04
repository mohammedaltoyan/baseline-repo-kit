# Secrets (Baseline)

## Rules

- Never commit real secrets, API keys, tokens, or private URLs.
- Keep local env files untracked (`config/env/.env*`).
- Prefer managed secret stores for production (CI secret stores, cloud secret managers, vaults).

## Recommended setup

- Use `config/env/*.example` as the only tracked env templates.
- Use `ENV_FILE` to select an env overlay per workspace (local vs cloud).
- Rotate credentials immediately if you discover they were committed or shared.

## CI guidance

- Store secrets in your CI provider's secret store (never in repo files).
- Keep non-sensitive configuration as CI variables.
- Ensure CI does not print secrets (disable verbose env dumps; redact logs).

