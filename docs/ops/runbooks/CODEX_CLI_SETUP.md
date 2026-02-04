Codex CLI Setup (Optional)

Prerequisites
- Either export `OPENAI_API_KEY` or run `codex login` beforehand so the CLI session is cached.
- CLI sessions store tokens under `~/.codex/auth.json`.

Sanity Check
- `codex exec -m gpt-5 -c model_reasoning_effort="high" --skip-git-repo-check "Return 'ok' only"`

Planning system note
- This repo does not use an AI reviewer gate for plans. See `docs/ops/plans/README.md`.

CI Considerations
- Codex CLI is not required for CI gating in this repo.
