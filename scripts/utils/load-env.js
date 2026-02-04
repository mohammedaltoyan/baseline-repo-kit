const fs = require('fs');
const path = require('path');
const dns = require('dns');
const dotenv = require('dotenv');
const { isTruthy } = require('./is-truthy');

function logInfo(message) {
  if (!isTruthy(process.env.LOAD_ENV_VERBOSE)) return;
  // Keep logs opt-in so baseline tests stay quiet by default.
  console.log(message);
}

function preferIpv4First() {
  // CI runners sometimes have unreliable IPv6 egress to external hosts.
  // Prefer IPv4 in CI to reduce transient ENETUNREACH failures.
  if (!isTruthy(process.env.CI) && !isTruthy(process.env.DNS_IPV4FIRST)) return;
  if (typeof dns.setDefaultResultOrder !== 'function') return;
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch {
    // best-effort; keep env loading resilient
  }
}

/**
 * Load environment variables for tests and QA scripts.
 * Order of precedence:
 *   1. Value already in process.env (never overridden)
 *   2. Explicit ENV_FILE path via process.env.ENV_FILE
 *   3. config/env/.env.cloud (optional)
 *   4. config/env/.env.local
 *   5. config/env/.env
 *   6. .env in repo root (optional)
 */
function loadEnv() {
  preferIpv4First();
  const repoRoot = process.cwd();
  const envDir = path.join(repoRoot, 'config', 'env');

  // If an explicit ENV_FILE is provided, make it authoritative and return early.
  // This prevents later files from shadowing the selected overlay.
  let explicitFile = process.env.ENV_FILE;
  if (explicitFile) {
    try {
      explicitFile = explicitFile.trim();
      // Normalize Windows-style separators and relative paths to repoRoot
      explicitFile = explicitFile.replace(/\\/g, '/');
      const resolved = path.isAbsolute(explicitFile)
        ? explicitFile
        : path.join(repoRoot, explicitFile);
      if (fs.existsSync(resolved)) {
        logInfo(`[load-env] Using explicit ENV_FILE=${resolved}`);
        // Precedence rule: values already set in process.env must win.
        // This lets callers override specific keys (e.g. EDGE_REQUIRE_DB_JWT)
        // without editing local secret files.
        dotenv.config({ path: resolved, override: false });
        // By default, an explicit ENV_FILE is authoritative to keep runs
        // hermetic (especially in tests). If you need to merge in defaults
        // (e.g. layer tmp secrets on top of a base env file), set ENV_FILE_APPEND=1.
        if (!isTruthy(process.env.ENV_FILE_APPEND)) {
          return;
        }
      } else {
        console.warn(`[load-env] Explicit ENV_FILE not found at ${resolved}, falling back.`);
      }
    } catch (error) {
      console.warn(`[load-env] Failed to load explicit ENV_FILE=${explicitFile}: ${error.message}`);
      // fall through to default resolution
    }
  }

  // Default resolution order prefers local overlays. First-wins semantics (override:false).
  const candidates = [
    path.join(envDir, '.env.cloud'),
    path.join(envDir, '.env.local'),
    path.join(envDir, '.env'),
    path.join(repoRoot, '.env')
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        dotenv.config({ path: candidate, override: false });
      }
    } catch (error) {
      console.warn(`[load-env] Failed to process ${candidate}: ${error.message}`);
    }
  }
}

module.exports = {
  loadEnv
};
