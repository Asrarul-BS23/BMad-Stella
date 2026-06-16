'use strict';

const { spawn } = require('node:child_process');
const { log } = require('./state');

const MAX_RETRIES = 3;
const TIMEOUT_MS = 60_000;
const AGENT_TIMEOUT_MS = 600_000; // 10 min — large codebases need room
const AGENT_TOOLS = ['Glob', 'Read', 'Grep'];

async function callClaude(prompt) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await _spawnClaude(prompt, { timeoutMs: TIMEOUT_MS });
    if (result !== null) return result;
    lastError = 'spawn returned null';
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
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
  });
  if (result === null) log('llm: callClaudeAgent returned null', {});
  return result;
}

function _spawnClaude(prompt, { timeoutMs = TIMEOUT_MS, allowedTools = null } = {}) {
  return new Promise((resolve) => {
    const args = ['--print', '--output-format', 'text'];
    if (allowedTools) args.push('--allowedTools', allowedTools.join(','));
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
