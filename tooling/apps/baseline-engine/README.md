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
- Locked-decision SSOT gate (`config/policy/baseline-v22-contract.json`) enforced via `npm run lint:contract`.
- Capability-aware with explicit fallback warnings.
- Dynamic topology/matrix normalization (preset topologies and deployment approval matrix rows stay consistent with settings).
- Effective decision logging to `config/policy/baseline-resolution-log.json`.
- Module-based extension contract.
- Backward-compatible upgrades by default.

## UI-first operation mode

Start once:
- `npm run baseline:ui -- --target <target-path>`

Then operate fully from the web UI at `http://127.0.0.1:4173` (or configured host/port) with no further CLI commands required.

### UI API contract

- `GET /api/session` - current target/profile and target path status.
- `POST /api/session` - switch target/profile for all subsequent operations.
- `GET /api/operations` - operation catalog for UI rendering.
- `GET /api/state` - full runtime state (schema, metadata, config, effective config, capabilities, insights).
- `POST /api/refresh-capabilities` - force capability re-probe and return fresh state.
- `POST /api/init` - initialize baseline for current session target.
- `POST /api/diff` - preview managed-file changes.
- `POST /api/doctor` - configuration/capability diagnostics.
- `POST /api/verify` - combined integrity checks.
- `POST /api/config` - save normalized config from UI.
- `POST /api/upgrade` - run managed migrations/upgrades.
- `POST /api/apply` - apply managed changes (PR-first unless direct).
