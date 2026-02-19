# Shared Package

Shared cross-app SSOT modules live here.

Current SSOT:
- `app-stack-contract.js` - canonical backend/frontend runtime configuration parsing, API contract shape, OpenAPI 3.1 generation, and settings explanation catalog.

Rules:
- No secrets.
- Keep APIs stable and versioned via changes (no breaking churn).
- Avoid app-specific branching; keep behavior data-driven/config-driven.
