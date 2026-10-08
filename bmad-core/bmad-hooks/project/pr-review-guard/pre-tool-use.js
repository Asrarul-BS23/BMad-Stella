'use strict';

// pr-review guard — PreToolUse hook (Edit | MultiEdit | Write | Bash).
// While a PR review is active in this session, blocks anything outside the
// read-only command set defined in bmad-core/tasks/review-pr.md. Runs in every
// permission mode, so it holds even when prompts are auto-approved.
//
// Exit 0 = allow. Exit 2 = block; stderr is shown to the agent as the reason.
// Fail-open by design: any internal error allows the call and logs it — a
// broken hook must never lock a developer out of their own project.

const fs = require('node:fs');
const path = require('node:path');

if (process.env.BMAD_HOOK_SUBPROCESS === '1') process.exit(0);

let decide, ALLOWED_SUMMARY, reviewState, cleanupScratch;
try {
  ({ decide, ALLOWED_SUMMARY } = require('./lib/policy'));
  ({ reviewState, cleanupScratch } = require('./lib/review-state'));
} catch {
  process.exit(0); // cannot even load — fail open
}

function findBmadRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.bmad-core', 'core-config.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function log(root, message, data) {
  try {
    const dir = path.join(root, 'bmad-docs', 'bmad-logs');
    fs.mkdirSync(dir, { recursive: true });
    const suffix = data === undefined ? '' : ' ' + JSON.stringify(data);
    fs.appendFileSync(
      path.join(dir, '.hook-debug.log'),
      `${new Date().toISOString()} [pr-guard] ${message}${suffix}\n`,
    );
  } catch {
    /* logging never throws */
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

  const detail = toolName === 'Bash' ? toolInput.command : toolInput.file_path || '';
  log(root, `blocked ${toolName}`, {
    reason: verdict.reason,
    detail: String(detail).slice(0, 200),
  });
  process.stderr.write(
    `pr-review is READ-ONLY — ${verdict.reason}.\n` +
      `Allowed shell commands: ${ALLOWED_SUMMARY}. ` +
      `Write only to bmad-docs/reviewer/ (findings) or bmad-docs/reviewer/.scratch/ (pure verification scripts). No Edit/MultiEdit.\n`,
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
