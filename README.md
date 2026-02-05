# Guidelines Baseline Kit

Reusable, project-agnostic baseline: planning system + docs templates + repo guardrails.

## What this repo provides

- `AGENTS.md` operating rules (zero hardcoding, zero redundancy, SSOT).
- `apps/` + `packages/` monorepo scaffolding (backend + frontend + shared code).
- `docs/` templates (plans, runbooks, checklists, testing evidence).
- `scripts/` small reusable automation (plans + lint gates).
- `config/` safe env templates and lint/policy config (including branch policy SSOT).
- `.github/` CI + PR policy enforcement + optional security automation templates.
- Root policy templates: `.editorconfig`, `CONTRIBUTING.md`, `SECURITY.md`.

## How to use in a new project

Preferred: use the bootstrap so new repos are fully ready (local + optional GitHub provisioning) and can be updated from a single SSOT baseline without copying baseline-only plan instances.

From this baseline repo:

1. Bootstrap a new/existing repo (recommended):
   - Local-only: `npm run baseline:bootstrap -- --to <target-path>`
   - With GitHub provisioning: `npm run baseline:bootstrap -- --to <target-path> --github`
2. Update an existing target repo from the baseline SSOT (no deletes; overwrite baseline-managed files):
   - Preview: `npm run baseline:bootstrap -- --to <target-path> --mode overlay --overwrite --dry-run --github`
   - Apply: `npm run baseline:bootstrap -- --to <target-path> --mode overlay --overwrite --github`
3. In the target repo (if you skipped tests):
   - Run gates: `npm test`
   - Create a canonical plan: `npm run plans:new -- <slug> "<title>" '@owner' in_progress`

Details:
- `docs/ops/runbooks/BASELINE_BOOTSTRAP.md`
- `docs/ops/runbooks/BASELINE_INSTALL.md` (install/update only)
