'use strict';

const { spawn } = require('node:child_process');

// Friction logger's own claude caller — pattern copied from the memory feature's
// llm.js (NOT imported; self-contained by design), adapted per Task 0 spike:
//   --output-format json, 300s timeout, large stdin prompt, recursion guard env.
// Spike result (real AIL-518 ticket): 17.6s, ~$0.54, clean JSON envelope.

const TIMEOUT_MS = 300_000;
const MAX_RETRIES = 2;

// Model names come from friction.json — only accept plain identifiers so the
// shell:true command string below cannot be injected through the config file.
const MODEL_PATTERN = /^[A-Za-z0-9._-]+$/;

// Returns the model's text output (envelope.result) or null. Never throws.
// `model` comes from config.model; 'default' (or an invalid value) adds no --model flag.
async function callClaude(prompt, log, model) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await _spawnClaude(prompt, log, model);
    if (res !== null) return res;
    if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  log('llm: all retries failed');
  return null;
}

function _spawnClaude(prompt, log, model) {
  return new Promise((resolve) => {
    let proc;
    const modelArg =
      model && model !== 'default' && MODEL_PATTERN.test(model) ? ` --model ${model}` : '';
    try {
      // shell:true because on Windows `claude` is a .cmd shim; args are fixed
      // literals plus a pattern-validated model name, so concatenation is safe here.
      proc = spawn(`claude --print --output-format json${modelArg}`, {
        env: { ...process.env, BMAD_HOOK_SUBPROCESS: '1' }, // recursion guard convention
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: true,
      });
    } catch (error) {
      log('llm: spawn failed', { error: error.message });
      resolve(null);
      return;
    }

    let out = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
      log('llm: timed out', { timeoutMs: TIMEOUT_MS });
      resolve(null);
    }, TIMEOUT_MS);

    proc.stdout.on('data', (chunk) => (out += chunk));
    proc.stdin.on('error', () => {}); // suppress EPIPE
    proc.stdin.write(prompt, 'utf8');
    proc.stdin.end();

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code !== 0) {
        log('llm: non-zero exit', { code });
        resolve(null);
        return;
      }
      // --output-format json wraps the model text in an envelope:
      // { is_error, result: "<model text>", total_cost_usd, ... }
      try {
        const envelope = JSON.parse(out);
        if (envelope.is_error) {
          log('llm: envelope is_error', {});
          resolve(null);
          return;
        }
        log('llm: ok', { costUsd: envelope.total_cost_usd });
        resolve(typeof envelope.result === 'string' ? envelope.result : null);
      } catch (error) {
        log('llm: envelope parse failed', { error: error.message });
        resolve(null);
      }
    });

    proc.on('error', (error) => {
      clearTimeout(timer);
      log('llm: proc error', { error: error.message });
      resolve(null);
    });
  });
}

module.exports = { callClaude };
