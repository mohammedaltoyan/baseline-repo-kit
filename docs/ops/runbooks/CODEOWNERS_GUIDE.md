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
