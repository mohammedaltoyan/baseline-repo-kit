# Frontend App (Generic Runtime)

`apps/frontend` is a production-ready generic web console that consumes backend contract + OpenAPI + metadata endpoints.

## Start

- `npm run start:frontend`

The frontend dev server exposes:
- `GET /` (console UI)
- `GET /runtime-config.js` (runtime config injection from env)
- `GET /health`

## Runtime configuration

- `FRONTEND_HOST` (default: `0.0.0.0`)
- `FRONTEND_PORT` (default: `4320`)
- `FRONTEND_BACKEND_BASE_URL` (default: current page origin; override for split-host deployments)
- `FRONTEND_CONTRACT_PATH` (default: `/api/v1/contract`)
- `FRONTEND_REQUEST_TIMEOUT_MS` (default: `10000`)

Config parsing/default logic is shared via `packages/shared/app-stack-contract.js`.

The UI displays live snapshots for:
- Contract (`/api/v1/contract`)
- OpenAPI (`/api/v1/openapi.json`)
- Health (`/api/health`)
- Metadata/settings catalog (`/api/v1/meta`)

## Tests

- `npm run test:frontend`
