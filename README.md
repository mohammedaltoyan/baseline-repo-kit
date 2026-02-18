# Guidelines Baseline Kit

Reusable, project-agnostic baseline: planning system + docs templates + repo guardrails.

## What this repo provides

- `AGENTS.md` operating rules (zero hardcoding, zero redundancy, SSOT).
- `apps/` + `packages/` monorepo scaffolding (backend + frontend + shared code).
- `docs/` templates (plans, runbooks, checklists, testing evidence).
- `scripts/` small reusable automation (plans + lint gates).
- `config/` safe env templates and lint/policy config (including branch policy SSOT).
- `.github/` CI + PR policy enforcement + release/promotion/deploy guard workflows + optional security automation templates.
- Bootstrap-driven GitHub hardening (workflow permissions, rulesets, environments, labels, and CODEOWNERS fallback provisioning).
- Auto-PR + PR Policy support for bot-authored agent PRs (GitHub Actions bot: `github-actions[bot]` / `app/github-actions`) on configurable branch prefixes.
- Release PR automation: one-button workflow to open/refresh `dev` -> `main` as a bot for strict production releases (`.github/workflows/release-pr-bot.yml`).
- `tooling/apps/baseline-engine/` settings-driven baseline engine (v2.2).
- `apps/baseline-control/` web-first control panel for dynamic baseline settings.
- Root policy templates: `.editorconfig`, `CONTRIBUTING.md`, `SECURITY.md`.

## Baseline Engine (v2.2)

Use the engine when you need fully dynamic, capability-aware setup and upgrades:

1. Initialize target baseline state:
   - `npm run baseline:init -- --target <target-path>`
2. Launch web UI:
   - `npm run baseline:ui -- --target <target-path>`
3. Preview generated changes:
   - `npm run baseline:diff -- --target <target-path>`
4. Apply generated changes (PR-first by default):
   - `npm run baseline:apply -- --target <target-path>`
5. Run managed upgrades:
   - `npm run baseline:upgrade -- --target <target-path>`
6. Health checks:
   - `npm run baseline:doctor -- --target <target-path>`
   - `npm run baseline:verify -- --target <target-path>`

Engine guarantees:
- Module-driven generation (core + extensions) from settings only.
- Config validation uses JSON Schema SSOT (`config/schema/baseline-config.schema.json`) at runtime.
- UI metadata validation uses JSON Schema SSOT (`config/schema/baseline-ui-metadata.schema.json`) at runtime.
- Capability-aware auto-degrade with explicit warnings/remediation.
- Settings-aware capability requirements (only required features are enforced).
- UI settings are leaf-driven and metadata-backed (all effective settings inherit human-readable explanations and capability labels from metadata SSOT).
- Strategy-aware managed updates (`replace`, `json_merge`, `yaml_merge`, `three_way`) with preserved user blocks.
- CI risk classifier + two-lane gate generated from config.
- Generated workflows default to least-privilege permissions.
- Action references are centrally controlled via settings (`ci.action_refs`) with optional strict SHA-pin enforcement.
- Deploy workflow supports settings-driven OIDC mode (`deployments.oidc`) for short-lived cloud federation paths.
- Upgrade rollback snapshots + migration-based evolution.

## How to use in a new project

Preferred: use the bootstrap so new repos are fully ready (local + optional GitHub provisioning) and can be updated from a single SSOT baseline without copying baseline-only plan instances.

From this baseline repo:

1. Bootstrap a new/existing repo (recommended):
   - Local-only: `npm run baseline:bootstrap -- -- --to <target-path>`
   - Local-only (profile): `npm run baseline:bootstrap -- -- --to <target-path> --profile enterprise`
   - With GitHub provisioning: `npm run baseline:bootstrap -- -- --to <target-path> --github`
   - With explicit code owners: `npm run baseline:bootstrap -- -- --to <target-path> --github --codeowners 'owner-login,org/platform-team'`
   - Active repo (protected branches): `npm run baseline:bootstrap -- -- --to <target-path> --mode overlay --overwrite --github --adopt`
2. Update an existing target repo from the baseline SSOT (no deletes; overwrite baseline-managed files):
   - Preview: `npm run baseline:bootstrap -- -- --to <target-path> --mode overlay --overwrite --dry-run --github`
   - Apply: `npm run baseline:bootstrap -- -- --to <target-path> --mode overlay --overwrite --github`
3. In the target repo (if you skipped tests):
   - Run gates: `npm test`
   - Create a canonical plan: `npm run plans:new -- <slug> "<title>" '@owner' in_progress`

Details:
- `docs/ops/runbooks/BASELINE_BOOTSTRAP.md`
- `docs/ops/runbooks/BASELINE_INSTALL.md` (install/update only)
