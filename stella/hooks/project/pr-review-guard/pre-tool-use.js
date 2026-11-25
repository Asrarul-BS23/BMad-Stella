'use strict';

// pr-review guard — PreToolUse hook (Edit | MultiEdit | Write | NotebookEdit | Bash | PowerShell | Agent | Task).
// While a `stella-pr-review` session is active, blocks anything outside the
// read-only command set the review skill allows. Runs in every permission
// mode, so it holds even when prompts are auto-approved.
//
// Outside a review it does nothing at all — a developer in a normal session
// must never notice it exists (standing rule). Start/end detection lives in
// lib/review-state.js; the allow/deny policy in lib/policy.js.
//
// The same hook guards `stella-investigate` (lib/investigate-policy.js): read-only
// on the code, writes only to its case folder and profile, a database only through
// the db-query helper. A production query is sent to the user for a yes.
//
// Exit 0 = allow. Exit 2 = block; stderr is shown to the agent as the reason.
// Exit 0 with a JSON permission decision on stdout = ask the user, or skip the prompt.
// Fail-open by design: any internal error allows the call and logs it — a
// broken hook must never lock a developer out of their own project.
//
// Kill switch (no uninstall needed): env STELLA_GUARD_OFF=1, or
// _bmad/custom/stella/guard.json with {"enabled": false}.

const fs = require('node:fs');
const path = require('node:path');

if (process.env.BMAD_HOOK_SUBPROCESS === '1') process.exit(0);

let decide, ALLOWED_SUMMARY, reviewState, cleanupScratch, paths, investigate, INVESTIGATE_SKILL;
try {
  paths = require('./lib/paths');
  ({ decide, ALLOWED_SUMMARY } = require('./lib/policy'));
  ({ reviewState, cleanupScratch, INVESTIGATE_SKILL } = require('./lib/review-state'));
  investigate = require('./lib/investigate-policy');
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

// True when the personal profile marks the environment as production. No profile,
// or an environment the profile does not name, counts as production: ask the user.
function isProductionEnv(root, envName) {
  for (const file of paths.profileFiles(root)) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue; // try the next profile file
    }
    return investigate.profileSaysProduction(text, envName);
  }
  return true;
}

function permission(decision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    }) + '\n',
  );
}

const MAX_SHOWN_QUERY = 1500;

// The text of the confirm prompt for a production query: the reason, then the SQL.
// A query given as a file is read here, so the user sees it and not only a path.
function productionPrompt(verdict, cwd) {
  let sql = verdict.query;
  if (!sql && verdict.file) {
    try {
      sql = fs.readFileSync(path.resolve(cwd, verdict.file), 'utf8');
    } catch {
      return `${verdict.reason}\nThe query file could not be read: ${verdict.file}`;
    }
  }
  const text = String(sql || '').trim();
  const shown = text.length > MAX_SHOWN_QUERY ? `${text.slice(0, MAX_SHOWN_QUERY)}\n… (cut)` : text;
  return `${verdict.reason}\nQuery:\n${shown}`;
}

// stella-investigate is active: decide one tool call.
function guardInvestigation(root, toolName, toolInput, cwd) {
  const verdict = investigate.decide(toolName, toolInput, {
    isProduction: (envName) => isProductionEnv(root, envName),
  });
  if (verdict.allow) {
    if (verdict.ask) permission('ask', productionPrompt(verdict, cwd));
    else if (verdict.grant) permission('allow', 'read-only query through the db-query helper');
    return 0;
  }

  const detail =
    toolName === 'Bash' || toolName === 'PowerShell'
      ? toolInput.command
      : toolInput.file_path || '';
  log(root, `blocked ${toolName} (investigate)`, {
    reason: verdict.reason,
    detail: String(detail).slice(0, 200),
  });
  process.stderr.write(
    `Investigation active (stella-investigate): the code is read-only — ${verdict.reason}.\n` +
      `Allowed shell commands: ${investigate.ALLOWED_SUMMARY}.\n` +
      `Write only under ${paths.INVESTIGATIONS_LABEL}/ or to the stella-investigate profile in ${paths.CUSTOM_LABEL}/. ` +
      `No project code is run: write the steps to reproduce for the user instead.\n` +
      `Only the user ends the investigation: by typing *exit or a skill command such as /stella-build.\n`,
  );
  return 2;
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
  if (state.skill === INVESTIGATE_SKILL) {
    return guardInvestigation(root, toolName, toolInput, payload.cwd || root);
  }
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
