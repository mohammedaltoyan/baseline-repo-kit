# Baseline bootstrap (one-button setup)

This baseline kit is a SSOT that can be installed into any new project repo. The bootstrap script runs the full non-destructive setup flow end-to-end:

- Install/update baseline-managed files into a target repo
- Create local env scaffolding (no secrets)
- Initialize `git` and create baseline branches (SSOT: `config/policy/branch-policy.json`)
- Optional: provision/configure GitHub (repo, repo settings, rulesets/branch protection, repo variables) using `gh`
- Optional (manual): enable GitHub Merge Queue if your plan supports it (workflows already support `merge_group`)
- Optional: run `npm install`/`npm test` in the target repo

## Command

- Script: `scripts/tooling/baseline-bootstrap.js`
- NPM: `npm run baseline:bootstrap`

## Requirements

- `git` installed and available on PATH
- Node.js (per `.nvmrc`)
- Optional GitHub automation:
  - `gh` installed
  - Authenticated for the target host (default `github.com`): `gh auth login -h github.com`

## Examples

Local-only bootstrap (no GitHub):

- `npm run baseline:bootstrap -- --to <target-path>`

Bootstrap + GitHub provisioning (creates repo if missing, applies repo settings + rulesets + variables):

- `npm run baseline:bootstrap -- --to <target-path> --github`

Update an existing repo from baseline SSOT (overwrite baseline-managed files; never deletes target files):

- `npm run baseline:bootstrap -- --to <target-path> --mode overlay --overwrite --github`

Dry-run preview (no writes):

- `npm run baseline:bootstrap -- --to <target-path> --dry-run --github`

## Non-destructive guarantees

- Never deletes files in the target repo.
- Does not overwrite an existing `origin` remote; it only validates that it points to the expected repo (host/owner/name). If it does not match, bootstrap fails and prints the mismatch.
- Does not create or commit secret env files. If it creates `config/env/.env.local`, it is gitignored by default.

## GitHub enterprise defaults (SSOT)

Defaults live in `config/policy/bootstrap-policy.json` and can be changed in the baseline SSOT (then applied via updates):

- Required check contexts are derived from workflow files (default: `test`, `validate`).
- Rulesets are created/updated by name:
  - `baseline: integration`
  - `baseline: production`
- Repo settings (patched):
  - Merge methods (default: squash-only, derived from policy)
  - Delete branch on merge (default: enabled)
- Merge Queue:
  - Recommended by policy for integration branch by default.
  - Not configured automatically by bootstrap; enable manually in the GitHub UI when supported by your plan.
- Repo variables set:
  - `BACKPORT_ENABLED` (default: `1`)
  - `SECURITY_ENABLED` (default: `0`)
  - `EVIDENCE_SOURCE_BRANCH` (set to integration branch)
