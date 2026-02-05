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

1. Copy this repo into your new project (or use it as a template).
   - Optional: install into an existing repo:
     - `npm run baseline:install -- <path-to-repo> overlay`
2. Update project identity:
   - `package.json` name/description
   - `docs/product/*` templates
3. Create your first canonical plan:
   - `npm run plans:new -- <slug> "<title>" '@owner' in_progress`
4. Run baseline gates:
   - `npm install`
   - `npm test`
   - Optional (deeper): `npm run test:deep`
