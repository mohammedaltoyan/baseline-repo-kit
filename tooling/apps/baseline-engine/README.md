# Baseline Engine (v2.2)

Core dynamic engine for baseline repository installation, policy generation, capability detection, and managed upgrades.

## Commands

- `baseline init`
- `baseline ui`
- `baseline diff`
- `baseline apply`
- `baseline upgrade`
- `baseline doctor`
- `baseline verify`

## Design constraints

- Settings-driven generation only (no hardcoded repo behavior).
- JSON Schema SSOT validation at runtime (`config/schema/baseline-config.schema.json`).
- UI metadata schema SSOT validation at runtime (`config/schema/baseline-ui-metadata.schema.json`).
- Capability-aware with explicit fallback warnings.
- Module-based extension contract.
- Backward-compatible upgrades by default.
