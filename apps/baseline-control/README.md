# Baseline Control UI

Web-first configuration console for Baseline Repo Kit v2.2.

## Start

From repo root:

- `npm run baseline:ui`
- Open `http://127.0.0.1:4173`
- Select or clear the target repository path from the UI `Workspace` panel.

## Features

- UI-only operations after startup (no additional CLI commands required).
- Target repository path selection/switching/clearing from UI session controls.
- Operation catalog rendered from engine API (method/path/options + descriptions).
- Schema-driven settings editing.
- Inline explanation per setting (what/why/default/tradeoffs/prerequisites/apply impact).
- Capability-aware status for GitHub features.
- Effective governance summary (maintainer bucket, reviewer thresholds, topology source, matrix health, GitHub App requirement).
- Full lifecycle actions in UI: `init`, `diff`, `doctor`, `verify`, `apply`, `upgrade`, and capability refresh.
