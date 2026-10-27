'use strict';

// check-context — verifies the two project-context files after the skill writes them.
// Zero dependencies. Run from the project root:
//   node .claude/skills/stella-project-context/scripts/check-context.js [project-root]
//
// Checks, with no AI involved: both files exist, line 1 is the provenance line, the
// line budgets hold, at most three `- Unverified:` lines across both files, and every
// backtick path exists in the project.
// Prints `ok` and exits 0, or one `FAIL: ...` line per problem and exits 1.
// Exit 10 means the project root could not be used at all.

const fs = require('node:fs');
const path = require('node:path');

const EXIT_CODES = Object.freeze({ OK: 0, FAIL: 1, USAGE: 10 });
const CONTEXT_DIR = ['_bmad-output', 'stella', 'project-context'];
const CONTEXT_LABEL = CONTEXT_DIR.join('/');
const FILES = Object.freeze({
  'project.md': 60,
  'architecture.md': 90,
});
const MARKED_PREFIX = '- Unverified:';
const MARKED_MAX = 3;
const PROVENANCE_RE =
  /^<!-- Verified \d{4}-\d{2}-\d{2} against (?:[0-9a-f]{7,40}|none)\. Managed by stella-project-context; refresh re-verifies every line\. -->$/;

// A backtick token is treated as a path when it has no whitespace, none of the
// characters that mark code or placeholders, does not start like a flag or URL, and
// either contains a slash or ends in a short file extension.
const PATH_LIKE_RE =
  /^(?:[^\s`{}<>()=$|"']*\/[^\s`{}<>()=$|"']*|[^\s`{}<>()=$|"'/.]*\.[A-Za-z][A-Za-z0-9]{0,5})$/;
const SKIP_RE = /^(?:-|https?:|www\.|@|#)/;

function countLines(text) {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.length;
}

function backtickTokens(text) {
  const tokens = [];
  const re = /`([^`\n]+)`/g;
  let m;
  while ((m = re.exec(text)) !== null) tokens.push(m[1]);
  return tokens;
}

function pathCandidates(text) {
  const seen = new Set();
  for (const raw of backtickTokens(text)) {
    let token = raw.trim();
    if (token.startsWith('./')) token = token.slice(2);
    if (!token || SKIP_RE.test(token)) continue;
    // Globs: check the fixed part before the first wildcard.
    const star = token.indexOf('*');
    if (star !== -1) token = token.slice(0, star);
    if (!PATH_LIKE_RE.test(token)) continue;
    token = token.replace(/\/+$/, '');
    if (token === '' || token === '.') continue;
    seen.add(token);
  }
  return [...seen];
}

function checkFile(root, name, budget, state) {
  const file = path.join(root, ...CONTEXT_DIR, name);
  const label = `${CONTEXT_LABEL}/${name}`;
  if (!fs.existsSync(file)) {
    state.failures.push(`${label} missing`);
    return;
  }
  const text = fs.readFileSync(file, 'utf8');
  const firstLine = text.split('\n')[0] ?? '';
  if (!PROVENANCE_RE.test(firstLine.trim())) {
    state.failures.push(`${label} line 1 is not the provenance line`);
  }
  const lines = countLines(text);
  if (lines > budget) state.failures.push(`${label} has ${lines} lines, budget ${budget}`);
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith(MARKED_PREFIX)) state.marked++;
  }
  for (const candidate of pathCandidates(text)) {
    if (!fs.existsSync(path.join(root, candidate))) {
      state.failures.push(`${label} cites a path that does not exist: ${candidate}`);
    }
  }
}

/** Runs every check. Returns { ok, failures }. */
function checkContext(root) {
  const state = { failures: [], marked: 0 };
  for (const [name, budget] of Object.entries(FILES)) checkFile(root, name, budget, state);
  if (state.marked > MARKED_MAX) {
    state.failures.push(
      `${state.marked} Unverified lines across both files, at most ${MARKED_MAX}`,
    );
  }
  return { ok: state.failures.length === 0, failures: state.failures };
}

function main(argv = process.argv.slice(2), io = console) {
  const root = path.resolve(argv[0] ?? process.cwd());
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    io.log(`FAIL: project root is not a directory: ${root}`);
    return EXIT_CODES.USAGE;
  }
  const result = checkContext(root);
  if (result.ok) {
    io.log('ok');
    return EXIT_CODES.OK;
  }
  for (const failure of result.failures) io.log(`FAIL: ${failure}`);
  return EXIT_CODES.FAIL;
}

module.exports = {
  main,
  checkContext,
  pathCandidates,
  EXIT_CODES,
  FILES,
  MARKED_MAX,
  CONTEXT_LABEL,
  PROVENANCE_RE,
};

if (require.main === module) process.exit(main());
