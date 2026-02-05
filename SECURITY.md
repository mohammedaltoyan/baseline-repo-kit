# Security Policy (Template)

## Reporting

If you discover a security issue:
- Do not open a public issue with exploit details.
- Notify the maintainers using your organization's standard private channel/process.

If no private channel exists yet, create one before onboarding external contributors.

## Repository rules

- Never commit secrets (tokens, API keys, private URLs, certificates).
- Keep local env overlays untracked under `config/env/` (see `docs/ops/runbooks/SECRETS.md`).
- Prefer least-privilege access controls and explicit allow/deny tests for sensitive paths.
