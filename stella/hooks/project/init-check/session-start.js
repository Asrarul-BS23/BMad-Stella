'use strict';

// init-check (SessionStart) — the user-level install's session check.
//   - folder not set up, and it is a git repository → one line: run /stella-init
//   - project set up from the machine's master copy, and behind it → refresh _bmad/
//   - anything else → silent
// The logic lives in the app copy `bmad-stella setup` puts under ~/.claude/stella/app/,
// so it always matches the master copy it compares against. No app on this machine
// (setup never ran, or a per-project install only) → exit, do nothing.
// Never blocks a session: every failure is swallowed.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const USER_LEVEL = path.join(
  os.homedir(),
  '.claude',
  'stella',
  'app',
  'tools',
  'installer',
  'lib',
  'user-level.js',
);

function main(rawStdin) {
  // A `claude --print` subprocess started by another hook fires SessionStart too.
  if (process.env.BMAD_HOOK_SUBPROCESS === '1') return;
  if (!fs.existsSync(USER_LEVEL)) return;

  let payload = {};
  try {
    payload = JSON.parse(rawStdin || '{}');
  } catch {
    payload = {};
  }
  const result = require(USER_LEVEL).sessionCheck(payload.cwd || process.cwd(), {
    source: payload.source,
  });
  if (!result) return;
  process.stdout.write(
    JSON.stringify({
      systemMessage: result.message,
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: result.message },
    }),
  );
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  try {
    main(input);
  } catch {
    // never break session start
  }
});
