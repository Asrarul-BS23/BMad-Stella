'use strict';

// Standalone pattern scanner — invoked from memory-setup.js at install time.
// Scans codebase, LLM identifies reusable folders, writes initial patterns.md.
// Usage: node pattern-scanner.js <cwd>

const path = require('node:path');
const fs = require('node:fs');
const { log } = require('./lib/state');
const { callClaude } = require('./lib/llm');
const { writeInitialPatterns } = require('./lib/pattern-writer');
const { updateMemoryIndex } = require('./lib/memory-index');
const { buildScanPatternsPrompt } = require('./prompts/scan-patterns');

const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  'out',
  'bin',
  'obj',
  '.vs',
  '__pycache__',
  '.cache',
  '.bmad-core',
  'bmad-docs',
  '.claude',
]);

function buildShallowTree(dir, prefix = '', depth = 0) {
  if (depth > 2) return '';
  try {
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && !IGNORE_DIRS.has(e.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    const lines = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const isLast = i === entries.length - 1;
      lines.push(`${prefix}${isLast ? '└── ' : '├── '}${e.name}`);
      if (e.isDirectory()) {
        const sub = buildShallowTree(
          path.join(dir, e.name),
          prefix + (isLast ? '    ' : '│   '),
          depth + 1,
        );
        if (sub) lines.push(sub);
      }
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

async function run() {
  const cwd = process.argv[2];
  if (!cwd) {
    process.stderr.write('Usage: node pattern-scanner.js <cwd>\n');
    process.exit(1);
  }

  log('pattern-scanner: starting', { cwd });

  const projectTree = buildShallowTree(cwd);
  if (!projectTree) {
    log('pattern-scanner: empty project tree, skipping');
    process.stdout.write('no folders identified\n');
    process.exit(0);
  }

  const prompt = buildScanPatternsPrompt({ projectTree });
  const result = await callClaude(prompt);

  if (!result) {
    log('pattern-scanner: LLM returned null, skipping');
    process.exit(0);
  }

  try {
    const trimmed = result
      .trim()
      .replace(/^```json\s*/, '')
      .replace(/```\s*$/, '');
    const folders = JSON.parse(trimmed);

    if (!Array.isArray(folders) || folders.length === 0) {
      log('pattern-scanner: no reusable folders identified');
      process.stdout.write('no folders identified\n');
      process.exit(0);
    }

    const validFolders = folders.filter(
      (f) => typeof f === 'string' && f.length > 0 && !path.isAbsolute(f),
    );

    const memoryDir = path.join(cwd, 'bmad-docs', 'memory');
    writeInitialPatterns(memoryDir, validFolders, cwd);
    updateMemoryIndex(memoryDir);
    process.stdout.write(`patterns.md written with ${validFolders.length} folders\n`);
  } catch (error) {
    log('pattern-scanner: JSON parse failed', { error: error.message });
  }

  process.exit(0);
}

run().catch((error) => {
  log('pattern-scanner: unhandled error', { error: error.message });
  process.exit(0);
});
