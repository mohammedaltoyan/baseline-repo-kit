# CODEOWNERS Guidance

Purpose:
- Require domain reviews on critical paths (plans, ops scripts, CI config, docs) to protect shared contracts.

Suggested entries (replace with your org/team handles):

```txt
# Plans and planning scripts
/docs/ops/plans/**      @your-org/planning-owners
/scripts/ops/**         @your-org/planning-owners

# CI and repo policy
/.github/**             @your-org/ci-owners

# Apps (monorepo)
# /apps/backend/**       @your-org/backend-owners
# /apps/frontend/**      @your-org/frontend-owners
# /packages/**           @your-org/platform-owners

# Docs
/docs/**                @your-org/docs-owners

# Database migrations (if your project uses them)
# /db/migrations/**     @your-org/db-owners
```

Notes:
- Place CODEOWNERS in `.github/CODEOWNERS` (recommended).
- Require at least one approving review in branch protection.
- Baseline bootstrap can provision fallback owners automatically:
  - Policy: `config/policy/bootstrap-policy.json` -> `github.codeowners.default_owners`
  - CLI override: `--codeowners=<csv>` (users and/or `org/team`)
- Keep PR author and reviewer identities separate when approvals are required:
  - PR author approval does not satisfy required-review rules.
  - Use a dedicated automation account for PR authoring and keep human code owners as reviewers.
  - Baseline Auto-PR uses `github-actions[bot]` by default; bootstrap enables the required Actions permission in policy (`github.workflow_permissions.can_approve_pull_request_reviews=true`).
  - Fallback: configure repo secret `AUTOPR_TOKEN` (bot PAT) when org policy blocks Actions from creating PRs with `GITHUB_TOKEN`.
