# Guidelines Baseline Kit

Reusable, project-agnostic baseline: planning system + docs templates + repo guardrails.

## What this repo provides

- `AGENTS.md` operating rules (zero hardcoding, zero redundancy, SSOT).
- `docs/` templates (plans, runbooks, checklists, testing evidence).
- `scripts/` small reusable automation (plans + lint gates).
- `config/` safe env templates and lint config.
- `.github/` minimal CI + labeler templates.

## How to use in a new project

1. Copy this repo into your new project (or use it as a template).
   - Optional: install into an existing repo:
     - `npm run baseline:install -- --to <path-to-repo> --mode overlay`
2. Update project identity:
   - `package.json` name/description
   - `docs/product/*` templates
3. Create your first canonical plan:
   - `npm run plans:new -- <slug> "<title>" '@owner' in_progress`
4. Run baseline gates:
   - `npm install`
   - `npm test`
