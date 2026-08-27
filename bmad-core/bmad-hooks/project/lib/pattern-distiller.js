'use strict';

// Distills widely-reused code (base classes, wrappers, shared utilities) into
// bmad-docs/memory/patterns.md by having an LLM agent explore the codebase directly
// (Glob/Read/Grep) and verify reuse via reference counts — not guessed by folder name.
// Called by daily-job.js (weekly) and spawned as a detached background process by
// memory-setup.js at install time.
// Usage as standalone: node pattern-scanner.js <cwd>

const path = require('node:path');
const fs = require('node:fs');
const { log } = require('./state');
const { callClaudeAgent } = require('./llm');
const { buildScanPatternsFromCodePrompt } = require('../prompts/scan-patterns');

const TARGET_FILE = path.join('bmad-docs', 'memory', 'patterns.md');

function getTargetPath(cwd) {
  return path.join(cwd, TARGET_FILE);
}

async function distillPatternsFromCode(cwd) {
  const targetPath = getTargetPath(cwd);
  const today = new Date().toISOString().slice(0, 10);

  const prompt = buildScanPatternsFromCodePrompt({ cwd, today });
  const result = await callClaudeAgent(prompt);
  if (!result) {
    log('pattern-distiller: claude returned null, skipping', { cwd });
    return false;
  }

  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const tmp = targetPath + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, result.trim() + '\n', 'utf8');
    fs.renameSync(tmp, targetPath);
    log('pattern-distiller: patterns.md written from codebase scan', {
      cwd,
      chars: result.length,
    });
    return true;
  } catch (error) {
    log('pattern-distiller: failed to write patterns.md', { error: error.message });
    return false;
  }
}

module.exports = { distillPatternsFromCode };
