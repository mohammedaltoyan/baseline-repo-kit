'use strict';

function yamlList(values, indent) {
  const prefix = ' '.repeat(indent || 0);
  return (Array.isArray(values) ? values : [])
    .map((value) => `${prefix}- ${String(value || '')}`)
    .join('\n');
}

function generateNodeRunWorkflow() {
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
    timeout-minutes: \${{ inputs.timeout_minutes }}
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Node
        uses: actions/setup-node@v6
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

  return `name: Baseline PR Gate

on:
  pull_request:
    types: [opened, synchronize, reopened, edited, ready_for_review]
  merge_group:
    types: [checks_requested]
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: write

jobs:
  classify:
    runs-on: ubuntu-latest
    outputs:
      run_full: \${{ steps.mode.outputs.run_full }}
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Resolve lane mode
        id: mode
        run: |
          run_full=0
          if [ "${mode}" = "full" ]; then run_full=1; fi
          if [ "${mode}" = "two_lane" ] && [ "${mergeQueue ? '1' : '0'}" = "1" ] && [ "\${{ github.event_name }}" = "merge_group" ]; then run_full=1; fi
          if [ "\${{ github.event_name }}" = "pull_request" ] && echo "\${{ toJson(github.event.pull_request.labels.*.name) }}" | grep -qi "${label}"; then run_full=1; fi
          echo "run_full=$run_full" >> "$GITHUB_OUTPUT"

  fast_lane:
    needs: [classify]
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Setup Node
        uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Install
        run: npm ci --no-audit --no-fund
      - name: Fast checks
        run: npm test

  full_lane:
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
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Show deployment selection
        run: |
          echo "environment=\${{ github.event.inputs.environment }}"
          echo "component=\${{ github.event.inputs.component }}"
          echo "Implement project-specific deploy hook in scripts/deploy/deploy.sh"
`;
}

module.exports = {
  generateDeployWorkflow,
  generateNodeRunWorkflow,
  generatePrGateWorkflow,
};
