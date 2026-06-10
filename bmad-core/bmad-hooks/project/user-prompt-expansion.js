'use strict';

// UserPromptExpansion hook — fires when user types a slash command.
// Injects domain-map.md for Planner/Dev/QA commands, once per session.
// Once-per-session rule enforced via .state/.injection-state.json.

const path = require('node:path');
const fs = require('node:fs');
const { readState, writeState, getStatePath, log } = require('./lib/state');

// Commands that trigger module memory injection
const MEMORY_COMMANDS = new Set([
  'bmad:agents:planner',
  'bmad:agents:dev',
  'bmad:agents:quick-dev',
  'bmad:agents:qa',
]);

function isMemoryCommand(commandName) {
  if (!commandName) return false;
  return MEMORY_COMMANDS.has(commandName.toLowerCase());
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(raw);
    const { command_name, session_id, cwd } = data;

    log('user-prompt-expansion: fired', { command_name, cwd });

    if (!cwd || !session_id) process.exit(0);

    // Guard: only run in BMad projects
    const memoryDir = path.join(cwd, 'bmad-docs', 'memory');
    if (!fs.existsSync(memoryDir)) {
      log('user-prompt-expansion: no memory dir, skipping', { cwd });
      process.exit(0);
    }

    if (!isMemoryCommand(command_name)) {
      log('user-prompt-expansion: not a memory command, skipping', { command_name });
      process.exit(0);
    }

    // Once-per-session rule
    const stateFile = getStatePath(cwd, '.injection-state.json');
    const injectionState = readState(stateFile, {});

    if (injectionState[session_id]?.domain_injected) {
      log('user-prompt-expansion: already injected this session, skipping', { session_id });
      process.exit(0);
    }

    const domainMapPath = path.join(memoryDir, 'domain-map.md');
    const domainMap = fs.existsSync(domainMapPath)
      ? fs.readFileSync(domainMapPath, 'utf8').trim()
      : '';

    if (domainMap) {
      const output = {
        hookSpecificOutput: {
          hookEventName: 'UserPromptExpansion',
          additionalContext: `# Project Domain Map\n\n${domainMap}`,
        },
      };
      process.stdout.write(JSON.stringify(output));
      log('user-prompt-expansion: domain-map injected', { chars: domainMap.length });
    } else {
      log('user-prompt-expansion: domain-map empty or missing, nothing injected');
    }

    // Update injection state
    injectionState[session_id] = {
      domain_injected: true,
      timestamp: new Date().toISOString(),
    };
    writeState(stateFile, injectionState);
  } catch (error) {
    try {
      log('user-prompt-expansion: unhandled error', { error: error.message });
    } catch {
      /* ignore log failure */
    }
  }
  process.exit(0);
});
