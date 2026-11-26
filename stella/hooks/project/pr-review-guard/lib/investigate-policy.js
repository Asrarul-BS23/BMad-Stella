'use strict';

// stella-investigate guard — pure allow / ask / deny policy. No I/O of its own
// (the production lookup is injected), fully unit-testable.
// Mirrors the Guard section of the stella-investigate skill: while an
// investigation is active the agent reads code and evidence, writes only its
// case files and the personal profile, and reaches a database only through the
// db-query helper. It runs no project code: no tests, no builds, no app start.
// The shell is a closed list; nothing switches it open.
// All folder names come from ./paths — nothing is hardcoded here.

const path = require('node:path');
const paths = require('./paths');
const {
  tokenize,
  unquote,
  flagName,
  stripQuoted,
  stripLeadingCd,
  normalizePath,
  SHELL_OPERATOR_RE,
  ISSUE_KEY_RE,
  JIRA_FETCH_HELPER_RE,
} = require('./policy');

const { SEP, INVESTIGATIONS_RE_PART, DB_HELPER_RE_PART, CUSTOM_RE_PART } = paths;

const SHA = '[0-9a-fA-F]{7,40}';
const ARG = String.raw`(?:"[^"]*"|'[^']*'|\S+)`;

// Git is read-only here. `git fetch origin` only updates the remote copies
// (origin/<branch>) and tags: no local branch, no checked-out file changes.
// The form `git fetch origin a:b` can move a local branch, so it never matches.
const ALLOWED_COMMANDS = [
  { name: 'git fetch origin', re: /^git fetch origin(?: --tags)?$/, flags: new Set(['--tags']) },
  {
    name: 'git rev-parse',
    re: /^git rev-parse\s+\S/,
    flags: new Set(['--verify', '--short', '--abbrev-ref', '-q', '--quiet']),
  },
  {
    name: 'git tag --list',
    re: /^git tag (?:-l|--list)(?:\s|$)/,
    flags: new Set(['-l', '--list', '--sort', '-i', '--ignore-case']),
  },
  {
    name: 'git branch -r',
    re: /^git branch (?:-r|--remotes)(?:\s|$)/,
    flags: new Set(['-r', '--remotes', '-l', '--list', '--contains', '--sort', '--format']),
  },
  {
    name: 'git status',
    re: /^git status(?:\s|$)/,
    flags: new Set(['--porcelain', '--short', '-s', '--branch', '-b', '-uno', '--untracked-files']),
  },
  {
    name: 'git ls-tree',
    re: new RegExp(`^git ls-tree(?: -r| --name-only| -d| --full-tree)* ${SHA}(?:\\s|$)`),
    flags: new Set(['-r', '--name-only', '-d', '--full-tree', '--']),
  },
  { name: 'git cat-file -t', re: new RegExp(`^git cat-file -t ${SHA}$`), flags: new Set(['-t']) },
  { name: 'git show {sha}:{path}', re: new RegExp(`^git show ${SHA}:\\S`), flags: new Set() },
  {
    name: 'git grep -n -e',
    // -e stays mandatory; the token after it is a pattern, never an option
    re: /^git grep -n(?: -[iwFE])* -e\s+\S/,
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
    name: 'git diff {a} {b}',
    // two commit ids are mandatory so the working tree is never the subject;
    // --stat / --name-only may come before them or after
    re: new RegExp(`^git diff(?: --stat| --name-only)* ${SHA} ${SHA}(?:\\s|$)`),
    flags: new Set(['--name-only', '--stat', '--']),
  },
  {
    name: 'git log',
    re: /^git log(?:\s|$)/,
    countFlag: true,
    valueFlags: new Set(['-S', '-G']),
    flags: new Set([
      '--oneline',
      '-n',
      '--max-count',
      '--stat',
      '--name-only',
      '--no-pager',
      '--format',
      '--pretty',
      '--date',
      '--since',
      '--until',
      '--author',
      '--follow',
      '--first-parent',
      '--merges',
      '--no-merges',
      '--reverse',
      '--decorate',
      '-S',
      '-G',
      '--',
    ]),
  },
];

