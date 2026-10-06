'use strict';

// pr-review guard — pure allow/deny policy. No I/O of its own (a reader callback
// is injected for script files), fully unit-testable.
// Mirrors the Guard section of bmad-core/tasks/review-pr.md: while a PR review
// is active, the agent may run ONLY the commands below, may write ONLY the
// findings file or a scratch verification script, and may run a script ONLY if
// it is pure computation. Everything else is blocked before it executes.

// Flags accepted per command. Any other `-x` / `--xyz` token is rejected — this
// is what stops `gh pr diff --web`, `git grep -O<cmd>`, `git log --output=<file>`.
const GH_READ_FLAGS = new Set(['--json', '-q', '--jq', '-t', '--template', '-R', '--repo']);

const ALLOWED_COMMANDS = [
  {
    name: 'gh auth status',
    re: /^gh auth status(?:\s|$)/,
    flags: new Set(['-h', '--hostname', '-a', '--active']),
  },
  {
    name: 'gh pr view',
    re: /^gh pr view\s+\S/,
    flags: new Set([...GH_READ_FLAGS, '-c', '--comments']),
  },
  {
    name: 'gh pr diff',
    re: /^gh pr diff\s+\S/,
    flags: new Set(['--name-only', '--patch', '--color', '-e', '--exclude', '-R', '--repo']),
  },
  {
    name: 'gh pr checks',
    re: /^gh pr checks\s+\S/,
    flags: new Set([...GH_READ_FLAGS, '--required']),
  },
  {
    name: 'git fetch origin pull/N/head',
    re: /^git fetch origin pull\/\d+\/head$/,
    flags: new Set(),
  },
  { name: 'git cat-file -t', re: /^git cat-file -t [0-9a-fA-F]{7,40}$/, flags: new Set(['-t']) },
  { name: 'git show {sha}:{path}', re: /^git show [0-9a-fA-F]{7,40}:\S/, flags: new Set() },
  {
    name: 'git grep -n -e',
    re: /^git grep -n -e\s+\S/,
    // the token after -e is a pattern, never an option — even if it starts with '-'
    valueFlags: new Set(['-e']),
    flags: new Set([
      '-n',
      '-e',
      '-i',
      '-w',
      '-F',
      '-E',
      '--',
      '-l',
      '--name-only',
      '-c',
      '--count',
    ]),
  },
  {
    name: 'git log',
    re: /^git log(?:\s|$)/,
    flags: new Set([
      '--oneline',
      '-n',
      '--max-count',
      '--stat',
      '--no-pager',
      '--format',
      '--pretty',
      '--',
    ]),
  },
];

const ALLOWED_SUMMARY =
  'gh auth status · gh pr view · gh pr diff · gh pr checks · git fetch origin pull/N/head · git cat-file -t · git show {sha}:{path} · git grep -n -e · git log · node|python <bmad-docs/reviewer/.scratch/file> · node -e / python -c "<pure code>"';

