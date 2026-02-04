# Branch Protection (Template)

Goal
- Prevent merges unless required checks are green.

Recommended required status checks
- Require the baseline CI check that runs `npm test` (this repo ships `.github/workflows/ci.yml`, which appears as `CI / test` on GitHub).

Notes
- GitHub required checks must match the emitted check-run names exactly; copy them from a successful PR run.
- If you enable GitHub Merge Queue, make sure required checks also run on `merge_group` events.

Optional (team policy)
- Require approvals (e.g., `1+` once you have multiple maintainers)
- Require conversation resolution
- Require linear history (only if you do not use merge commits)

