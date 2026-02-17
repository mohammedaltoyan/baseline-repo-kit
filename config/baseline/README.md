# Baseline Lock (Target Repos)

The baseline installer (`npm run baseline:install`) writes a small lock file into target repos:

- `config/baseline/baseline.lock.json`

Purpose:
- Record the selected baseline `profile` (and other installer metadata) so baseline updates are repeatable.
- Keep baseline updates deterministic when running in overlay mode.

Notes:
- The lock file is baseline-managed (safe to overwrite during updates).
- It contains no secrets.

