#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const { normalizeComponent } = require('./deploy-surface-registry');

function toString(value) {
  return String(value == null ? '' : value).trim();
}

function isEnabled(value) {
  const v = toString(value).toLowerCase();
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(v);
}

function parseArgs(argv) {
  const out = {
    environment: '',
    component: 'application',
    promotionSource: 'direct',
  };
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i++) {
    const token = toString(list[i]);
    if (!token.startsWith('--')) continue;
    const key = token.replace(/^--/, '');
    const value = toString(list[i + 1]);
    if (key === 'environment') {
      out.environment = value;
      i += 1;
      continue;
    }
    if (key === 'component') {
      out.component = value;
      i += 1;
      continue;
    }
    if (key === 'promotion-source') {
      out.promotionSource = value;
      i += 1;
    }
  }
  return out;
}

function fail(message) {
  console.error(`[deploy-guard] ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`[deploy-guard] ${message}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const environment = toString(args.environment).toLowerCase();
  if (!environment) fail('Missing --environment (expected staging or production).');
  if (!['staging', 'production'].includes(environment)) {
    fail(`Unsupported environment "${environment}" (expected staging|production).`);
  }

  const component = normalizeComponent(args.component);
  if (!component) {
    fail(`Invalid --component "${toString(args.component)}" (expected a safe token like "application", "docs").`);
  }
  const promotionSource = toString(args.promotionSource).toLowerCase();

  if (environment === 'staging' && !isEnabled(process.env.STAGING_DEPLOY_GUARD)) {
    fail('STAGING_DEPLOY_GUARD is not enabled. Refusing staging deployment.');
  }

  if (environment === 'staging') {
    if (isEnabled(process.env.STAGING_PROMOTION_REQUIRED) && promotionSource !== 'approved-flow') {
      fail(
        'STAGING_PROMOTION_REQUIRED is enabled. ' +
        'Use the "Promote (Staging)" workflow (or /approve-staging) so deployment is maintainer-approved.'
      );
    }
  }

  if (environment === 'production') {
    if (!isEnabled(process.env.PRODUCTION_DEPLOY_GUARD)) {
      fail('PRODUCTION_DEPLOY_GUARD is not enabled. Refusing production deployment.');
    }
    if (isEnabled(process.env.PRODUCTION_PROMOTION_REQUIRED) && promotionSource !== 'approved-flow') {
      fail(
        'PRODUCTION_PROMOTION_REQUIRED is enabled. ' +
        'Use the "Promote (Production)" workflow (or /approve-prod) so deployment is maintainer-approved.'
      );
    }
  }

  if (component === 'docs' && !isEnabled(process.env.DOCS_PUBLISH_GUARD)) {
    fail('DOCS_PUBLISH_GUARD is not enabled. Refusing docs publish/deploy.');
  }

  if (component === 'api-ingress' && !isEnabled(process.env.API_INGRESS_DEPLOY_GUARD)) {
    fail('API_INGRESS_DEPLOY_GUARD is not enabled. Refusing API ingress deployment.');
  }

  pass(`OK environment=${environment} component=${component} promotion_source=${promotionSource || 'direct'}`);
}

if (require.main === module) {
  main();
}
