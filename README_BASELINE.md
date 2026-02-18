# Baseline kit

This repository is a reusable baseline kit extracted from a production codebase and then sanitized for reuse.

Goals:
- Keep process/tooling/docs that are broadly reusable.
- Remove project-specific artifacts (secrets, CI evidence logs, one-off demos).
- Keep changes configurable and avoid hardcoding (see `AGENTS.md`).
- Provide a monorepo-friendly default structure (`apps/`, `packages/`) without enforcing a specific stack.
- Ship enterprise-ready GitHub governance templates (rulesets, release policy check, promotion workflow, deploy guards) as opt-in baseline controls.

Use:
- Copy into a new project repo, then customize names/domains and enable only the subsystems you need.
- Baseline Engine v2.2 provides settings-driven generation, capability probes, and managed upgrades:
  - Initialize: `npm run baseline:init -- --target <target-path>`
  - Control panel: `npm run baseline:ui -- --target <target-path>`
  - Diff/apply: `npm run baseline:diff -- --target <target-path>` / `npm run baseline:apply -- --target <target-path>`
  - Upgrade: `npm run baseline:upgrade -- --target <target-path>`
  - Managed merge strategies: `replace`, `json_merge`, `yaml_merge`, `three_way`
  - Capability-aware auto-degrade with remediation (including dynamic GitHub App requirement decisions)
  - Generated CI risk classifier + required-check mapping by branch role
  - Rollback snapshots for upgrade safety
- Recommended: use the installer so this repo remains the SSOT and updates are repeatable:
  - Bootstrap (recommended; local + optional GitHub provisioning): `npm run baseline:bootstrap -- -- --to <target-path> [--github]`
  - Install (new repo): `npm run baseline:install -- <target-path> init`
  - Install (existing repo): `npm run baseline:install -- <target-path> overlay`
  - Update (overwrite baseline-managed files; never deletes target files):
    - Preview: `npm run baseline:install -- <target-path> overlay overwrite dry-run verbose`
    - Apply: `npm run baseline:install -- <target-path> overlay overwrite verbose`

Details:
- `docs/ops/runbooks/BASELINE_BOOTSTRAP.md`
- `docs/ops/runbooks/BASELINE_INSTALL.md`