const ALLOWED_SUMMARY = `git fetch origin · git rev-parse · git tag --list · git branch -r · git status · git ls-tree {sha} · git cat-file -t · git show {sha}:{path} · git grep -n -e · git log · git diff {a} {b} (each also as git -C <repo> …) · node ${paths.DB_HELPER_LABEL} --env <name> --query|--file · the jira-attachments helper`;

// ---------------------------------------------------------------------------
// Files the investigation may write
// ---------------------------------------------------------------------------

const CASE_FILE_RE = new RegExp(`(^|${SEP})${INVESTIGATIONS_RE_PART}${SEP}[^\\\\/]`);
const PROFILE_FILE_RE = new RegExp(
  `(^|${SEP})${CUSTOM_RE_PART}${SEP}stella-investigate\\.(?:(?:user|profile)\\.toml|secrets\\.env)$`,
);

// A `_bmad` folder inside a case folder would look like a second project: with its own
// copy of the helpers and its own profile. "_bmad." and "_bmad " are the same folder on Windows.
const BMAD_SEGMENT_RE = /(^|\/)_bmad[. ]*(\/|$)/i;

const PROFILE_ASK =
  'stella-investigate wants to change its profile. The profile says which environments are production and how each database is reached. Check the change before you say yes.';

// The absolute form of a path the agent typed. Git Bash writes a drive as /d/…
function toAbsolute(typed, base) {
  let p = normalizePath(unquote(String(typed || '')));
  if (process.platform === 'win32') {
    const drive = /^\/([A-Za-z])(\/.*)?$/.exec(p);
    if (drive) p = `${drive[1]}:${drive[2] || '/'}`;
  }
  return path.resolve(base, p);
}

const samePath = (a, b) => path.relative(a, b) === '';

