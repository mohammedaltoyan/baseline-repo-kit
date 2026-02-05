# Branch Protection (Template)

Goal
- Prevent merges unless required checks are green.

Recommended required status checks
- Require the baseline CI check that runs `npm test` (this repo ships `.github/workflows/ci.yml`, which appears as `CI / test` on GitHub).
- Require the PR metadata policy check (this repo ships `.github/workflows/pr-policy.yml`, which appears as `PR Policy / validate` on GitHub).

Notes
- GitHub required checks must match the emitted check-run names exactly; copy them from a successful PR run.
- If you enable GitHub Merge Queue, make sure required checks also run on `merge_group` events.
- Consider enabling "Require branches to be up to date before merging" (or enforce via Merge Queue) to reduce post-merge breakage.

Optional (team policy)
- Require approvals (e.g., `1+` once you have multiple maintainers)
- Require conversation resolution
- Require linear history (only if you do not use merge commits)
