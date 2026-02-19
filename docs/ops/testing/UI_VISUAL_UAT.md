# UI Visual UAT and Screenshot Walkthrough

Use this runbook when the frontend UI, frontend-backend integration contract, or runtime settings presentation changes.

## Why

- Preserves a screenshot-driven validation loop for usability and clarity.
- Verifies the explanation-first UI still surfaces effective values and setting intent.
- Validates both happy-path and backend-error behavior before release.

## Command

- Precheck + checklist generation:
  - `npm run test:ui:walkthrough`
- Keep servers alive while you capture screenshots:
  - `npm run test:ui:walkthrough -- --keep-alive`

Default outputs are generated under `tmp/ui-visual-uat/<timestamp>/`:

- `ui-visual-uat.report.json`
- `ui-visual-uat.checklist.md`
- `screenshots/` (store captured images here)

## Required screenshot states

1. Happy path home (`01-happy-home.png`)
2. OpenAPI/API snapshot (`02-openapi-snapshot.png`)
3. Backend error state (`03-backend-error-state.png`)
4. Settings explanation table (`04-settings-table.png`)

## Evidence policy

- Attach the generated checklist/report paths in the active plan step (S99 evidence).
- If a required screenshot cannot be captured, record why and the mitigation explicitly.
