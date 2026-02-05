# Backend App (Template)

Place your backend/API/worker code here.

Recommended responsibilities:
- API endpoints / service boundaries
- Background jobs and schedulers
- Database migrations (if the backend owns the database)

Enterprise defaults:
- Configuration-driven behavior (avoid hard-coded routing/decisions).
- Clear ownership for schema and data contracts.
- Deterministic local + CI verification (wire suites into `npm test` or a repo `verify` command).

