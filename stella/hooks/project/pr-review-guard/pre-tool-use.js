'use strict';

// pr-review guard — PreToolUse hook (Edit | MultiEdit | Write | Bash | PowerShell).
// While a `stella-pr-review` session is active, blocks anything outside the
// read-only command set the review skill allows. Runs in every permission
// mode, so it holds even when prompts are auto-approved.
//
// Outside a review it does nothing at all — a developer in a normal session
// must never notice it exists (standing rule). Start/end detection lives in
// lib/review-state.js; the allow/deny policy in lib/policy.js.
//
// Exit 0 = allow. Exit 2 = block; stderr is shown to the agent as the reason.
// Fail-open by design: any internal error allows the call and logs it — a
// broken hook must never lock a developer out of their own project.
//
// Kill switch (no uninstall needed): env STELLA_GUARD_OFF=1, or
// _bmad/custom/stella/guard.json with {"enabled": false}.

const fs = require('node:fs');
const path = require('node:path');

if (process.env.BMAD_HOOK_SUBPROCESS === '1') process.exit(0);

let decide, ALLOWED_SUMMARY, reviewState, cleanupScratch, paths;
try {
  paths = require('./lib/paths');
  ({ decide, ALLOWED_SUMMARY } = require('./lib/policy'));
  ({ reviewState, cleanupScratch } = require('./lib/review-state'));
} catch {
  process.exit(0); // cannot even load — fail open
}

function findBmadRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(paths.rootMarker(dir))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function log(root, message, data) {
  try {
    const dir = paths.stateDir(root);
    fs.mkdirSync(dir, { recursive: true });
    const suffix = data === undefined ? '' : ' ' + JSON.stringify(data);
    fs.appendFileSync(
      path.join(dir, 'guard-debug.log'),
      `${new Date().toISOString()} [pr-guard] ${message}${suffix}\n`,
    );
  } catch {
    /* logging never throws */
  }
}

// true when the guard is switched off for this machine or project
function isDisabled(root) {
  const env = String(process.env.STELLA_GUARD_OFF || '').toLowerCase();
  if (env === '1' || env === 'true' || env === 'yes') return true;
  try {
    const cfg = JSON.parse(fs.readFileSync(paths.configFile(root), 'utf8'));
    return cfg && cfg.enabled === false;
  } catch {
    return false; // missing or unreadable config = enabled
  }
}

function main(raw) {
  let payload;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    return 0;
  }
  const { session_id: sessionId, transcript_path: transcriptPath, tool_name: toolName } = payload;
  const toolInput = payload.tool_input || {};
  if (!sessionId || !toolName) return 0;

  const root = findBmadRoot(payload.cwd || process.cwd());
  if (!root) return 0;
  if (isDisabled(root)) return 0;

  const state = reviewState(root, sessionId, transcriptPath);
  // Scratch sandbox lives only for the duration of a review.
  if (state.justStarted || state.justEnded) cleanupScratch(root);
  if (!state.active) return 0;

  // Scratch scripts are read relative to the project root when the path is relative.
  const readScript = (p) => {
    try {
      return fs.readFileSync(path.isAbsolute(p) ? p : path.join(root, p), 'utf8');
    } catch {
      return null;
    }
  };

  const verdict = decide(toolName, toolInput, { readScript });
  if (verdict.allow) return 0;

  const detail =
    toolName === 'Bash' || toolName === 'PowerShell'
      ? toolInput.command
      : toolInput.file_path || '';
  log(root, `blocked ${toolName}`, {
    reason: verdict.reason,
    detail: String(detail).slice(0, 200),
  });
  process.stderr.write(
    `PR review active (stella-pr-review): edits are disabled — ${verdict.reason}.\n` +
      `Allowed shell commands: ${ALLOWED_SUMMARY}. ` +
      `Write only to ${paths.REVIEWER_LABEL}/ (findings) or ${paths.SCRATCH_LABEL}/ (pure verification scripts). No Edit/MultiEdit.\n` +
      `To leave the review and edit again, type *exit.\n`,
  );
  return 2;
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (buffer += chunk));
process.stdin.on('end', () => {
  let code = 0;
  try {
    code = main(buffer);
  } catch (error) {
    try {
      const root = findBmadRoot(process.cwd());
      if (root) log(root, 'internal error — allowing', { error: error.message });
    } catch {
      /* ignore */
    }
    code = 0;
  }
  process.exit(code);
});