// True when `inner` is `outer` or a folder below it.
function isInside(outer, inner) {
  const rel = path.relative(outer, inner);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * What kind of writable file this is: 'case', 'profile', 'secrets', or null (not writable).
 * With `ctx.root` the path is resolved first and must be in that project's own folders.
 */
function writeKind(filePath, ctx = {}) {
  let p = normalizePath(filePath);
  if (!p) return null;
  const anchored = Boolean(ctx.root);
  if (anchored) {
    const abs = toAbsolute(p, ctx.cwd || ctx.root);
    if (!isInside(ctx.root, abs) || samePath(ctx.root, abs)) return null;
    p = normalizePath(path.relative(ctx.root, abs));
  }
  if (p.includes('/../') || p.endsWith('/..')) return null;

  const caseFile = CASE_FILE_RE.exec(p);
  if (caseFile) {
    if (anchored && caseFile.index !== 0) return null;
    const below = p.slice(caseFile.index + caseFile[0].length - 1);
    return BMAD_SEGMENT_RE.test(below) ? null : 'case';
  }
  const profileFile = PROFILE_FILE_RE.exec(p);
  if (!profileFile || (anchored && profileFile.index !== 0)) return null;
  return p.endsWith('.env') ? 'secrets' : 'profile';
}

function isWritable(filePath, ctx = {}) {
  return writeKind(filePath, ctx) !== null;
}

// ---------------------------------------------------------------------------
// Helpers the investigation may run
// ---------------------------------------------------------------------------

const DB_HELPER_RE = new RegExp(`(^|${SEP})${DB_HELPER_RE_PART}(?:${SEP}index\\.js|${SEP})?$`);
const ENV_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
// The skill launcher: uv run [--no-cache] <…/render_skill.py> --project-root <p> --skill <p>
const LAUNCHER_RE = new RegExp(
  `^uv run(?: --no-cache)? ("[^"]*render_skill\\.py"|'[^']*render_skill\\.py'|\\S*render_skill\\.py) --project-root ${ARG} --skill ${ARG}$`,
);
// `cd <folder> && …`: the folder the rest of the command runs in
const LEADING_CD_RE = /^cd\s+("[^"]*"|'[^']*'|\S+)\s*&&\s*/;

/**
 * Where a shell command runs. Without `ctx.root` nothing can be resolved (`runDir` is null)
 * and only the shape of a path is checked.
 */
function locate(raw, ctx) {
  if (!ctx.root) return { root: null, runDir: null };
  const base = ctx.cwd || ctx.root;
  const cd = LEADING_CD_RE.exec(raw);
  return { root: ctx.root, runDir: cd ? toAbsolute(cd[1], base) : base };
}

/**
 * `node <db-query helper> --env <name> (--query "<sql>" | --file <path>) [--print]`
 * @returns {null | {allow: boolean, ask?: boolean, grant?: boolean, reason?: string}}
 *   null when the command is not the helper at all.
 */
function checkDbHelper(tokens, isProduction, where = {}) {
  if (tokens[0] !== 'node' || tokens.length < 2) return null;
  if (!DB_HELPER_RE.test(normalizePath(unquote(tokens[1])))) return null;

  // Only the helper of this project runs, and only from inside the project: a copy
  // somewhere else is the agent's own code, and another folder has another profile.
  if (where.root) {
    const typed = toAbsolute(tokens[1], where.runDir);
    const helper = paths.dbHelperDir(where.root);
    const isHelper = samePath(helper, typed) || samePath(path.join(helper, 'index.js'), typed);
    if (!isHelper || !isInside(where.root, where.runDir)) {
      return {
        allow: false,
        reason: `db-query must be the helper of this project (${paths.DB_HELPER_LABEL}), run from inside the project`,
      };
    }
  }

  let env = null;
  let sources = 0;
  let print = false;
  let query = null;
  let file = null;
  for (let i = 2; i < tokens.length; i++) {
    const t = unquote(tokens[i]);
    if (t === '--print') print = true;
    else if (t === '--env' || t === '--query' || t === '--file') {
      const value = tokens[++i];
      if (value === undefined) return { allow: false, reason: `${t} needs a value` };
      if (t === '--env') {
        env = unquote(value);
      } else {
        sources++;
        if (t === '--query') query = unquote(value);
        else file = unquote(value);
      }
    } else {
      return { allow: false, reason: `option '${t}' is not allowed with db-query` };
    }
  }
  if (!env || !ENV_NAME_RE.test(env)) {
    return { allow: false, reason: 'db-query needs --env <environment name>' };
  }
  if (sources !== 1) return { allow: false, reason: 'db-query takes one of --query or --file' };
  // the helper reads the file from the folder it runs in; the prompt must show that file
  if (file && where.runDir) file = toAbsolute(file, where.runDir);

  // --print runs nothing. A production run always goes to the user for a yes.
  if (!print && isProduction(env)) {
    return {
      allow: true,
      ask: true,
      reason: `stella-investigate wants to run a read-only query on "${env}" (production).`,
      // the user must see the query itself, also when it comes from a file
      query,
      file,
    };
  }
  // grant = skip the permission prompt (decision: no yes per query outside production)
  return { allow: true, grant: true };
}

// ---------------------------------------------------------------------------

// `git -C <repo> <command>` reads another repository; the rules see `git <command>`.
function dropGitDir(tokens) {
  if (tokens[0] === 'git' && tokens[1] === '-C' && tokens.length > 3) {
    return ['git', ...tokens.slice(3)];
  }
  return tokens;
}

function checkListed(tokens) {
  const cmd = tokens.join(' ');
  const rule = ALLOWED_COMMANDS.find((r) => r.re.test(cmd));
  if (!rule) return null;

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
    if (rule.countFlag && /^-\d+$/.test(bare)) continue;
    if (!rule.flags.has(flagName(bare))) {
      return { allow: false, reason: `option '${bare}' is not allowed with ${rule.name}` };
    }
  }
  return { allow: true };
}

/**
 * @param {string} rawCommand
 * @param {{isProduction?: (env: string) => boolean}} [ctx]
 */
