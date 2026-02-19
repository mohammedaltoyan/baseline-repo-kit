# Repo Structure (Monorepo Template)

This baseline assumes a **single repository** that can host both backend and frontend, optimized for small, frequent PRs and multi-agent work.

Goals:
- Keep boundaries clear (apps vs shared packages).
- Keep behavior configuration-driven (row-driven where applicable).
- Keep a single source of truth for decisions, evidence, and workflows.

## Recommended layout

```text
apps/
  backend/     # API / workers / jobs (deployable unit; includes generic runtime template)
  frontend/    # UI (deployable unit; includes generic runtime template)
packages/
  shared/      # reusable libraries/config used by multiple apps (includes app-stack contract SSOT)
config/        # repo-wide config + templates (no secrets committed)
docs/          # documentation (guides + ops + product)
scripts/       # repo automation (plans + lint gates)
tooling/       # internal tooling (standalone tooling apps under tooling/apps/)
```

## Rules (enterprise-grade defaults)

- **No app-to-app coupling:** `apps/*` do not directly depend on each other. Share code through `packages/*`.
- **SSOT configuration:** shared configuration lives in one canonical place (often `packages/shared/` or `config/`), not duplicated per app.
- **Workflow/row-driven where applicable:** orchestrations are data-defined (tables/config/rows), not scattered `if/else` branches.
- **Isolation:** each deployable app owns its runtime config, migrations, and release process; shared contracts live in packages.

## Where to put things

- Backend migrations: `apps/backend/` (or a backend-owned subfolder) so ownership is explicit.
- Shared types/contracts: `packages/shared/` (or multiple packages split by domain).
- Baseline generic app-stack contract SSOT: `packages/shared/app-stack-contract.js`.
- Repo automation: `scripts/` (single implementations; parameterized; no copy/paste variants).
- Tooling apps with their own dependencies: `tooling/apps/<name>/` (avoid random root-level tooling packages).
