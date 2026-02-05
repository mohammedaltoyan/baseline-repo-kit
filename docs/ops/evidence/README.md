# Evidence (Ops)

This folder defines the convention for storing run evidence under `docs/ops/evidence/`.

## Recommended (optional): GitHub Actions evidence branch

This repo ships **optional** evidence workflows (disabled by default) to keep mainline PRs clean:

- Evidence branch: `ops/evidence` (configurable via the `EVIDENCE_BRANCH` repo variable)
- Enable switch: set repo variable `EVIDENCE_ENABLED=1`
- Producers:
  - `.github/workflows/collect-evidence.yml` (writes `docs/ops/evidence/CI/<timestamp>/summary.md`)
  - `.github/workflows/evidence-retention.yml` (prunes old evidence using `scripts/ops/prune-evidence.js` + `config/lint/structure-rules.json`)

When enabled, evidence is committed to the evidence branch to avoid opening/merging evidence-only PRs and spamming CI/notifications.

## How to browse

- GitHub: switch branch to your evidence branch (default `ops/evidence`), then navigate `docs/ops/evidence/...`
- Local: `git fetch origin && git checkout ops/evidence` (or your configured branch)
