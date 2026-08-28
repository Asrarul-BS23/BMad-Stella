'use strict';

// Standalone CLI entry — invoked from memory-setup.js at install time.
// Scans codebase via LLM agent (Glob/Read/Grep), writes patterns.md.
// Usage: node pattern-scanner.js <cwd>

const path = require('node:path');
const { log } = require('./lib/state');
const { updateMemoryIndex } = require('./lib/memory-index');
const { distillPatternsFromCode } = require('./lib/pattern-distiller');

async function run() {
  const cwd = process.argv[2];
  if (!cwd) {
    process.stderr.write('Usage: node pattern-scanner.js <cwd>\n');
    process.exit(1);
  }

  // Self-terminating guard for detached background runs — prevents zombie on any hang
  const killTimer = setTimeout(
    () => {
      log('pattern-scanner: exceeded max runtime (10 min), exiting', {});
      process.exit(1);
    },
    10 * 60 * 1000,
  );
  killTimer.unref();

  log('pattern-scanner: starting', { cwd });

  const updated = await distillPatternsFromCode(cwd);
  if (updated) {
    const memoryDir = path.join(cwd, 'bmad-docs', 'memory');
    updateMemoryIndex(memoryDir, cwd);
    process.stdout.write('patterns.md written\n');
  } else {
    process.stdout.write('patterns.md not written\n');
  }

  process.exit(0);
}

run().catch((error) => {
  log('pattern-scanner: unhandled error', { error: error.message });
  process.exit(0);
});
