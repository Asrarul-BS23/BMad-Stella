'use strict';

// UserPromptExpansion hook — fires when user types a slash command.
// Injects domain-map.md + patterns/patterns.md for Planner/Dev/QA commands, once per session.
// Once-per-session rule enforced via .state/.injection-state.json.

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { readState, writeState, getStatePath, log } = require('./lib/state');

// User-level personalization file — lives in ~/.claude/, not in any project
const PERSONALIZATION_FILE = path.join(os.homedir(), '.claude', 'personalization.md');

// Commands that trigger domain-map + patterns injection
const MEMORY_COMMANDS = new Set([
  'bmad:agents:planner',
  'bmad:agents:dev',
  'bmad:agents:quick-dev',
  'bmad:agents:qa',
]);

// Any BMad agent activation triggers personalization injection
const BMAD_AGENT_PREFIX = 'bmad:agents:';

function isMemoryCommand(commandName) {
  if (!commandName) return false;
  return MEMORY_COMMANDS.has(commandName.toLowerCase());
}

function isBmadAgent(commandName) {
  if (!commandName) return false;
  return commandName.toLowerCase().startsWith(BMAD_AGENT_PREFIX);
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

    if (!isBmadAgent(command_name)) {
      log('user-prompt-expansion: not a BMad agent command, skipping', { command_name });
      process.exit(0);
    }

    const stateFile = getStatePath(cwd, '.injection-state.json');
    const injectionState = readState(stateFile, {});
    const sessionState = injectionState[session_id] || {};
    const sections = [];

    // Personalization — any BMad agent, once per session
    if (!sessionState.personalization_injected) {
      const personalization = fs.existsSync(PERSONALIZATION_FILE)
        ? fs.readFileSync(PERSONALIZATION_FILE, 'utf8').trim()
        : '';
      if (personalization) {
        sections.push(`# Developer Personalization\n\n${personalization}`);
        sessionState.personalization_injected = true;
        log('user-prompt-expansion: personalization injected', { chars: personalization.length });
      }
    }

    // Domain-map + patterns + MEMORY.md — specified agents only, once per session, BMad projects only
    const memoryDir = path.join(cwd, 'bmad-docs', 'memory');
    if (
      isMemoryCommand(command_name) &&
      !sessionState.domain_injected &&
      fs.existsSync(memoryDir)
    ) {
      const domainMapPath = path.join(memoryDir, 'domain-map.md');
      const domainMap = fs.existsSync(domainMapPath)
        ? fs.readFileSync(domainMapPath, 'utf8').trim()
        : '';

      const patternsPath = path.join(memoryDir, 'patterns.md');
      const patterns = fs.existsSync(patternsPath)
        ? fs.readFileSync(patternsPath, 'utf8').trim()
        : '';

      const memoryIndexPath = path.join(memoryDir, 'MEMORY.md');
      const memoryIndex = fs.existsSync(memoryIndexPath)
        ? fs.readFileSync(memoryIndexPath, 'utf8').trim()
        : '';

      if (memoryIndex) sections.push(`# Project Memory Index\n\n${memoryIndex}`);
      if (domainMap) sections.push(`# Project Domain Map\n\n${domainMap}`);
      if (patterns) sections.push(`# Reusable Code Index\n\n${patterns}`);

      if (domainMap || patterns || memoryIndex) {
        sessionState.domain_injected = true;
        log('user-prompt-expansion: memory context injected', {
          domainMap: domainMap.length,
          patterns: patterns.length,
          memoryIndex: memoryIndex.length,
        });
      }
    }

    if (sections.length > 0) {
      const output = {
        hookSpecificOutput: {
          hookEventName: 'UserPromptExpansion',
          additionalContext: sections.join('\n\n---\n\n'),
        },
      };
      process.stdout.write(JSON.stringify(output));
    } else {
      log('user-prompt-expansion: nothing to inject this trigger');
    }

    injectionState[session_id] = { ...sessionState, timestamp: new Date().toISOString() };
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
