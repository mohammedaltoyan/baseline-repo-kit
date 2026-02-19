'use strict';

function yamlList(values, indent) {
  const prefix = ' '.repeat(indent || 0);
  return (Array.isArray(values) ? values : [])
    .map((value) => `${prefix}- ${String(value || '')}`)
    .join('\n');
}

function yamlMap(values, indent) {
  const prefix = ' '.repeat(indent || 0);
  return Object.entries(values || {})
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([key, value]) => `${prefix}${key}: ${String(value)}`)
    .join('\n');
}

function quoteYaml(value) {
  const text = String(value == null ? '' : value);
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function resolveActionRef(config, key, fallback) {
  const refs = config && config.ci && config.ci.action_refs && typeof config.ci.action_refs === 'object'
    ? config.ci.action_refs
    : {};
  const selected = String(refs[key] || '').trim();
  if (selected) return selected;
  return String(fallback || '').trim();
}

function workflowCheckNames() {
  return {
    fast_lane: 'Baseline PR Gate / baseline-fast-lane',
    full_lane: 'Baseline PR Gate / baseline-full-lane',
    deploy: 'Baseline Deploy / baseline-deploy',
  };
}

function generateNodeRunWorkflow(config) {
  const checkoutRef = resolveActionRef(config, 'checkout', 'actions/checkout@v6');
  const setupNodeRef = resolveActionRef(config, 'setup_node', 'actions/setup-node@v6');
  return `name: Baseline Node Run (Reusable)

on:
  workflow_call:
    inputs:
      timeout_minutes:
        type: number
        required: false
        default: 20
      node_version:
        type: string
        required: false
        default: "22"
      run:
        type: string
        required: true

jobs:
  run:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    timeout-minutes: \${{ inputs.timeout_minutes }}
    steps:
      - name: Checkout
        uses: ${checkoutRef}
        with:
          persist-credentials: false

      - name: Setup Node
        uses: ${setupNodeRef}
        with:
          node-version: \${{ inputs.node_version }}
          cache: npm

      - name: Install
        run: npm ci --no-audit --no-fund

      - name: Run
        shell: bash
        run: \${{ inputs.run }}
`;
}

function generatePrGateWorkflow(config) {
  const mode = String(config && config.ci && config.ci.mode || 'two_lane');
  const triggers = config && config.ci && config.ci.full_lane_triggers || {};
  const label = String(triggers.label || 'ci:full');
  const mergeQueue = triggers.merge_queue !== false;
  const manualDispatch = triggers.manual_dispatch !== false;
  const pathTriggers = Array.isArray(triggers.paths) ? triggers.paths : [];
  const checkoutRef = resolveActionRef(config, 'checkout', 'actions/checkout@v6');
  const setupNodeRef = resolveActionRef(config, 'setup_node', 'actions/setup-node@v6');

  return `name: Baseline PR Gate

on:
  pull_request:
    types: [opened, synchronize, reopened, edited, ready_for_review]
  merge_group:
    types: [checks_requested]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: baseline-pr-gate-\${{ github.workflow }}-\${{ github.event.pull_request.number || github.ref || github.run_id }}
  cancel-in-progress: true

jobs:
  classify:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    outputs:
      run_full: \${{ steps.mode.outputs.run_full }}
      reasons: \${{ steps.mode.outputs.reasons }}
    steps:
      - name: Checkout
        uses: ${checkoutRef}
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Resolve lane mode
        id: mode
        env:
          BASELINE_MODE: ${quoteYaml(mode)}
          BASELINE_LABEL: ${quoteYaml(label)}
          BASELINE_MERGE_QUEUE: ${mergeQueue ? '1' : '0'}
          BASELINE_MANUAL_DISPATCH: ${manualDispatch ? '1' : '0'}
          BASELINE_TRIGGER_PATHS: ${quoteYaml(pathTriggers.join(','))}
        run: |
          base_sha=""
          head_sha=""
          labels_json="[]"
          if [ "\${{ github.event_name }}" = "pull_request" ]; then
            base_sha="\${{ github.event.pull_request.base.sha }}"
            head_sha="\${{ github.event.pull_request.head.sha }}"
            labels_json='\${{ toJson(github.event.pull_request.labels.*.name) }}'
          fi
          node scripts/ops/ci/change-classifier.js \
            --event-name "\${{ github.event_name }}" \
            --mode "$BASELINE_MODE" \
            --base-sha "$base_sha" \
            --head-sha "$head_sha" \
            --label "$BASELINE_LABEL" \
            --labels-json "$labels_json" \
            --merge-queue "$BASELINE_MERGE_QUEUE" \
            --manual-dispatch "$BASELINE_MANUAL_DISPATCH" \
            --trigger-paths "$BASELINE_TRIGGER_PATHS" \
            --profiles-file "config/ci/baseline-change-profiles.json" > .baseline-classifier.json
          run_full=$(node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('.baseline-classifier.json','utf8'));process.stdout.write(p.run_full?'1':'0');")
          reasons=$(node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('.baseline-classifier.json','utf8'));process.stdout.write((p.reasons||[]).join(','));")
          echo "run_full=$run_full" >> "$GITHUB_OUTPUT"
          echo "reasons=$reasons" >> "$GITHUB_OUTPUT"
      - name: Classifier summary
        run: cat .baseline-classifier.json

  fast_lane:
    name: baseline-fast-lane
    needs: [classify]
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Checkout
        uses: ${checkoutRef}
        with:
          persist-credentials: false
      - name: Setup Node
        uses: ${setupNodeRef}
        with:
          node-version: "22"
          cache: npm
      - name: Install
        run: npm ci --no-audit --no-fund
      - name: Fast checks
        run: npm test

  full_lane:
    name: baseline-full-lane
    needs: [classify]
    if: \${{ needs.classify.outputs.run_full == '1' }}
    uses: ./.github/workflows/baseline-node-run.yml
    with:
      run: npm run plans:verify
`;
}

function generateDeployWorkflow(config) {
  const deployments = config && config.deployments || {};
  const environments = Array.isArray(deployments.environments) ? deployments.environments : [];
  const options = environments.map((env) => String(env && env.name || '').trim()).filter(Boolean);
  const checkoutRef = resolveActionRef(config, 'checkout', 'actions/checkout@v6');
  const oidc = deployments.oidc && typeof deployments.oidc === 'object' ? deployments.oidc : {};
  const oidcEnabled = !!oidc.enabled;
  const audience = String(oidc.audience || '').trim();
  const workflowPermissions = {
    contents: 'read',
    ...(oidcEnabled ? { 'id-token': 'write' } : {}),
  };
  const deployJobPermissions = {
    contents: 'read',
    ...(oidcEnabled ? { 'id-token': 'write' } : {}),
  };

  return `name: Baseline Deploy

on:
  workflow_dispatch:
    inputs:
      environment:
        description: Target environment
        required: true
        type: choice
        options:
${yamlList(options, 10)}
      component:
        description: Deployment component
        required: true
        type: string

permissions:
${yamlMap(workflowPermissions, 2)}

jobs:
  deploy:
    name: baseline-deploy
    runs-on: ubuntu-latest
    permissions:
${yamlMap(deployJobPermissions, 6)}
    environment: \${{ github.event.inputs.environment }}
    concurrency:
      group: baseline-deploy-\${{ github.event.inputs.environment }}-\${{ github.event.inputs.component }}
      cancel-in-progress: false
    timeout-minutes: 30
    steps:
      - name: Checkout
        uses: ${checkoutRef}
        with:
          persist-credentials: false
${oidcEnabled ? `      - name: OIDC token check
        run: |
          echo "OIDC enabled for deployment flow"
          echo "audience=${audience || 'default'}"` : ''}
      - name: Validate deployment approval matrix
        run: |
          node - <<'NODE'
          const fs = require('fs');
          const env = process.env.GITHUB_EVENT_INPUTS_ENVIRONMENT || '';
          const component = process.env.GITHUB_EVENT_INPUTS_COMPONENT || '';
          const data = JSON.parse(fs.readFileSync('config/policy/baseline-deployment-approval-matrix.json', 'utf8'));
          const rows = Array.isArray(data.approval_matrix) ? data.approval_matrix : [];
          const row = rows.find((entry) => String(entry.environment) === env && String(entry.component) === component);
          if (!row) {
            console.error(\`No deployment matrix entry found for environment="\${env}" component="\${component}"\`);
            process.exit(1);
          }
          console.log(JSON.stringify({ env, component, rule: row }, null, 2));
          NODE
        env:
          GITHUB_EVENT_INPUTS_ENVIRONMENT: \${{ github.event.inputs.environment }}
          GITHUB_EVENT_INPUTS_COMPONENT: \${{ github.event.inputs.component }}
      - name: Show deployment selection
        run: |
          echo "environment=\${{ github.event.inputs.environment }}"
          echo "component=\${{ github.event.inputs.component }}"
          echo "Implement project-specific deploy hook in scripts/deploy/deploy.sh"
`;
}

function generateChangeClassifierScript() {
  return `'use strict';

const { execSync } = require('child_process');
const fs = require('fs');

function parseArgs(argv) {
  const args = {};
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i += 1) {
    const raw = String(list[i] || '').trim();
    if (!raw.startsWith('--')) continue;
    const key = raw.slice(2);
    const next = String(list[i + 1] || '').trim();
    if (!next || next.startsWith('--')) {
      args[key] = '1';
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function toBool(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function readProfiles(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed && parsed.profiles) ? parsed.profiles : [];
  } catch {
    return [];
  }
}

function gitChangedFiles(baseSha, headSha) {
  const base = String(baseSha || '').trim();
  const head = String(headSha || '').trim();
  if (!base || !head) return [];
  try {
    const out = execSync(\`git diff --name-only \${base}...\${head}\`, { encoding: 'utf8' });
    return String(out || '')
      .split(/\\r?\\n/)
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseRegexes(values) {
  const out = [];
  for (const raw of (Array.isArray(values) ? values : [])) {
    const pattern = String(raw || '').trim();
    if (!pattern) continue;
    try { out.push(new RegExp(pattern)); } catch {}
  }
  return out;
}

function matchesAny(value, regexes) {
  for (const re of (Array.isArray(regexes) ? regexes : [])) {
    if (re.test(value)) return true;
  }
  return false;
}

function classifyProfiles(files, profiles) {
  const matched = [];
  let risky = false;
  for (const profile of (Array.isArray(profiles) ? profiles : [])) {
    const id = String(profile && profile.id || '').trim();
    if (!id) continue;
    const includeRe = parseRegexes(profile.include_re);
    const excludeRe = parseRegexes(profile.exclude_re);
    const hit = files.some((file) => matchesAny(file, includeRe) && !matchesAny(file, excludeRe));
    if (!hit) continue;
    const skipFullLane = !!(profile && profile.skip_full_lane);
    matched.push({
      id,
      skip_full_lane: skipFullLane,
    });
    if (!skipFullLane) risky = true;
  }
  return { matched, risky };
}

function labelsContain(labelsJson, expected) {
  const needle = String(expected || '').trim().toLowerCase();
  if (!needle) return false;
  try {
    const labels = JSON.parse(String(labelsJson || '[]'));
    return (Array.isArray(labels) ? labels : []).some((item) => String(item || '').trim().toLowerCase() === needle);
  } catch {
    return false;
  }
}

function hasPathTrigger(files, rawPaths) {
  const parts = String(rawPaths || '')
    .split(',')
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (!parts.length) return false;
  return files.some((file) => parts.some((prefix) => file.startsWith(prefix)));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = String(args.mode || 'two_lane').trim();
  const eventName = String(args['event-name'] || '').trim();
  const mergeQueueEnabled = toBool(args['merge-queue']);
  const manualDispatchEnabled = toBool(args['manual-dispatch']);
  const runFullReasons = [];

  if (mode === 'full') {
    runFullReasons.push('ci_mode_full');
  }

  if (eventName === 'merge_group' && mergeQueueEnabled) {
    runFullReasons.push('merge_queue_event');
  }

  if (eventName === 'workflow_dispatch' && manualDispatchEnabled) {
    runFullReasons.push('manual_dispatch_policy');
  }

  if (eventName === 'pull_request' && labelsContain(args['labels-json'], args.label)) {
    runFullReasons.push('explicit_full_label');
  }

  const changedFiles = eventName === 'pull_request'
    ? gitChangedFiles(args['base-sha'], args['head-sha'])
    : [];
  const profiles = readProfiles(args['profiles-file']);
  const profileResult = classifyProfiles(changedFiles, profiles);

  if (hasPathTrigger(changedFiles, args['trigger-paths'])) {
    runFullReasons.push('path_trigger');
  }
  if (profileResult.risky) {
    runFullReasons.push('risky_change_profile');
  }

  const runFull = mode !== 'lightweight' && runFullReasons.length > 0;
  const payload = {
    run_full: runFull,
    reasons: runFullReasons,
    changed_files: changedFiles,
    matched_profiles: profileResult.matched,
  };

  process.stdout.write(\`\${JSON.stringify(payload, null, 2)}\\n\`);
}

main();
`;
}

module.exports = {
  generateChangeClassifierScript,
  generateDeployWorkflow,
  generateNodeRunWorkflow,
  generatePrGateWorkflow,
  workflowCheckNames,
};
