# Tech Stack (Baseline Defaults)

## Runtime
- Language(s): JavaScript (Node.js)
- Runtime(s): Node.js >= 22 (see `.nvmrc`)

## Backend
- Framework: Node.js built-in HTTP server (no vendor lock-in)
- API contract: shared SSOT in `packages/shared/app-stack-contract.js`
- Database (if any): not coupled in baseline (project-owned)
- Storage (if any): not coupled in baseline (project-owned)
- Background jobs (if any): project-owned extension (not hardcoded in baseline)

## Frontend
- Web: static HTML/CSS/JS served by Node.js (`apps/frontend/dev-server.js`)
- API integration: dynamic contract discovery (`/api/v1/contract`) + metadata/settings catalog (`/api/v1/meta`)
- Mobile: not provided in baseline

## CI/CD
- CI provider: GitHub Actions (baseline workflows under `.github/workflows/`)
- Deployment strategy: settings-driven through Baseline Engine modules and generated workflows

## Observability
- Logging: structured JSON logs for backend/frontend runtime servers
- Metrics: not hardcoded; project may layer provider-specific telemetry
- Tracing: not hardcoded; project may layer provider-specific tracing

## Security
- Secrets management: environment variables + untracked env overlays (`config/env/`)
- Access control: least-privilege workflow defaults + capability-aware governance in Baseline Engine