function checkBash(rawCommand, ctx = {}) {
  const raw = String(rawCommand || '').trim();
  if (!raw) return { allow: false, reason: 'empty command' };
  const isProduction = typeof ctx.isProduction === 'function' ? ctx.isProduction : () => true;

  const cmd = stripLeadingCd(raw);
  if (SHELL_OPERATOR_RE.test(stripQuoted(cmd))) {
    return {
      allow: false,
      reason: 'compound or redirected command (pipes, &&, ;, >, $() are not allowed)',
    };
  }

  const tokens = tokenize(cmd);
  const where = locate(raw, ctx);

  const launcher = LAUNCHER_RE.exec(cmd);
  if (launcher) {
    if (
      where.root &&
      !samePath(paths.launcherFile(where.root), toAbsolute(launcher[1], where.runDir))
    ) {
      return {
        allow: false,
        reason: `the skill launcher must be the one of this project (${paths.LAUNCHER_LABEL})`,
      };
    }
    return { allow: true };
  }

  const db = checkDbHelper(tokens, isProduction, where);
  if (db) return db;

  if (
    tokens[0] === 'node' &&
    tokens.length >= 2 &&
    JIRA_FETCH_HELPER_RE.test(normalizePath(unquote(tokens[1])))
  ) {
    if (tokens.length !== 3 || !ISSUE_KEY_RE.test(unquote(tokens[2]))) {
      return { allow: false, reason: 'jira-attachments takes exactly one issue key, no flags' };
    }
    return { allow: true };
  }

  const listed = checkListed(dropGitDir(tokens));
  if (listed) return listed;

  return { allow: false, reason: `'${cmd.slice(0, 60)}' is not an allowed command` };
}

/**
 * Policy entry point for an active investigation.
 * @param {string} toolName
 * @param {object} toolInput
 * @param {{isProduction?: (env: string) => boolean, root?: string, cwd?: string}} [ctx]
 *   `root` = the project folder, `cwd` = the folder the tool call runs in. With a root,
 *   paths are resolved and must be the ones of this project.
 * @returns {{allow: boolean, ask?: boolean, grant?: boolean, reason?: string}}
 */
function decide(toolName, toolInput, ctx = {}) {
  const input = toolInput || {};
  switch (toolName) {
    case 'NotebookEdit': {
      return {
        allow: false,
        reason: 'NotebookEdit is not allowed — an investigation changes no code',
      };
    }
    case 'Edit':
    case 'MultiEdit':
    case 'Write': {
      const kind = writeKind(input.file_path, ctx);
      if (kind === 'profile') return { allow: true, ask: true, reason: PROFILE_ASK };
      if (kind) return { allow: true };
      return {
        allow: false,
        reason: `${toolName} is allowed only under ${paths.INVESTIGATIONS_LABEL}/ and for the stella-investigate profile in ${paths.CUSTOM_LABEL}/`,
      };
    }
    case 'Bash':
    case 'PowerShell': {
      return checkBash(input.command, ctx);
    }
    // A subagent has its own transcript, so this guard would not see it as part of
    // the investigation. All reading stays in this session.
    case 'Agent':
    case 'Task': {
      return {
        allow: false,
        reason: 'subagents are not allowed — read the code in this session',
      };
    }
    default: {
      return { allow: true };
    }
  }
}

// An environment called prod, production, prd or live (alone or as one part of the
// name, like "prod-eu") is production unless the profile says `production = false`.
// The same rule is in the db-query helper (lib/profile.js); keep the two in step.
const PRODUCTION_NAME_RE = /(^|[^a-z0-9])(?:prod|production|prd|live)([^a-z0-9]|$)/i;

function nameLooksProduction(envName) {
  return PRODUCTION_NAME_RE.test(String(envName || ''));
}

/**
 * True when `envName` is a production environment. Text scan of the TOML: the
 * `production = true|false` line inside `[workflow.environments.<name>]` decides.
 * With no such line the name decides. An environment the profile does not name
 * counts as production, so the user is asked.
 * @param {string} profileText
 */
function profileSaysProduction(profileText, envName) {
  const lines = String(profileText).split(/\r?\n/);
  const header = `[workflow.environments.${envName}]`;
  const quoted = `[workflow.environments."${envName}"]`;
  let inside = false;
  let found = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('[')) {
      const bare = line.replace(/\s*#.*$/, '').replaceAll(' ', '');
      inside = bare === header || bare === quoted;
      if (inside) found = true;
      continue;
    }
    if (!inside) continue;
    const flag = line.match(/^production\s*=\s*(true|false)\b/);
    if (flag) return flag[1] === 'true';
  }
  return found ? nameLooksProduction(envName) : true;
}

module.exports = {
  decide,
  checkBash,
  checkDbHelper,
  isWritable,
  profileSaysProduction,
  nameLooksProduction,
  ALLOWED_SUMMARY,
  ALLOWED_COMMANDS,
};
