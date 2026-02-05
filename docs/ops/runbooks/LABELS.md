# Labels (Template)

This repo ships a labeler workflow (`.github/workflows/labeler.yml`) that applies labels based on changed paths.

## Bootstrap (recommended)

Labels must exist before the labeler can apply them. This repo ships a manual bootstrap workflow:
- Run: **Actions → "Bootstrap Labels" → Run workflow**

This creates the baseline labels used by `.github/labeler.yml` if they are missing.

## Customization

- Keep label names stable (SSOT is `.github/labeler.yml`).
- If you rename a label, update both:
  - `.github/labeler.yml`
  - `.github/workflows/bootstrap-labels.yml`

