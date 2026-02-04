# Worktree Isolation (Baseline)

Goal: keep local environments isolated across parallel branches/worktrees.

## Recommendations

- Keep one clean worktree for your mainline branch.
- Create one worktree per feature branch and use a dedicated env file per worktree.
- Store per-worktree configuration in untracked files (for example `config/env/.env.local`).
- Avoid sharing local caches or build artifacts across worktrees when they can cause nondeterminism.

