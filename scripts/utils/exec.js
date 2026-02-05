#!/usr/bin/env node
const { spawn } = require('child_process');

function isWsl() {
  return process.platform === 'linux' && !!process.env.WSL_DISTRO_NAME;
}

function resolveCmd(cmd) {
  if (process.platform === 'win32') {
    if (cmd === 'npm') return 'npm.cmd';
    if (cmd === 'npx') return 'npx.cmd';
    return cmd;
  }
  // In WSL we delegate npm/npx to Windows via cmd.exe
  if (isWsl() && (cmd === 'npm' || cmd === 'npx')) {
    return 'cmd.exe';
  }
  return cmd;
}

function run(cmd, args = [], opts = {}) {
  const { env = process.env, cwd = process.cwd(), stdio = 'inherit' } = opts;
  return new Promise((resolve, reject) => {
    const attempt = (useShell) => {
      const base = resolveCmd(cmd);
      const finalArgs =
        isWsl() && (cmd === 'npm' || cmd === 'npx')
          ? ['/c', cmd, ...args]
          : args;
      const child = spawn(base, finalArgs, { env, cwd, stdio, shell: useShell || false });
      child.on('error', (err) => {
        console.error(
          `[exec] spawn error cmd=${cmd} args=${JSON.stringify(args)} cwd=${cwd} errno=${(err && err.code) || ''} message=${(err && err.message) || ''} shell=${useShell || false}`
        );
        // On Windows, retry once with shell=true if we hit EINVAL
        if (!useShell && process.platform === 'win32' && err && err.code === 'EINVAL') {
          return attempt(true);
        }
        reject(err);
      });
      child.on('close', (code) => {
        if (code === 0) return resolve({ code });
        const e = new Error(`${cmd} ${args.join(' ')} exited with code ${code}`);
        e.code = code;
        reject(e);
      });
    };
    attempt(false);
  });
}

function runCapture(cmd, args = [], opts = {}) {
  const { env = process.env, cwd = process.cwd(), input = null } = opts;
  return new Promise((resolve, reject) => {
    const attempt = (useShell) => {
      const base = resolveCmd(cmd);
      const finalArgs =
        isWsl() && (cmd === 'npm' || cmd === 'npx')
          ? ['/c', cmd, ...args]
          : args;
      const child = spawn(base, finalArgs, { env, cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: useShell || false });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += String(d); });
      child.stderr.on('data', (d) => { stderr += String(d); });
      if (input != null) child.stdin.write(String(input));
      child.stdin.end();
      child.on('error', (err) => {
        if (!useShell && process.platform === 'win32' && err && err.code === 'EINVAL') {
          return attempt(true);
        }
        reject(err);
      });
      child.on('close', (code) => resolve({ code: code || 0, stdout, stderr }));
    };
    attempt(false);
  });
}

module.exports = { run, runCapture };
