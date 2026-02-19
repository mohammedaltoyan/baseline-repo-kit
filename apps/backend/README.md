# Backend App (Generic Runtime)

`apps/backend` is a production-ready generic Node.js API runtime for baseline repos.

## Start

- `npm run start:backend`

The server exposes:
- `GET /api/health`
- `GET /api/v1/contract` (runtime API contract for frontend discovery)
- `GET /api/v1/openapi.json` (OpenAPI 3.1 document generated from shared SSOT)
- `GET /api/v1/meta` (runtime metadata + settings explanations)
- `POST /api/v1/echo`

Error responses follow RFC 9457 (`application/problem+json`) with stable `code` and `request_id` fields.

## Configuration (environment variables)

- `BACKEND_HOST` (default: `0.0.0.0`)
- `BACKEND_PORT` (default: `4310`)
- `BACKEND_SERVICE_NAME` (default: `baseline-backend`)
- `BACKEND_ENVIRONMENT` (default: `development`)
- `BACKEND_API_BASE_PATH` (default: `/api/v1`)
- `BACKEND_PUBLIC_BASE_URL` (default: empty; used for OpenAPI `servers` list)
- `BACKEND_REQUEST_TIMEOUT_MS` (default: `10000`)
- `BACKEND_MAX_BODY_BYTES` (default: `1048576`)
- `BACKEND_KEEP_ALIVE_TIMEOUT_MS` (default: `5000`)
- `BACKEND_CORS_ALLOWED_ORIGINS` (CSV; default: `*`)
- `BACKEND_CORS_ALLOW_CREDENTIALS` (default: `false`)
- `BACKEND_CORS_ALLOWED_METHODS` (CSV; default: `GET,POST,OPTIONS`)
- `BACKEND_CORS_ALLOWED_HEADERS` (CSV; default: `content-type,authorization,x-request-id`)
- `BACKEND_CORS_MAX_AGE_SECONDS` (default: `600`)

All parsing/default logic is shared from `packages/shared/app-stack-contract.js` (single source of truth).

## Tests

- `npm run test:backend`
