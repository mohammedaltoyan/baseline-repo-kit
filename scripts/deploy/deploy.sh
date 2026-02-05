#!/usr/bin/env bash
set -euo pipefail

echo "[deploy] This is a baseline placeholder."
echo "[deploy] Implement project-specific deployment logic in scripts/deploy/deploy.sh."
echo "[deploy] Recommended inputs:"
echo "  - DEPLOY_ENV=staging|production"
echo "  - DEPLOY_COMPONENT=application|docs|api-ingress"
echo "  - DEPLOY_PROMOTION_SOURCE=direct|approved-flow"
echo ""
echo "[deploy] Exiting with failure so misconfigured deployments do not appear successful."
exit 1
