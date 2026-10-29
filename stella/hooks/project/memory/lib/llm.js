'use strict';

const { spawn } = require('node:child_process');
const { log } = require('./state');

const MODEL = 'claude-sonnet-5'; // headless hook calls don't need the session's default model
const MAX_RETRIES = 3;
const TIMEOUT_MS = 300_000; // 5 min — a tight timeout with a short backoff left no room for transient contention to clear
const RETRY_BACKOFF_MS = 10_000; // 10s, 20s between attempts
const AGENT_TIMEOUT_MS = 600_000; // 10 min — large codebases need room
const AGENT_TOOLS = ['Glob', 'Read', 'Grep'];
// Hard-blocked regardless of settings — these headless/detached calls must never be able to
// touch the filesystem or network themselves; the caller persists the returned text.
// --allowedTools only pre-approves AGENT_TOOLS, it does not hide the rest of the default
// toolset — without this, the model can still attempt Write and hit a permission prompt
// that nobody is present to answer.
const AGENT_DISALLOWED_TOOLS = ['Write', 'Edit', 'NotebookEdit', 'Bash', 'WebFetch', 'WebSearch'];

async function callClaude(prompt) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await _spawnClaude(prompt, { timeoutMs: TIMEOUT_MS });
    if (result !== null) return result;
    lastError = 'spawn returned null';
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * attempt));
    }
  }
  log('llm: all retries failed', { error: lastError });
  return null;
}

// Single-attempt agentic call — allows file exploration tools, generous timeout.
// Used by background processes (distillFromCode) that run detached from the installer.
async function callClaudeAgent(prompt) {
  const result = await _spawnClaude(prompt, {
    timeoutMs: AGENT_TIMEOUT_MS,
    allowedTools: AGENT_TOOLS,
    disallowedTools: AGENT_DISALLOWED_TOOLS,
  });
  if (result === null) log('llm: callClaudeAgent returned null', {});
  return result;
}

function _spawnClaude(
  prompt,
  { timeoutMs = TIMEOUT_MS, allowedTools = null, disallowedTools = null } = {},
) {
  return new Promise((resolve) => {
    const args = ['--print', '--output-format', 'text', '--model', MODEL];
    if (allowedTools) args.push('--allowedTools', allowedTools.join(','));
    if (disallowedTools) args.push('--disallowedTools', disallowedTools.join(','));
    let proc;
    try {
      proc = spawn('claude', args, {
        env: { ...process.env, BMAD_HOOK_SUBPROCESS: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      log('llm: failed to spawn claude', { error: error.message });
      resolve(null);
      return;
    }

    let output = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
      log('llm: claude --print timed out', {});
      resolve(null);
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => {
      output += chunk;
    });

    proc.stdin.on('error', () => {}); // suppress EPIPE if process exits before stdin is consumed
    proc.stdin.write(prompt, 'utf8');
    proc.stdin.end();

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code === 0) {
        resolve(output.trim() || null);
      } else {
        log('llm: claude --print exited with non-zero code', { code });
        resolve(null);
      }
    });

    proc.on('error', (error) => {
      clearTimeout(timer);
      log('llm: spawn error', { error: error.message });
      resolve(null);
    });
  });
}

module.exports = { callClaude, callClaudeAgent };
