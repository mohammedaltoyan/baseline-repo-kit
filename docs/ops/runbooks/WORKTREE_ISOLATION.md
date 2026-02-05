# Worktree Isolation (Baseline)

Goal: keep local environments isolated across parallel branches/worktrees so changes remain reviewable, reversible, and conflict-light.

## Non-negotiable rule (multi-agent safe)

- Work only within your assigned worktree.
- Do not modify, interfere with, or depend on files in other worktrees (other agents may be actively working there).
- Synchronize changes only through the approved branching + PR merge process.

## Recommended workflow

- Keep one clean worktree for your mainline branch (fast pulls, quick reviews).
- Create one worktree per feature branch/PR.
- Use a dedicated env file per worktree (avoid "it works on my machine" drift).

## Commands (git worktree)

List worktrees:
- `git worktree list`

Create a new worktree for a branch:
- `git worktree add ../wt-<name> -b <branch-name>`

Remove a worktree (after branch merge):
- `git worktree remove ../wt-<name>`

## Environment isolation (recommended)

- Store per-worktree configuration in untracked files (for example `config/env/.env.local`).
- Point the worktree at the right env file explicitly:
  - `ENV_FILE=config/env/.env.local`
- Keep caches/build artifacts isolated when they can cause nondeterminism:
  - install dependencies per worktree (`npm ci` / `npm install`)
  - avoid sharing build output folders across worktrees
