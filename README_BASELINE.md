# Baseline kit

This repository is a reusable baseline kit extracted from a production codebase and then sanitized for reuse.

Goals:
- Keep process/tooling/docs that are broadly reusable.
- Remove project-specific artifacts (secrets, CI evidence logs, one-off demos).
- Keep changes configurable and avoid hardcoding (see `AGENTS.md`).

Use:
- Copy into a new project repo, then customize names/domains and enable only the subsystems you need.
