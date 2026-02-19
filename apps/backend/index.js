'use strict';

const { installSignalHandlers, startBackendServer } = require('./server');

async function main() {
  const runtime = await startBackendServer();
  installSignalHandlers(runtime);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[backend] startup failed: ${String(error && error.stack ? error.stack : error)}\n`);
    process.exit(1);
  });
}

module.exports = { main };