// Shell operators that turn one command into several, or redirect output.
// Checked after quoted segments are removed so `-e "List<User>"` is not a false positive.
const SHELL_OPERATOR_RE = /(&&|\|\||;|\||>|<|\$\(|`|\n|\r)/;

function stripQuoted(cmd) {
  return cmd.replaceAll(/"(?:[^"\\]|\\.)*"/g, '""').replaceAll(/'[^']*'/g, "''");
}

// Minimal tokenizer: whitespace-separated, quotes keep their content together.
function tokenize(cmd) {
  const tokens = [];
  const re = /"(?:[^"\\]|\\.)*"|'[^']*'|\S+/g;
  let m;
  while ((m = re.exec(cmd)) !== null) tokens.push(m[0]);
  return tokens;
}

function unquote(token) {
  return token.replaceAll(/^["']|["']$/g, '');
}

function flagName(token) {
  // --json=a,b -> --json ; -n5 -> -n ; -- -> --
  if (token === '--') return '--';
  if (token.startsWith('--')) return token.split('=')[0];
  if (token.startsWith('-') && token.length > 2 && /^-[a-zA-Z]\d+$/.test(token))
    return token.slice(0, 2);
  return token;
}

// ---------------------------------------------------------------------------
// Scratch sandbox: verification scripts (pure computation only)
// ---------------------------------------------------------------------------

const SCRATCH_FILE_RE = /(^|[\\/])bmad-docs[\\/]reviewer[\\/]\.scratch[\\/][^\\/]+$/;
// findings: the markdown report and its JSON sidecar (input for the pr-comments helper)
const FINDINGS_FILE_RE = /(^|[\\/])bmad-docs[\\/]reviewer[\\/][^\\/]+\.(?:md|json)$/;
const FINDINGS_JSON_RE = /(^|[\\/])bmad-docs[\\/]reviewer[\\/][^\\/]+\.json$/;
// the only helper the review may run: posts findings as PR comments (one hard-coded endpoint)
const PR_COMMENTS_HELPER_RE = /(^|[\\/])\.bmad-core[\\/]utils[\\/]pr-comments(?:[\\/]index\.js)?$/;
const PR_COMMENTS_FLAGS = new Set(['--post', '--submit', '--allow-long', '--help', '-h']);

function normalizePath(p) {
  return String(p || '').replaceAll('\\', '/');
}

function isFindingsFile(filePath) {
  return FINDINGS_FILE_RE.test(normalizePath(filePath));
}

function isScratchFile(filePath) {
  const p = normalizePath(filePath);
  return SCRATCH_FILE_RE.test(p) && !p.includes('/../') && !p.endsWith('/..');
}

// Anything that lets a script touch the world — files, processes, network,
// environment, dynamic code — is forbidden. Pure math/date/regex/string/JSON
// work never needs these.
const UNSAFE_SCRIPT_PATTERNS = [
  // JavaScript / Node
  {
    re: /require\s*\(\s*['"](?:node:)?(?:fs|fs\/promises|child_process|http|https|http2|net|os|process|worker_threads|vm|cluster|dgram|tls|readline|repl|module|inspector|v8)['"]/,
    what: 'Node module access (fs, child_process, http, os, …)',
  },
  {
    re: /import\s[^;]*?from\s*['"](?:node:)?(?:fs|fs\/promises|child_process|http|https|http2|net|os|process|worker_threads|vm|cluster|dgram|tls|readline|repl|module|inspector|v8)['"]/,
    what: 'Node module import (fs, child_process, http, os, …)',
  },
  { re: /\bimport\s*\(/, what: 'dynamic import()' },
  { re: /\bfetch\s*\(/, what: 'network call (fetch)' },
  { re: /\b(?:XMLHttpRequest|WebSocket)\b/, what: 'network call' },
  { re: /\beval\s*\(/, what: 'eval()' },
  { re: /\bnew\s+Function\s*\(/, what: 'new Function()' },
  {
    re: /\bprocess\s*\.\s*(?:env|exit|binding|dlopen|chdir|kill|mainModule|_linkedBinding|abort)\b/,
    what: 'process access (env, exit, binding, …)',
  },
  // Python
  {
    re: /^\s*(?:import|from)\s+(?:os|sys|subprocess|socket|urllib|requests|http|shutil|pathlib|io|tempfile|glob|ctypes|importlib|multiprocessing|threading|signal|builtins|pickle|marshal|code|runpy|pty|fcntl|select|asyncio|webbrowser)\b/m,
    what: 'Python module access (os, subprocess, socket, …)',
  },
  { re: /\b__import__\s*\(/, what: '__import__()' },
  { re: /\bopen\s*\(/, what: 'open() — file access' },
  { re: /\bexec\s*\(/, what: 'exec()' },
  { re: /\bcompile\s*\(/, what: 'compile()' },
  { re: /\bgetattr\s*\(\s*(?:__builtins__|builtins)\b/, what: 'builtins access' },
];

/**
 * @param {string} code
 * @returns {string|null} reason when unsafe, null when pure
 */
function unsafeScriptReason(code) {
  const text = String(code || '');
  for (const { re, what } of UNSAFE_SCRIPT_PATTERNS) {
    if (re.test(text)) return `script is not pure computation — ${what}`;
  }
  return null;
}

const SCRIPT_RUNTIMES = new Set(['node', 'python', 'python3', 'py']);
const INLINE_FLAGS = { node: new Set(['-e', '-p', '--eval', '--print']), python: new Set(['-c']) };

/**
 * `node <scratch-file>` | `python <scratch-file>` | `node -e "<code>"` | `python -c "<code>"`
 * Exactly those shapes, nothing extra. Returns null when the command is not a
 * script invocation at all (so the caller can fall through to the main list).
 * @param {string[]} tokens
 * @param {(p: string) => string|null} readScript
 */
function checkScriptRun(tokens, readScript) {
  const runtime = tokens[0];
  if (!SCRIPT_RUNTIMES.has(runtime)) return null;
  const family = runtime === 'node' ? 'node' : 'python';

  // inline: runtime <flag> <code>
  if (tokens.length === 3 && INLINE_FLAGS[family].has(tokens[1])) {
    const code = unquote(tokens[2]);
    const why = unsafeScriptReason(code);
    return why ? { allow: false, reason: why } : { allow: true };
  }

  // file: runtime <scratch path>
  if (tokens.length === 2 && !tokens[1].startsWith('-')) {
    const file = unquote(tokens[1]);
    if (!isScratchFile(file)) {
      return {
        allow: false,
        reason: 'scripts may only be run from bmad-docs/reviewer/.scratch/',
      };
    }
    const code = typeof readScript === 'function' ? readScript(file) : null;
    if (code === null || code === undefined) {
      return { allow: false, reason: `cannot read script ${file}` };
    }
    const why = unsafeScriptReason(code);
    return why ? { allow: false, reason: why } : { allow: true };
  }

  return {
    allow: false,
    reason: `${runtime} is allowed only as '${runtime} <bmad-docs/reviewer/.scratch/file>' or '${runtime} ${family === 'node' ? '-e' : '-c'} "<code>"' with no other arguments`,
  };
}

/**
 * Decide whether a Bash command is allowed during an active PR review.
 * @param {string} rawCommand
 * @param {(p: string) => string|null} [readScript]  returns a scratch file's text, or null
 * @returns {{allow: boolean, reason?: string}}
 */
function checkBash(rawCommand, readScript) {
  const cmd = String(rawCommand || '').trim();
  if (!cmd) return { allow: false, reason: 'empty command' };

  if (SHELL_OPERATOR_RE.test(stripQuoted(cmd))) {
    return {
      allow: false,
      reason: 'compound or redirected command (pipes, &&, ;, >, $() are not allowed)',
    };
  }

  const tokens = tokenize(cmd);

  // `node .bmad-core/utils/pr-comments <bmad-docs/reviewer/x.json> [flags]` — checked before
  // the scratch-script rule, which would otherwise reject a node invocation outside .scratch/.
  if (
    tokens[0] === 'node' &&
    tokens.length >= 3 &&
    PR_COMMENTS_HELPER_RE.test(normalizePath(unquote(tokens[1])))
  ) {
    if (!FINDINGS_JSON_RE.test(normalizePath(unquote(tokens[2])))) {
      return {
        allow: false,
        reason: 'pr-comments takes a findings file under bmad-docs/reviewer/*.json',
      };
    }
    for (const t of tokens.slice(3)) {
      if (!PR_COMMENTS_FLAGS.has(unquote(t))) {
        return { allow: false, reason: `option '${unquote(t)}' is not allowed with pr-comments` };
      }
    }
    return { allow: true };
  }

  const script = checkScriptRun(tokens, readScript);
  if (script) return script;

  const rule = ALLOWED_COMMANDS.find((r) => r.re.test(cmd));
  if (!rule) return { allow: false, reason: `'${cmd.slice(0, 60)}' is not an allowed command` };

  // Every option token must be on the command's known-flag list. The fixed prefix
  // (e.g. "git grep -n -e") is not re-validated, but a value-taking flag inside it
  // (like -e) still marks the next token as a value, not an option.
  const prefixLen = rule.name.split(' ').length;
  const valueFlags = rule.valueFlags || new Set();
  let nextIsValue = false;
  for (const [i, token] of tokens.entries()) {
    const bare = unquote(token);
    if (nextIsValue) {
      nextIsValue = false;
      continue;
    }
    if (valueFlags.has(bare)) nextIsValue = true;
    if (i < prefixLen || !bare.startsWith('-')) continue;
    if (!rule.flags.has(flagName(bare))) {
      return { allow: false, reason: `option '${bare}' is not allowed with ${rule.name}` };
    }
  }
  return { allow: true };
}

/**
 * Policy entry point for an active review.
 * @param {string} toolName
 * @param {object} toolInput
 * @param {{readScript?: (p: string) => string|null}} [deps]
 * @returns {{allow: boolean, reason?: string}}
 */
function decide(toolName, toolInput, deps = {}) {
  const input = toolInput || {};
  switch (toolName) {
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit': {
      return {
        allow: false,
        reason: `${toolName} is not allowed — pr-review never modifies files`,
      };
    }
    case 'Write': {
      if (isFindingsFile(input.file_path)) return { allow: true };
      if (isScratchFile(input.file_path)) {
        const why = unsafeScriptReason(input.content);
        return why ? { allow: false, reason: why } : { allow: true };
      }
      return {
        allow: false,
        reason:
          'Write is allowed only for the findings file under bmad-docs/reviewer/ or a scratch script under bmad-docs/reviewer/.scratch/',
      };
    }
    case 'Bash': {
      return checkBash(input.command, deps.readScript);
    }
    default: {
      return { allow: true };
    }
  }
}

module.exports = {
  decide,
  checkBash,
  isFindingsFile,
  isScratchFile,
  unsafeScriptReason,
  ALLOWED_SUMMARY,
  ALLOWED_COMMANDS,
};
