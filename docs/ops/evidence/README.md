# Evidence (Ops)

## Where CI evidence lives

CI-generated evidence under `docs/ops/evidence/` is committed to a dedicated branch (`ops/evidence` by default) to avoid opening/merging evidence-only PRs and spamming CI/notifications.

- Branch: `ops/evidence` (configurable via the `EVIDENCE_BRANCH` repo variable)
- Producers: `.github/workflows/collect-evidence.yml`, `.github/workflows/evidence-retention.yml`
- Retention: `.github/workflows/evidence-retention.yml` + `config/lint/structure-rules.json` (config-driven)

## How to browse

- GitHub: switch branch to `ops/evidence`, then navigate `docs/ops/evidence/...`
- Local: `git fetch origin && git checkout ops/evidence`
