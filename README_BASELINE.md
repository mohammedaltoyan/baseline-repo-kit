# Baseline kit

This repository is a reusable baseline kit extracted from a production codebase and then sanitized for reuse.

Goals:
- Keep process/tooling/docs that are broadly reusable.
- Remove project-specific artifacts (secrets, CI evidence logs, one-off demos).
- Keep changes configurable and avoid hardcoding (see `AGENTS.md`).
- Provide a monorepo-friendly default structure (`apps/`, `packages/`) without enforcing a specific stack.

Use:
- Copy into a new project repo, then customize names/domains and enable only the subsystems you need.
- Recommended: use the installer so this repo remains the SSOT and updates are repeatable:
  - Install (new repo): `npm run baseline:install -- <target-path> init`
  - Install (existing repo): `npm run baseline:install -- <target-path> overlay`
  - Update (overwrite baseline-managed files; never deletes target files):
    - Preview: `npm run baseline:install -- <target-path> overlay overwrite dry-run verbose`
    - Apply: `npm run baseline:install -- <target-path> overlay overwrite verbose`

Installer details: `docs/ops/runbooks/BASELINE_INSTALL.md`
