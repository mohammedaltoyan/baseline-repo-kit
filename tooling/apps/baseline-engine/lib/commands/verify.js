'use strict';

const { runDoctor } = require('./doctor');
const { runDiff } = require('./diff');
const { printOutput } = require('./shared');

async function runVerify(args) {
  const doctor = await runDoctor({ ...args, json: '1', silent: '1' });
  const diff = await runDiff({ ...args, json: '1', silent: '1' });

  const payload = {
    command: 'verify',
    doctor_ok: true,
    pending_changes: diff.change_count,
    conflict_count: diff.conflict_count || 0,
    warning_count: (doctor.warnings || []).length,
  };

  printOutput(payload, args);
  return payload;
}

module.exports = {
  runVerify,
};
