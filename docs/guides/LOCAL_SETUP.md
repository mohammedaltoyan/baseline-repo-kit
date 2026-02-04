# Local Setup (Template)

## Prerequisites

- Node.js >= 18
- Git (recommended)

## Environment

1. Copy an env template:
   - `config/env/.env.local.example` -> `config/env/.env.local` (untracked)
2. Set `ENV_FILE` if you want an explicit env file:
   - `ENV_FILE=config/env/.env.local`

## Baseline checks

- `npm install`
- `npm test`

