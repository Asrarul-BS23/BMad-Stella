'use strict';

// UserPromptExpansion hook — fires when user types a slash command.
// Injects domain map + active constraints + module memory for Planner/Dev/quick-dev commands.
// Once-per-session rule enforced via .state/.injection-state.json.

const path = require('node:path');
const fs = require('node:fs');
const { readState, writeState, getStatePath } = require('./lib/state');
const { assembleContext } = require('./lib/memory-reader');
const { parsePlanFile } = require('./lib/plan-parser');

// Commands that trigger module memory injection
const MEMORY_COMMANDS = [
  'bmadplanner',
  'bmaddev',
  'quick-dev',
  'quickdev',
  'bmadfullstackdev',
  'bmadbackenddev',
  'bmadfrontenddev',
];

function isMemoryCommand(commandName) {
  if (!commandName) return false;
  const lower = commandName.toLowerCase().replace(/^\//, '');
  return MEMORY_COMMANDS.some((cmd) => lower.includes(cmd));
}

function findActivePlanModuleTag(cwd) {
  try {
    const implPlanDir = path.join(cwd, 'bmad-docs', 'impl-plan');
    if (!fs.existsSync(implPlanDir)) return null;

    const files = fs
      .readdirSync(implPlanDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(implPlanDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const file of files) {
      const parsed = parsePlanFile(path.join(implPlanDir, file.name));
      if (parsed && parsed.status && parsed.status.toLowerCase().includes('in progress')) {
        return parsed.moduleTag;
      }
    }
    return null;
  } catch {
    return null;
  }
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

    if (!cwd || !session_id) process.exit(0);

    // Guard: only run in BMad projects
    const memoryDir = path.join(cwd, 'bmad-docs', 'memory');
    if (!fs.existsSync(memoryDir)) process.exit(0);

    if (!isMemoryCommand(command_name)) process.exit(0);

    // Once-per-session rule
    const stateFile = getStatePath(cwd, '.injection-state.json');
    const injectionState = readState(stateFile, {});

    if (injectionState[session_id]?.domain_injected) {
      // Already injected this session
      process.exit(0);
    }

    const moduleTag = findActivePlanModuleTag(cwd);
    const context = assembleContext(memoryDir, moduleTag);

    if (context.trim()) {
      const output = {
        hookSpecificOutput: {
          additionalContext: `# BMad Project Memory\n\n${context}`,
        },
      };
      process.stdout.write(JSON.stringify(output));
    }

    // Update injection state
    injectionState[session_id] = {
      domain_injected: true,
      injected_modules: moduleTag ? [moduleTag] : [],
      timestamp: new Date().toISOString(),
    };
    writeState(stateFile, injectionState);
  } catch {
    // Never crash Claude
  }
  process.exit(0);
});
