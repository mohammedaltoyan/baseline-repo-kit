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

Preferred: use the installer so projects can be updated from a single SSOT baseline without copying baseline-only plan instances.

From this baseline repo:

1. Install the baseline into a target repo:
   - New repo: `npm run baseline:install -- <target-path> init`
   - Existing repo: `npm run baseline:install -- <target-path> overlay`
2. Update an existing target repo from the baseline SSOT (no deletes; overwrite baseline-managed files):
   - Preview: `npm run baseline:install -- <target-path> overlay overwrite dry-run verbose`
   - Apply: `npm run baseline:install -- <target-path> overlay overwrite verbose`
3. In the target repo:
   - Create a canonical plan: `npm run plans:new -- <slug> "<title>" '@owner' in_progress`
   - Install deps and run gates: `npm install` then `npm test`

Details: `docs/ops/runbooks/BASELINE_INSTALL.md`
