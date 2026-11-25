'use strict';

// stella-investigate guard — pure allow / ask / deny policy. No I/O of its own
// (the production lookup is injected), fully unit-testable.
// Mirrors the Guard section of the stella-investigate skill: while an
// investigation is active the agent reads code and evidence, writes only its
// case files and the personal profile, and reaches a database only through the
// db-query helper. After the user types *allow-run, test and repro commands are
// let through, but git changes, direct database clients and file changes stay blocked.
// All folder names come from ./paths — nothing is hardcoded here.

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
    // two commit ids are mandatory so the working tree is never the subject
    re: new RegExp(`^git diff ${SHA} ${SHA}(?:\\s|$)`),
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

function isWritable(filePath) {
  const p = normalizePath(filePath);
  if (p.includes('/../') || p.endsWith('/..')) return false;
  return CASE_FILE_RE.test(p) || PROFILE_FILE_RE.test(p);
}

// ---------------------------------------------------------------------------
// Helpers the investigation may run
// ---------------------------------------------------------------------------

const DB_HELPER_RE = new RegExp(`(^|${SEP})${DB_HELPER_RE_PART}(?:${SEP}index\\.js|${SEP})?$`);
const ENV_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
// The skill launcher: uv run [--no-cache] <…/render_skill.py> --project-root <p> --skill <p>
const LAUNCHER_RE = new RegExp(
  `^uv run(?: --no-cache)? (?:"[^"]*render_skill\\.py"|'[^']*render_skill\\.py'|\\S*render_skill\\.py) --project-root ${ARG} --skill ${ARG}$`,
);

/**
 * `node <db-query helper> --env <name> (--query "<sql>" | --file <path>) [--print]`
 * @returns {null | {allow: boolean, ask?: boolean, grant?: boolean, reason?: string}}
 *   null when the command is not the helper at all.
 */
function checkDbHelper(tokens, isProduction) {
  if (tokens[0] !== 'node' || tokens.length < 2) return null;
  if (!DB_HELPER_RE.test(normalizePath(unquote(tokens[1])))) return null;

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
// After *allow-run: tests and repro commands pass, these never do
// ---------------------------------------------------------------------------

const DB_CLIENT_RE =
  /(^|[\s;&|(])(?:sqlcmd|osql|bcp|sqlpackage|psql|pg_dump|pg_restore|mysql|mysqldump|mongosh|mongo|sqlite3|redis-cli)(?:\.exe)?(?=\s|$)/i;
const FILE_CHANGE_RE =
  /(^|[\s;&|(])(?:rm|rmdir|del|erase|rd|mv|move|ren|rename|tee|Remove-Item|Move-Item|Rename-Item|Set-Content|Add-Content|Clear-Content|Out-File)(?=\s|$)/i;
const SED_IN_PLACE_RE = /(^|[\s;&|(])sed\s+(?:\S+\s+)*-i/;
// `>` or `>>` into a file. `2>&1`, `>/dev/null`, `>$null` and `>NUL` are not file writes.
const REDIRECT_RE = /(^|[^0-9&>])>{1,2}\s*(?!&|\/dev\/null|\$null|nul\b)\S/i;
const GIT_RE = /(^|[\s;&|(])git(?:\.exe)?(?=\s|$)/i;

function runModeDenial(command) {
  const bare = stripQuoted(command);
  if (GIT_RE.test(bare)) return 'git is limited to the read commands, one per call';
  if (DB_CLIENT_RE.test(bare)) return 'a database is reached only through the db-query helper';
  if (FILE_CHANGE_RE.test(bare) || SED_IN_PLACE_RE.test(bare)) {
    return 'commands that delete, move or rewrite files are not allowed';
  }
  if (REDIRECT_RE.test(bare)) return 'writing command output into a file is not allowed';
  return null;
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
 * @param {{allowRun?: boolean, isProduction?: (env: string) => boolean}} [ctx]
 */
function checkBash(rawCommand, ctx = {}) {
  const raw = String(rawCommand || '').trim();
  if (!raw) return { allow: false, reason: 'empty command' };
  const isProduction = typeof ctx.isProduction === 'function' ? ctx.isProduction : () => true;

  const cmd = stripLeadingCd(raw);
  const single = !SHELL_OPERATOR_RE.test(stripQuoted(cmd));
  if (single) {
    const tokens = tokenize(cmd);
    if (LAUNCHER_RE.test(cmd)) return { allow: true };

    const db = checkDbHelper(tokens, isProduction);
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
  }

  if (ctx.allowRun) {
    const why = runModeDenial(cmd);
    return why ? { allow: false, reason: why } : { allow: true };
  }
  if (!single) {
    return {
      allow: false,
      reason: 'compound or redirected command (pipes, &&, ;, >, $() are not allowed)',
    };
  }
  return { allow: false, reason: `'${cmd.slice(0, 60)}' is not an allowed command` };
}

/**
 * Policy entry point for an active investigation.
 * @param {string} toolName
 * @param {object} toolInput
 * @param {{allowRun?: boolean, isProduction?: (env: string) => boolean}} [ctx]
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
      if (isWritable(input.file_path)) return { allow: true };
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
  runModeDenial,
  profileSaysProduction,
  nameLooksProduction,
  ALLOWED_SUMMARY,
  ALLOWED_COMMANDS,
};
