# Branch Protection (Template)

Goal
- Prevent merges unless required checks are green.

Recommended branches (enterprise default)
- Integration: `dev`
- Production: `main`
- Hotfix: `hotfix/*` (short-lived)

Recommended required status checks
- Require the baseline CI check that runs `npm test` (this repo ships `.github/workflows/ci.yml`, which appears as `CI / test` on GitHub).
- Require the PR metadata policy check (this repo ships `.github/workflows/pr-policy.yml`, which appears as `PR Policy / validate` on GitHub).

Notes
- GitHub required checks must match the emitted check-run names exactly; copy them from a successful PR run.
- If you enable GitHub Merge Queue, make sure required checks also run on `merge_group` events.
- Consider enabling "Require branches to be up to date before merging" (or enforce via Merge Queue) to reduce post-merge breakage.
- Automation option: `npm run baseline:bootstrap -- --to <repo> --github` can provision GitHub rulesets (including merge queue) using SSOT defaults in `config/policy/bootstrap-policy.json`.

Branch rules (recommended)

- Protect `dev` (integration):
  - Require PRs (no direct pushes).
  - Require required checks.
  - Enable GitHub Merge Queue to serialize merges safely when multiple PRs are active.
- Protect `main` (production):
  - Require PRs (no direct pushes).
  - Require required checks.
  - Only accept changes via:
    - Release PR: `dev` -> `main`
    - Hotfix PR: `hotfix/*` -> `main` (and backport to `dev`)
  - Enforce allowed PR source branches via CI (SSOT is `config/policy/branch-policy.json`).
  - Optional: enable repo variable `BACKPORT_ENABLED=1` to automatically open a backport PR from production -> integration after a hotfix merge (ships as `.github/workflows/hotfix-backport.yml`).

Optional (quality-of-life)
- Set the repository default branch to `dev` so new PRs default to the integration branch (avoids accidental PRs to `main`).

Optional (team policy)
- Require approvals (e.g., `1+` once you have multiple maintainers)
- Require conversation resolution
- Require linear history (only if you do not use merge commits)
