# Deployment (Baseline Template)

This baseline is intentionally vendor-agnostic. Deployment is **project-specific**, but the repo can still ship a consistent, enterprise-grade deployment *interface* and GitHub configuration pattern.

## Goals

- Keep deployments repeatable and auditable.
- Separate **integration** (`dev`) from **production** (`main`).
- Use GitHub **Environments** for approvals + scoped secrets.
- Require explicit promotion for staging and production releases.
- Avoid hardcoding environment details in code; use configuration and environment variables.

## Deploy Surface Registry (SSOT)

- SSOT path (project-owned): `config/deploy/deploy-surfaces.json`
- Template: `config/deploy/deploy-surfaces.example.json`
- Bootstrap behavior: when deploy is enabled, bootstrap creates `config/deploy/deploy-surfaces.json` from the template **only if missing** (never overwrites).

The registry defines:
- `surfaces[]`: `surface_id` + path matchers (`paths_include_re`, optional `paths_exclude_re`)
- Environment naming (deploy envs) for each tier
- Approval environment naming for each tier (commit-level + per-surface)
- Optional allowed secret/var keys (for `env-isolation-lint`)

## Recommended GitHub setup (CLI-first)

Preferred: use the baseline bootstrap which provisions environments best-effort:

- `npm run baseline:bootstrap -- -- --to <repo> --mode overlay --overwrite --github`

By default, bootstrap:
- Creates deploy environments derived from the deploy surface registry:
  - Deploy envs (secrets live here): `"{surface}-staging"`, `"{surface}-production"`
  - Approval-only envs (no secrets): `staging-approval`, `production-approval`, plus `staging-approval-{surface}` / `production-approval-{surface}`
- Adds deployment branch policies derived from `config/policy/branch-policy.json`:
  - Deploy envs are restricted to integration (`dev`) for staging and production (`main`) for production.
  - Approval envs allow both integration and production branches (so approvals work regardless of the workflow ref).
- Requires explicit approvals via GitHub Environments (approval envs have required reviewers; deploy envs do not).
- Sets deploy/release guard variables from SSOT policy (`config/policy/bootstrap-policy.json`).

Verify via CLI:
- `gh api /repos/<owner>/<repo>/environments`
- `gh api /repos/<owner>/<repo>/environments/application-production/deployment-branch-policies`

## Manual GitHub setup (UI fallback)

1) Create deploy environments (secrets live here):
   - Settings  ->  Environments  ->  New environment
   - Create one per surface+tier (examples):
     - `application-staging`, `application-production`
     - `docs-staging`, `docs-production`
     - `api-ingress-staging`, `api-ingress-production`

2) Create approval environments (no secrets stored):
   - Commit-level:
     - `staging-approval`
     - `production-approval`
   - Surface-level:
     - `staging-approval-application`, `production-approval-application`
     - `staging-approval-docs`, `production-approval-docs`
     - `staging-approval-api-ingress`, `production-approval-api-ingress`

3) Configure protections:
   - Deploy envs:
     - Restrict branches/tags that can deploy:
       - `*-staging`: integration branch only (typically `dev`)
       - `*-production`: production branch only (typically `main`)
     - Do not require reviewers on deploy envs (approvals happen in approval envs).
   - Approval envs:
     - Require reviewers (release approvals)
     - Allow both integration and production branches

4) Configure environment secrets/vars:
   - Store deployment credentials in the **deploy environment** for the surface+tier that uses them.
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
- Leaf deploy workflow: `.github/workflows/deploy.yml` (internal executor; dispatched by promote workflows).
- Staging promotion workflow: `.github/workflows/promote-staging.yml` (comment `/approve-staging` on a merged integration PR, or workflow dispatch).
- Production promotion workflow: `.github/workflows/promote-production.yml` (comment `/approve-prod` on a merged production PR, or workflow dispatch).
- Baseline default: the deploy workflow resolves the GitHub Environment from `config/deploy/deploy-surfaces.json` (registry SSOT).
- Fallback: when registry is missing, resolve env names from `DEPLOY_ENV_MAP_JSON`, with legacy override via `DEPLOY_ENV_<COMPONENT>_<TIER>`.
- Keep permissions minimal (add OIDC `id-token: write` only when you actually use it).

If your org has centralized deployment tooling, keep the workflow as a thin wrapper calling your SSOT deploy script.

## Approval modes (commit vs surface)

Promotion workflows support two approval modes:
- `commit`: one approval unlocks all affected surfaces for the promotion run.
- `surface`: one approval per affected surface.

Resolution precedence:
1) workflow dispatch input `approval_mode` (if provided)
2) repo var default: `STAGING_APPROVAL_MODE_DEFAULT` / `PRODUCTION_APPROVAL_MODE_DEFAULT`
3) registry default: `defaults.approval_mode_by_tier` in `config/deploy/deploy-surfaces.json`

## Production Requires Staging (Receipts Gate)

When `PRODUCTION_REQUIRES_STAGING_SUCCESS=enabled`:
- Production promotion verifies staging receipts exist for the same deploy SHA (per-surface) before requiring approval and dispatching deploys.
- Receipts are written by the leaf deploy workflow to `DEPLOY_RECEIPTS_BRANCH` under `DEPLOY_RECEIPTS_PREFIX/<tier>/<sha>/<surface>.json`.

## Guard variables (recommended)

- `STAGING_DEPLOY_GUARD=enabled` allows staging deploys.
- `STAGING_PROMOTION_REQUIRED=enabled` requires staging deploys to come through `Promote (Staging)` (promotion source `approved-flow`).
- `PRODUCTION_DEPLOY_GUARD=enabled` allows production deploys.
- `PRODUCTION_PROMOTION_REQUIRED=enabled` requires production deploys to come through `Promote (Production)` (promotion source `approved-flow`).
- `PRODUCTION_REQUIRES_STAGING_SUCCESS=enabled` blocks production promotion unless staging receipts exist for the same SHA (per-surface).
- `DOCS_PUBLISH_GUARD=enabled` allows docs publish/deploy component runs.
- `API_INGRESS_DEPLOY_GUARD=enabled` allows API ingress deploy component runs.

Default policy in this baseline is strict-but-operational: staging and production deploy guards are enabled, while docs/api-ingress remain explicit opt-in.
