# Local Setup (Template)

## Prerequisites

- Node.js >= 22 (see `.nvmrc`)
- Git (recommended)

## Environment

1. Copy an env template:
   - `config/env/.env.local.example` -> `config/env/.env.local` (untracked)
2. Set `ENV_FILE` if you want an explicit env file:
   - `ENV_FILE=config/env/.env.local`

## Baseline checks

- `npm install`
- `npm test`
- Optional (deeper): `npm run test:deep` (E2E install + local bootstrap smoke)
- Optional (docs hygiene): `npm run docs:clean`
