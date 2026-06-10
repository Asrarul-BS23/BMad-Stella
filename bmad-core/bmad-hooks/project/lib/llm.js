'use strict';

const { spawn } = require('node:child_process');
const { log } = require('./state');

const MAX_RETRIES = 3;
const TIMEOUT_MS = 60_000;

async function callClaude(prompt) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await _spawnClaude(prompt);
    if (result !== null) return result;
    lastError = 'spawn returned null';
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  log('llm: all retries failed', { error: lastError });
  return null;
}

function _spawnClaude(prompt) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn('claude', ['--print', '--output-format', 'text'], {
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
    }, TIMEOUT_MS);

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

module.exports = { callClaude };
