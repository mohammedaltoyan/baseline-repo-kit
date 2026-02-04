## Environment Files

All environment templates and local overrides live in this directory.

Tracked templates:
- `config/env/.env.example`
- `config/env/.env.local.example`
- `config/env/.env.cloud.example`

Untracked per-workspace files (never commit secrets):
- `config/env/.env`
- `config/env/.env.local`
- `config/env/.env.cloud`

Default load order (see `scripts/utils/load-env.js`):
1. `ENV_FILE` (if set - highest precedence)
2. `config/env/.env.cloud`
3. `config/env/.env.local`
4. `config/env/.env`
5. `.env` (repo root, optional)

Guideline: keep one env file per workspace (root repo or Git worktree), and keep real values out of version control.

