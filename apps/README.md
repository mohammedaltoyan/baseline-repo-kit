# Apps (Deployable Units)

This folder contains deployable applications/services.

Baseline recommendations:
- Keep each app independently buildable/testable/deployable.
- Do not couple apps directly; share reusable code through `packages/`.
- Keep app-specific config in the app (and secrets untracked via `config/env/` overlays).
- `baseline-control/` is the web-first control panel for Baseline Engine v2.2.
