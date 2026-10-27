'use strict';

// check-context — verifies the project context after the skill writes it.
// Zero dependencies. Run from the project root:
//   node .claude/skills/stella-project-context/scripts/check-context.js [project-root]
//
// Checks, with no AI involved: context.md exists, line 1 is the provenance line, the
// file holds at most 60 lines, no line instructs (never, always, must, should, don't,
// do not; text inside backticks is ignored), and every backtick path exists in the
// project. Prints `ok` and exits 0, or one `FAIL: ...` line per problem and exits 1.
// Exit 10 means the project root could not be used at all.

const fs = require('node:fs');
const path = require('node:path');

const EXIT_CODES = Object.freeze({ OK: 0, FAIL: 1, USAGE: 10 });
const CONTEXT_DIR = ['_bmad-output', 'stella', 'project-context'];
const CONTEXT_FILE = 'context.md';
const CONTEXT_LABEL = [...CONTEXT_DIR, CONTEXT_FILE].join('/');
const BUDGET = 60;
const PROVENANCE_RE =
  /^<!-- Verified \d{4}-\d{2}-\d{2} against (?:[0-9a-f]{7,40}|none)\. Managed by stella-project-context; refresh re-verifies every line\. -->$/;
// Words that turn a fact into a rule. Facts only: rules belong to the team.
const RULE_WORDS_RE = /\b(?:never|always|must|should|shouldn't|don't|do not)\b/i;

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

/** Line numbers (1-based) whose prose, outside backticks, uses a rule word. */
function ruleLines(text) {
  const hits = [];
  for (const [i, line] of text.split('\n').entries()) {
    if (i === 0) continue; // provenance line
    const prose = line.replaceAll(/`[^`\n]*`/g, '');
    if (RULE_WORDS_RE.test(prose)) hits.push(i + 1);
  }
  return hits;
}

/** Runs every check. Returns { ok, failures }. */
function checkContext(root) {
  const failures = [];
  const file = path.join(root, ...CONTEXT_DIR, CONTEXT_FILE);
  if (!fs.existsSync(file)) {
    failures.push(`${CONTEXT_LABEL} missing`);
    return { ok: false, failures };
  }
  const text = fs.readFileSync(file, 'utf8');
  const firstLine = text.split('\n')[0] ?? '';
  if (!PROVENANCE_RE.test(firstLine.trim())) {
    failures.push(`${CONTEXT_LABEL} line 1 is not the provenance line`);
  }
  const lines = countLines(text);
  if (lines > BUDGET) failures.push(`${CONTEXT_LABEL} has ${lines} lines, budget ${BUDGET}`);
  for (const n of ruleLines(text)) {
    failures.push(`${CONTEXT_LABEL} line ${n} states a rule; write the fact instead`);
  }
  for (const candidate of pathCandidates(text)) {
    if (!fs.existsSync(path.join(root, candidate))) {
      failures.push(`${CONTEXT_LABEL} cites a path that does not exist: ${candidate}`);
    }
  }
  return { ok: failures.length === 0, failures };
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
  ruleLines,
  EXIT_CODES,
  BUDGET,
  CONTEXT_FILE,
  CONTEXT_LABEL,
  PROVENANCE_RE,
};

if (require.main === module) process.exit(main());
