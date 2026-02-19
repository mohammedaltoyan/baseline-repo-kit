# Frontend App (Generic Runtime)

`apps/frontend` is a production-ready generic web console that consumes backend contract + metadata endpoints.

## Start

- `npm run start:frontend`

The frontend dev server exposes:
- `GET /` (console UI)
- `GET /runtime-config.js` (runtime config injection from env)
- `GET /health`

## Runtime configuration

- `FRONTEND_HOST` (default: `0.0.0.0`)
- `FRONTEND_PORT` (default: `4320`)
- `FRONTEND_BACKEND_BASE_URL` (default: derived from backend port, `http://127.0.0.1:<BACKEND_PORT>`)
- `FRONTEND_CONTRACT_PATH` (default: `/api/v1/contract`)
- `FRONTEND_REQUEST_TIMEOUT_MS` (default: `10000`)

Config parsing/default logic is shared via `packages/shared/app-stack-contract.js`.

## Tests

- `npm run test:frontend`
