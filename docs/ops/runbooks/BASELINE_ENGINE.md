# Baseline Engine (v2.2)

The baseline engine is the dynamic control plane for setup, policy generation, capability checks, and managed upgrades.

## Commands

- `npm run baseline:init -- --target <target-path>`
- `npm run baseline:ui -- --target <target-path>`
- `npm run baseline:diff -- --target <target-path>`
- `npm run baseline:apply -- --target <target-path>`
- `npm run baseline:upgrade -- --target <target-path>`
- `npm run baseline:doctor -- --target <target-path>`
- `npm run baseline:verify -- --target <target-path>`

## Target state files

- `.baseline/config.yaml` - settings SSOT.
- `.baseline/state.json` - installed version + migration state.
- `.baseline/managed-files.json` - generated file ownership + merge strategy metadata.
- `.baseline/capabilities/github.json` - capability probe snapshot.
- `.baseline/internal/base-content.json` - baseline merge base for `three_way` strategy.
- `.baseline/snapshots/*.json` - rollback snapshots created before upgrades.

## Module SDK runtime

- Enabled modules are loaded from `tooling/apps/baseline-engine/modules/*`.
- Each module contributes generated artifacts via `generators/index.js`.
- Module capability requirements are evaluated centrally and exposed in `.baseline/capabilities/github.json.runtime`.
- Unsupported module capabilities never fail silently:
  - `degrade_strategy: warn` -> generate degraded outputs + warnings.
  - `degrade_strategy: skip` -> skip module generation.
  - `degrade_strategy: fail` -> block execution.

## Managed-file merge behavior

- `replace`: generated content replaces file content.
- `json_merge`: deep merge where generated values override existing keys.
- `yaml_merge`: deep merge where generated values override existing keys.
- `three_way`: uses `.baseline/internal/base-content.json` as merge base and emits conflict markers when both sides diverge.
- User-owned blocks are preserved across updates when wrapped with:
  - `baseline:user-block <id>:begin`
  - `baseline:user-block <id>:end`

## Capability-aware governance

- Engine probes owner/account type, collaborator-derived maintainer counts, repository permissions, token scopes, and feature endpoints.
- Engine computes `github_app_required` from enabled module capability requirements.
- If `policy.require_github_app=true` and required capabilities are unavailable, `doctor/apply/upgrade` fail fast with remediation warnings.
- Capability requirements are dynamically resolved from settings (for example, `merge_queue` is only required when merge-queue triggers are enabled).

## CI/CD generation

- Generated classifier config: `config/ci/baseline-change-profiles.json`.
- Generated classifier runtime: `scripts/ops/ci/change-classifier.js`.
- Generated action reference policy from settings (`ci.action_refs`) to keep workflow actions centrally controlled.
- PR gate workflow uses:
  - fast lane always
  - full lane on risk classifier, merge queue event, explicit label, path triggers, and manual dispatch policy.
- Required check mapping by branch role is generated to `config/policy/baseline-required-checks.json`.
- Workflows are generated with least-privilege permissions and `actions/checkout` credential persistence disabled by default.
- Optional strict action-pinning mode: `security.require_pinned_action_refs=true` causes `doctor` to fail when action refs are not full SHA pins.

## Deploy OIDC mode

- `deployments.oidc.enabled=true` adds OIDC-oriented behavior to deploy workflow generation.
- `deployments.oidc.audience` is passed through settings for provider-specific audience checks.
- Use OIDC mode for cloud federation and short-lived credentials rather than static long-lived secrets.

## Upgrade flow

- Detect installed version from `.baseline/state.json`.
- Resolve pending migrations from `scripts/tooling/migrations/<semver>/`.
- Create rollback snapshot before migration/apply.
- Recompute module capability model and policy impact.
- Apply idempotently with managed strategies.

## UI

Run `npm run baseline:ui` and open `http://0.0.0.0:4173` (or configured host/port).

The UI surfaces per setting:
- what it controls
- why it matters
- default behavior
- effective value
- tradeoffs
- prerequisites
- detected support
- apply impact
- fallback/remediation

## Compatibility

Legacy `baseline:install` and `baseline:bootstrap` remain available and can delegate to v2 engine when `--engine-v2` is provided.

## References

- [GitHub Rulesets documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [GitHub Merge Queue documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
- [GitHub reusable workflows documentation](https://docs.github.com/en/actions/using-workflows/reusing-workflows)
- [GitHub deployment environments documentation](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
