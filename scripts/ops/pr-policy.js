'use strict';

const { extractPlanIds, extractStep } = require('./plans/pr-meta');

function normalizePath(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/');
}

function validatePrPolicy({ prBody, planById, changedFiles, enforcePlanOnlyStep = true, planOnlyPrefix = 'docs/ops/plans/' }) {
  const body = String(prBody || '');
  const planIds = extractPlanIds(body);
  const step = extractStep(body);

  if (planIds.length === 0) {
    throw new Error('Missing `Plan: PLAN-YYYYMM-<slug>` in PR body.');
  }
  if (!step) {
    throw new Error('Missing `Step: Sxx` in PR body.');
  }

  const plans = planById && typeof planById === 'object' ? planById : {};
  const missingPlans = planIds.filter((id) => typeof plans[id] !== 'string' || !plans[id].trim());
  if (missingPlans.length > 0) {
    throw new Error(`Plan file(s) missing or empty: ${missingPlans.join(', ')}`);
  }

  const primaryPlanId = planIds[0];
  const primaryPlan = plans[primaryPlanId];
  const stepRe = new RegExp(`^- \\[(?: |x|X)\\] ${step}\\b`, 'm');
  if (!stepRe.test(primaryPlan)) {
    throw new Error(
      `Plan ${primaryPlanId} is missing checklist item for ${step}. Add \`- [ ] ${step} - ...\` to the plan checklist.`
    );
  }

  if (enforcePlanOnlyStep && step === 'S00') {
    if (!Array.isArray(changedFiles)) {
      throw new Error('Step S00 is plan-only, but changed files were not provided for validation.');
    }
    const nonPlan = changedFiles
      .map(normalizePath)
      .filter(Boolean)
      .filter((p) => !p.startsWith(planOnlyPrefix));

    if (nonPlan.length > 0) {
      const sample = nonPlan.slice(0, 20).join(', ');
      throw new Error(
        `Step S00 is plan-only. Move changes out of S00 or change Step to a phase step. Non-plan files: ${sample}${
          nonPlan.length > 20 ? ` (+${nonPlan.length - 20} more)` : ''
        }`
      );
    }
  }

  return { plan_ids: planIds, primary_plan_id: primaryPlanId, step };
}

module.exports = {
  validatePrPolicy,
};

