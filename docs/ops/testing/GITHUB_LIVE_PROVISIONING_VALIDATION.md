# Live GitHub Provisioning Validation (Owner Entitlement Matrix)

Use this runbook when changing bootstrap GitHub provisioning (`--github`), capability handling, or entitlement behavior.

## Why

- Confirms provisioning behavior against real GitHub entitlements, not only mocks/selftests.
- Covers owner-type differences (user-owned and org-owned repos).
- Ensures unsupported features degrade with explicit warnings instead of silent failure.

## Command

Preview matrix only (no remote changes):

- `npm run test:github:live`

Execute live provisioning matrix (creates ephemeral repos and deletes them after validation):

- `npm run test:github:live -- --execute`

Common options:

- `--owners user,org:<org-login>`: explicit owner matrix.
- `--all-orgs`: include all accessible org memberships.
- `--skip-orgs`: user-owned scenario only.
- `--keep-repos`: do not auto-delete validation repos.
- `--artifact-path <file>`: custom report path.

Default report path:

- `tmp/github-live-verify/report-<timestamp>.json`

Cleanup behavior:

- Auto-cleanup requires token scope `delete_repo`.
- If `delete_repo` is missing, the validator records cleanup as skipped and keeps repos for manual deletion.

## Matrix minimum

- At least one `user` owner scenario.
- At least one `org` owner scenario (when org access exists).

If an owner scenario cannot support required capabilities (for example rulesets on a private personal repo), the validator records a `degraded_success` outcome when bootstrap emits explicit warning/remediation evidence.

## Evidence policy

- Record command, report path, and scenario outcomes in plan S99.
- Include `outcome.status` per scenario (`success`, `degraded_success`, `failed`).
- Include degraded capability warnings from report `bootstrap.warnings`.
- Do not commit live owner/repo evidence artifacts to baseline source; keep under `tmp/` or CI artifacts.
