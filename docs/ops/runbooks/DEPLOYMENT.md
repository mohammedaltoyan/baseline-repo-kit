# Deployment (Baseline Template)

This baseline is intentionally vendor-agnostic. Deployment is **project-specific**, but the repo can still ship a consistent, enterprise-grade deployment *interface* and GitHub configuration pattern.

## Goals

- Keep deployments repeatable and auditable.
- Separate **integration** (`dev`) from **production** (`main`).
- Use GitHub **Environments** for approvals + scoped secrets.
- Require explicit promotion for production releases.
- Avoid hardcoding environment details in code; use configuration and environment variables.

## Recommended GitHub setup (CLI-first)

Preferred: use the baseline bootstrap which provisions environments best-effort:

- `npm run baseline:bootstrap -- -- --to <repo> --mode overlay --overwrite --github`

By default, bootstrap:
- Creates component-scoped GitHub Environments (if missing), based on `DEPLOY_ENV_MAP_JSON` (or legacy `DEPLOY_ENV_<COMPONENT>_<TIER>`).
- Default environment names (policy defaults):
  - `application-staging`, `application-production`
  - `docs-staging`, `docs-production`
  - `api-ingress-staging`, `api-ingress-production`
- Adds deployment branch policies derived from `config/policy/branch-policy.json` (integration branch for `*-staging` envs; production branch for `*-production` envs).
- Applies environment hardening when configured (`required_reviewers`, `prevent_self_review`, `can_admins_bypass`).
- Sets deploy/release guard variables from SSOT policy (`config/policy/bootstrap-policy.json`).

Verify via CLI:
- `gh api /repos/<owner>/<repo>/environments`
- `gh api /repos/<owner>/<repo>/environments/application-production/deployment-branch-policies`

## Manual GitHub setup (UI fallback)

1) Create environments:
   - Settings  ->  Environments  ->  New environment
   - Create:
     - `application-staging`
     - `application-production`
     - `docs-staging` (optional)
     - `docs-production` (optional)
     - `api-ingress-staging` (optional)
     - `api-ingress-production` (optional)

2) Configure protections:
   - `application-production` (and any other `*-production` env you use):
     - Require reviewers (release approvals)
     - Restrict branches/tags that can deploy (typically `main` only)
   - `application-staging` (optional):
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
- Production promotion workflow: `.github/workflows/promote-production.yml` (comment `/approve-prod` on merged production PR, or workflow dispatch).
- Baseline default: the workflow resolves the GitHub Environment from `DEPLOY_ENV_MAP_JSON` (tier is still `staging|production`).
- Legacy override: `DEPLOY_ENV_<COMPONENT>_<TIER>` (when set, it takes precedence over the JSON map).
- Keep permissions minimal (add OIDC `id-token: write` only when you actually use it).

If your org has centralized deployment tooling, keep the workflow as a thin wrapper calling your SSOT deploy script.

## Guard variables (recommended)

- `STAGING_DEPLOY_GUARD=enabled` allows staging deploys.
- `PRODUCTION_DEPLOY_GUARD=enabled` allows production deploys.
- `PRODUCTION_PROMOTION_REQUIRED=enabled` requires production deploys to come through `Promote (Production)` (promotion source `approved-flow`).
- `DOCS_PUBLISH_GUARD=enabled` allows docs publish/deploy component runs.
- `API_INGRESS_DEPLOY_GUARD=enabled` allows API ingress deploy component runs.

Default policy is conservative: production/docs/api-ingress are blocked until explicitly enabled.
