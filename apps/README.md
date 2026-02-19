# Apps (Deployable Units)

This folder contains deployable applications/services.

Baseline recommendations:
- Keep each app independently buildable/testable/deployable.
- Do not couple apps directly; share reusable code through `packages/`.
- Keep app-specific config in the app (and secrets untracked via `config/env/` overlays).
- `backend/` and `frontend/` are now generic production-ready runtime templates that integrate through shared contract SSOT in `packages/shared/app-stack-contract.js`.
- `baseline-control/` is the web-first control panel for Baseline Engine v2.2:
  - renders settings from schema/ui metadata
  - shows effective values + capability support + remediation per setting
  - runs full lifecycle flows (`init`, `diff`, `doctor`, `verify`, `upgrade`, `apply`, capability refresh, config save) against the engine API
  - supports UI session target/profile switching so one started UI can operate on different local repos without new CLI commands
