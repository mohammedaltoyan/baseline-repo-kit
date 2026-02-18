# Baseline Engine (v2.2)

The baseline engine is the dynamic control plane for setup, policy generation, capability checks, and managed upgrades.

## Commands

- `npm run baseline:init -- --target <target-path>`
- `npm run baseline:ui -- --target <target-path>`
- `npm run baseline:diff -- --target <target-path>`
- `npm run baseline:apply -- --target <target-path>`
- `npm run baseline:upgrade -- --target <target-path>`
- `npm run baseline:doctor -- --target <target-path>`
- `npm run baseline:verify -- --target <target-path>`

## Target state files

- `.baseline/config.yaml` - settings SSOT.
- `.baseline/state.json` - installed version + migration state.
- `.baseline/managed-files.json` - generated file ownership + merge strategy metadata.
- `.baseline/capabilities/github.json` - capability probe snapshot.

## Behavior guarantees

- Settings-driven generation only (no hardcoded per-repo behavior).
- Unsupported capabilities never fail silently.
- Auto-degrade with warnings and remediation guidance.
- New modules are opt-in by default.
- Upgrades are migration-based and backward-compatible by default.

## UI

Run `npm run baseline:ui` and open `http://127.0.0.1:4173`.

The UI surfaces per setting:
- what it controls
- why it matters
- default behavior
- tradeoffs
- prerequisites
- detected support
- apply impact

## Compatibility

Legacy `baseline:install` and `baseline:bootstrap` remain available and can delegate to v2 engine when `--engine-v2` is provided.
