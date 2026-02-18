# Tooling Apps

Standalone developer tooling projects live under `tooling/apps/`.

- Each app is self-contained and may include its own `package.json`.
- Do not add `package.json` under `tooling/` outside of `tooling/apps/` (enforced by `npm run lint:structure`).
- `baseline-engine/` is the v2.2 dynamic baseline control plane:
  - module SDK runtime (`module.json`, schema fragments, capability requirements, generators, migrations)
  - capability-aware policy engine with auto-degrade + warnings
  - managed-file strategy engine and migration-based upgrade flow
