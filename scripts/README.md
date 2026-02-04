# Script Directory Layout
- `ops/` - operational tooling for planning + gates (plan lifecycle, linting helpers).
- `tooling/` - repo tooling (structure guard, docs hygiene).
- `utils/` - shared script utilities (importable helpers; avoid duplication).

Repository rule (enforced by `npm run lint:structure`): keep `scripts/` root layout-only (README + folders). Move any new scripts into the appropriate subfolder above.

Update `package.json` scripts when adding new automation so consumers can discover them easily.
