# Security Automation (Template)

This baseline ships optional security automation for GitHub-hosted repos.

## Enablement (recommended)

Set a repository variable:
- `SECURITY_ENABLED=1`

This enables:
- `.github/workflows/dependency-review.yml` (dependency diff checks on PRs)
- `.github/workflows/codeql.yml` (SAST for JavaScript/TypeScript)

Note: GitHub "Security & analysis" toggles (Dependency graph, Dependabot alerts, automated security fixes, secret scanning) are repo settings.
The baseline bootstrap can attempt to enable these best-effort via API when you run with `--github` (SSOT: `config/policy/bootstrap-policy.json`).

## Dependency updates

This repo includes `.github/dependabot.yml` (weekly npm updates, monthly GitHub Actions updates).

For monorepos, add additional `directory:` entries for each app/package that has its own lockfile/manifest.

## Branch protection notes

Required checks must run on GitHub Merge Queue (`merge_group`) if you enable it. This baseline ensures:
- `CI` and `PR Policy` workflows run on `merge_group`
- `CodeQL` runs on `merge_group` when enabled

If you make security checks required, verify they emit check-runs for both `pull_request` and `merge_group`.
