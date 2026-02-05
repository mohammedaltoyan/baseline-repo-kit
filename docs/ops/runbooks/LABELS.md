# Labels (Template)

This repo ships a labeler workflow (`.github/workflows/labeler.yml`) that applies labels based on changed paths.

## Bootstrap (recommended)

Labels must exist before the labeler can apply them.

Preferred (CLI): the baseline bootstrap ensures labels exist when GitHub provisioning is enabled:
- `npm run baseline:bootstrap -- --to <repo> --mode overlay --overwrite --github`

Fallback (manual): this repo ships a workflow to create missing labels:
- Run: **Actions  ->  "Bootstrap Labels"  ->  Run workflow**

This creates the baseline labels used by `.github/labeler.yml` if they are missing.

## Customization

- Keep label names stable (the labeler references them).
- Label metadata SSOT: `config/policy/github-labels.json` (name/color/description).
- If you add/rename labels:
  - Update `config/policy/github-labels.json` (metadata)
  - Update `.github/labeler.yml` (mapping)
