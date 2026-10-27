'use strict';

// UserPromptExpansion hook — fires when the user runs a slash command.
// Injects MEMORY.md + domain-map.md verbatim (whichever exists and is non-empty),
// once per session, on `/stella-build` kickoff only. No module-tag resolution, no
// episode/semantic/lessons/constraints — just the two root memory files, as-is.
//
// Replaces the pre-v6 injection hook (which assembled a much larger context for
// Planner/Dev/quick-dev) and the now-unregistered personalization-inject hook
// (source kept at stella/hooks/project/personalization-inject/, no longer wired up).

const fs = require('node:fs');
const path = require('node:path');
const { rootMarker, memoryDir } = require('./lib/paths');
const { readState, writeState, getStatePath } = require('./lib/state');

// Exact match only — not the broader /stella-* prefix personalization-inject used.
const TRIGGER_RE = /^\/?stella-build$/i;

function isTriggerCommand(commandName) {
  return typeof commandName === 'string' && TRIGGER_RE.test(commandName.trim());
}

function readFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

// Returns the hook output object, or null when nothing should be injected.
function decide({ command_name: commandName, session_id: sessionId, cwd }) {
  if (!cwd || !sessionId) return null;
  if (!isTriggerCommand(commandName)) return null;
  if (!fs.existsSync(rootMarker(cwd))) return null;

  const stateFile = getStatePath(cwd, '.memory-injection-state.json');
  const state = readState(stateFile, {});
  if (state[sessionId]?.memory_injected) return null;

  const dir = memoryDir(cwd);
  const memoryIndex = readFile(path.join(dir, 'MEMORY.md'));
  const domainMap = readFile(path.join(dir, 'domain-map.md'));

  const sections = [];
  if (memoryIndex) sections.push(`## Memory Index\n\n${memoryIndex}`);
  if (domainMap) sections.push(`## Domain Map\n\n${domainMap}`);
  if (sections.length === 0) return null;

  state[sessionId] = { memory_injected: true, timestamp: new Date().toISOString() };
  writeState(stateFile, state);

  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptExpansion',
      additionalContext: `# Project Memory\n\n${sections.join('\n\n')}`,
    },
  };
}

module.exports = { decide, isTriggerCommand, TRIGGER_RE };

if (require.main !== module) return;

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(raw);
    const output = decide(data);
    if (output) process.stdout.write(JSON.stringify(output));
  } catch {
    // Never crash Claude
  }
  process.exit(0);
});
