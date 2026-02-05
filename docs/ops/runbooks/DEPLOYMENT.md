# Deployment (Baseline Template)

This baseline is intentionally vendor-agnostic. Deployment is **project-specific**, but the repo can still ship a consistent, enterprise-grade deployment *interface* and GitHub configuration pattern.

## Goals

- Keep deployments repeatable and auditable.
- Separate **integration** (`dev`) from **production** (`main`).
- Use GitHub **Environments** for approvals + scoped secrets.
- Avoid hardcoding environment details in code; use configuration and environment variables.

## Recommended GitHub setup (CLI-first)

Preferred: use the baseline bootstrap which provisions environments best-effort:

- `npm run baseline:bootstrap -- --to <repo> --mode overlay --overwrite --github`

By default, bootstrap:
- Creates `staging` and `production` environments (if missing).
- Adds deployment branch policies derived from `config/policy/branch-policy.json` (integration -> `staging`, production -> `production`).

Verify via CLI:
- `gh api /repos/<owner>/<repo>/environments`
- `gh api /repos/<owner>/<repo>/environments/production/deployment-branch-policies`

## Manual GitHub setup (UI fallback)

1) Create environments:
   - Settings  ->  Environments  ->  New environment
   - Create:
     - `staging`
     - `production`

2) Configure protections:
   - `production`:
     - Require reviewers (release approvals)
     - Restrict branches/tags that can deploy (typically `main` only)
   - `staging` (optional):
     - Restrict branches (typically `dev`)

3) Configure environment secrets/vars:
   - Store deployment credentials in environment-scoped secrets (never in repo).
   - Keep per-environment variables in GitHub Environments (or your secret manager), not hardcoded in workflows.

## Baseline deployment interface (repo contract)

This baseline recommends a single deploy entrypoint in the target repo:

- `scripts/deploy/deploy.sh`

The deploy script should:
- Be idempotent where possible.
- Accept an environment selector (e.g. `DEPLOY_ENV=staging|production`).
- Fail fast with clear error messages.
- Avoid leaking secrets (never `echo` tokens/keys).

## Optional workflow template

If you choose to use GitHub Actions for deployment:

- Enable the baseline deployment workflow by setting repo variable: `DEPLOY_ENABLED=1`.
- Workflow template: `.github/workflows/deploy.yml` (manual dispatch; calls `scripts/deploy/deploy.sh`).
- Ensure the workflow targets the correct GitHub Environment (`staging`/`production`).
- Keep permissions minimal (add OIDC `id-token: write` only when you actually use it).

If your org has centralized deployment tooling, keep the workflow as a thin wrapper calling your SSOT deploy script.
