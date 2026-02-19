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
- `config/policy/baseline-resolution-log.json` - effective governance/capability decision log emitted from config SSOT (team thresholds, branch-role checks, deployment enforcement mode, capability matrix, GitHub App rationale).

## Schema SSOT Validation

- Runtime config validation is compiled from `config/schema/baseline-config.schema.json`.
- Runtime UI metadata validation is compiled from `config/schema/baseline-ui-metadata.schema.json`.
- Validation is enforced by `baseline doctor`, `baseline verify`, `baseline apply`, and `baseline upgrade` through shared context loading.
- Keep schemas as single contracts; avoid duplicating ad-hoc validation logic in command handlers.

## Locked-Decision Contract Gate

- v2.2 locked decisions are codified in `config/policy/baseline-v22-contract.json`.
- CI enforcement: `npm run lint:contract` (`scripts/ops/baseline-v22-contract-lint.js` + selftest).
- Gate coverage includes:
  - required engine/UI/schema/contract paths
  - required CLI scripts (`baseline:init|ui|diff|apply|upgrade|doctor|verify`)
  - required capability keys and target baseline state files
  - strict defaults (`policy.profile=strict`, `ci.mode=two_lane`, `updates.apply_mode=pr_first`, default envs)
  - module contract completeness (`module.json`, `schema.fragment.json`, `capability_requirements.json`, `generators/index.js`, `migrations/index.js`)
  - non-core modules remain opt-in by default unless an explicit migration enables them

## Module SDK runtime

- Enabled modules are loaded from `tooling/apps/baseline-engine/modules/*`.
- Each module contributes generated artifacts via `generators/index.js`.
- Module capability requirements are evaluated centrally and exposed in `.baseline/capabilities/github.json.runtime`.
- Capability requirement derivation must stay settings-driven: module base requirements are combined with matching rows from `config/policy/effective-settings-rules.json` so feature toggles (for example merge-queue triggers) dynamically add/remove required capabilities without module-local conditionals.
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
- Branching preset modes are normalized from `branching.topology` (`two_branch|three_branch|trunk`); only `custom` topology preserves manual branch graphs.
- Deployment approval rows are normalized from the `{environment x component}` matrix on every load/apply, while preserving explicit per-row overrides.
- Governance insight rows are generated from one SSOT path (`buildInsights`) and reused by doctor output, UI summaries, and resolution log artifacts (no duplicated policy calculators per surface).
- Owner-type and repo-visibility entitlement advisories are generated centrally (for example, merge queue and deployment protection feature expectations) and surfaced as non-blocking guidance alongside runtime API probe results.
- Effective-settings override rules are row-driven in `config/policy/effective-settings-rules.json` (validated by `config/schema/effective-settings-rules.schema.json`); rule conditions use predicate operators (`equals`, `not_equals`, `in`, `not_in`) and runtime evaluation in `lib/policy/effective-settings.js` is reused by module generation, insights, and UI so configured values vs runtime-effective values cannot drift.
- `baseline apply` emits explicit warning rows for each effective override (path + reason + remediation) so auto-degrades are visible in CLI/JSON output and never silent.

## CI/CD generation

- Generated classifier config: `config/ci/baseline-change-profiles.json`.
- Generated classifier runtime: `scripts/ops/ci/change-classifier.js`.
- Generated action reference policy from settings (`ci.action_refs`) to keep workflow actions centrally controlled.
- `full_lane_triggers` in generated classifier config is emitted directly from effective settings (configured + capability overrides), not reconstructed with path-specific logic.
- PR gate workflow uses:
  - fast lane always
  - full lane on risk classifier, merge queue event, explicit label, path triggers, and manual dispatch policy.
- Required check mapping by branch role is generated to `config/policy/baseline-required-checks.json`.
- Workflows are generated with least-privilege permissions and `actions/checkout` credential persistence disabled by default.
- Optional strict action-pinning mode: `security.require_pinned_action_refs=true` causes `doctor` to fail when action refs are not full SHA pins.

## Deploy OIDC mode

- `deployments.oidc.enabled=true` adds OIDC-oriented behavior to deploy workflow generation.
- `deployments.oidc.audience` is passed through settings for provider-specific audience checks.
- When OIDC is enabled, generated deploy workflow must include `id-token: write` in both workflow-level and deploy job-level permissions, because job-level permissions override the workflow defaults in GitHub Actions.
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
- configured value
- effective value
- tradeoffs
- prerequisites
- detected support
- apply impact
- fallback/remediation

UI rendering behavior:
- Settings are rendered from effective config leaf paths (including nested keys).
- Explanations come from `config/schema/baseline-ui-metadata.json` with nearest-parent inheritance when a leaf has no exact metadata key.
- Capability labels for each setting are also resolved from `config/schema/baseline-ui-metadata.json` (`fields.<path>.capability_key`) so capability gating is metadata-driven instead of hardcoded in UI runtime.
- Configured vs effective values are shown per field; capability-driven auto-degrades include explicit reason/remediation (for example merge-queue trigger override when unsupported).
- Effective governance panel renders dynamic reviewer-threshold rows, branch policy coverage, deployment approval enforcement mode, and GitHub App status/reason directly from the same engine insight payload used for policy logs.
- Metadata quality is linted in CI to ensure explanation coverage remains complete as new settings are introduced.

## Compatibility

Legacy `baseline:install` and `baseline:bootstrap` remain available and can delegate to v2 engine when `--engine-v2` is provided.

## References

- [GitHub Rulesets documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [GitHub Merge Queue documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
- [GitHub reusable workflows documentation](https://docs.github.com/en/actions/using-workflows/reusing-workflows)
- [GitHub deployment environments documentation](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [GitHub required reviewers for deployments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#required-reviewers)
- [GitHub custom deployment protection rules](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-protection-rules)
