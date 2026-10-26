'use strict';

// UserPromptExpansion hook — fires when the user runs a slash command.
// Injects ~/.claude/personalization.md once per session, but only for Stella's own
// commands (`/stella-*`). Official, unmodified BMad agents (`/bmad-*`) are left
// untouched — BMad v6 is installed unchanged by the official installer (see
// docs/maintaining.md), and personalization is a Stella-specific customization that
// has no business reaching into vanilla upstream skills.
//
// Zero dependencies. State lives in _bmad-output/stella/memory/.state/.injection-state.json.

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PERSONALIZATION_FILE = path.join(os.homedir(), '.claude', 'personalization.md');
const LOG_FILE = path.join(os.homedir(), '.claude', 'bmad-hooks', 'bmad_hooks_debug.log');
const STATE_RELATIVE = ['_bmad-output', 'stella', 'memory', '.state', '.injection-state.json'];

// `/stella-pr-review`, `stella-security` … (case-insensitive). `bmad-*` commands never match.
const TRIGGER_RE = /^\/?stella-/i;

function log(msg, extra) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(
      LOG_FILE,
      JSON.stringify({ ts: new Date().toISOString(), msg, ...extra }) + '\n',
    );
  } catch {
    // never fail the hook over logging
  }
}

function isTriggerCommand(commandName) {
  return typeof commandName === 'string' && TRIGGER_RE.test(commandName.trim());
}

function statePath(cwd) {
  return path.join(cwd, ...STATE_RELATIVE);
}

function readState(file) {
  try {
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, 'utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeState(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (error) {
    log('personalization-inject: state write failed', { error: error.message });
  }
}

function readPersonalization() {
  try {
    return fs.existsSync(PERSONALIZATION_FILE)
      ? fs.readFileSync(PERSONALIZATION_FILE, 'utf8').trim()
      : '';
  } catch {
    return '';
  }
}

// Returns the hook output object, or null when nothing should be injected.
function decide({ command_name: commandName, session_id: sessionId, cwd }) {
  if (!cwd || !sessionId) return null;
  if (!isTriggerCommand(commandName)) return null;
  if (!fs.existsSync(path.join(cwd, '_bmad'))) return null;

  const file = statePath(cwd);
  const state = readState(file);
  if (state[sessionId]?.personalization_injected) return null;

  const personalization = readPersonalization();
  if (!personalization) return null;

  state[sessionId] = { personalization_injected: true, timestamp: new Date().toISOString() };
  writeState(file, state);

  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptExpansion',
      additionalContext: `# Developer Personalization\n\n${personalization}`,
    },
  };
}

module.exports = { decide, isTriggerCommand, statePath, TRIGGER_RE };

if (require.main !== module) return;

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(raw);
    log('personalization-inject: fired', { command_name: data.command_name, cwd: data.cwd });
    const output = decide(data);
    if (output) process.stdout.write(JSON.stringify(output));
  } catch (error) {
    log('personalization-inject: unhandled error', { error: error.message });
  }
  process.exit(0);
});
