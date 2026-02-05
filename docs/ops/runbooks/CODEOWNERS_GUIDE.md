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
