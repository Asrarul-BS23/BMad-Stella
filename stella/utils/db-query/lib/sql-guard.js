'use strict';

// Read-only check for one SQL statement. Pure text rules, no database needed.
// This is a second layer only: the database login must itself be read-only.

// Statements that change data, change the session, run other code, or reach
// outside the database. Matched as whole words on the query after strings and
// comments are removed.
const FORBIDDEN_WORDS = [
  'insert',
  'update',
  'delete',
  'merge',
  'upsert',
  'drop',
  'alter',
  'create',
  'truncate',
  'rename',
  'exec',
  'execute',
  'call',
  'do',
  'grant',
  'revoke',
  'deny',
  'into', // SELECT ... INTO creates a table or writes a file
  'set',
  'use',
  'copy',
  'load',
  'outfile',
  'dumpfile',
  'handler',
  'lock',
  'unlock',
  'backup',
  'restore',
  'shutdown',
  'kill',
  'dbcc',
  'reconfigure',
  'waitfor',
  'openrowset',
  'openquery',
  'opendatasource',
  'bulk',
  'vacuum',
  'analyze',
  'refresh',
  'reindex',
  'cluster',
  'listen',
  'notify',
  'prepare',
  'deallocate',
  'begin',
  'commit',
  'rollback',
  'savepoint',
  'declare',
];

const FORBIDDEN_FUNCTIONS = [
  'pg_sleep',
  'pg_terminate_backend',
  'pg_cancel_backend',
  'pg_read_file',
  'pg_read_binary_file',
  'pg_ls_dir',
  'lo_import',
  'lo_export',
  'dblink',
  'dblink_exec',
  'nextval',
  'setval',
  'sleep',
  'benchmark',
  'get_lock',
  'release_lock',
  'load_file',
];

const FORBIDDEN_RE = new RegExp(String.raw`\b(${FORBIDDEN_WORDS.join('|')})\b`, 'i');
const FUNCTION_RE = new RegExp(String.raw`\b(${FORBIDDEN_FUNCTIONS.join('|')})\s*\(`, 'i');
const PROCEDURE_RE = /\b(?:xp|sp)_\w+/i; // SQL Server system procedures
const SINGLE_QUOTE = "'";
// stands in for a quoted name in the text the word rules read
const QUOTED_NAME = 'quoted_name';
// "*" as a column list: after SELECT (also DISTINCT / ALL / TOP n), after a comma,
// or after "alias.". A "*" between two values is multiplication and is fine.
const STAR_COLUMNS_RE =
  /(?:\bselect\b(?:\s+(?:distinct|all))?(?:\s+top\s*\(?\s*\d+\s*\)?(?:\s+percent)?)?|,|[A-Za-z_]\s*\.)\s*\*/i;

// tsql | postgresql | mysql. Unknown names are read with the SQL Server rules.
function normalizeDialect(name) {
  const n = String(name || '').toLowerCase();
  if (/^(mysql|mariadb)/.test(n)) return 'mysql';
  if (/^(postgres|pg|psql)/.test(n)) return 'postgresql';
  return 'tsql';
}

/**
 * Returns `{text, names}`: the query with comments, string literals and quoted
 * names taken out, so the word rules see only real SQL words, and the list of the
 * quoted names (a column called [Lock] is a name, not the LOCK statement).
 * Returns null when the text cannot be read safely (something is not closed).
 *
 * The rules follow the server, not a guess: a wrong guess here could hide a second
 * statement inside what this code thinks is a string.
 * - "--" starts a comment; on MySQL only when a space or the line end follows.
 * - "#" starts a comment on MySQL only.
 * - Double quotes and backticks are quoted regions everywhere; [..] on SQL Server only.
 * - A backslash is never an escape here (checkReadOnly rejects it on MySQL and PostgreSQL).
 */
function stripLiterals(sql, dialect = 'tsql') {
  const text = String(sql);
  const mysql = dialect === 'mysql';
  let out = '';
  const names = [];
  let i = 0;

  // Index of the closing character, where a doubled one is an escaped one; -1 when open.
  const regionEnd = (start, close) => {
    let j = start;
    while (j < text.length) {
      if (text[j] === close) {
        if (text[j + 1] !== close) return j;
        j += 2;
      } else {
        j++;
      }
    }
    return -1;
  };
  const lineEnd = (from) => {
    const end = text.indexOf('\n', from);
    return end === -1 ? text.length : end;
  };

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    const dashComment =
      ch === '-' && next === '-' && (!mysql || i + 2 >= text.length || /\s/.test(text[i + 2]));
    if (dashComment || (ch === '#' && mysql)) {
      i = lineEnd(i);
      out += ' ';
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) return null;
      i = end + 2;
      out += ' ';
      continue;
    }
    if (ch === SINGLE_QUOTE) {
      const end = regionEnd(i + 1, SINGLE_QUOTE);
      if (end === -1) return null;
      out += SINGLE_QUOTE + SINGLE_QUOTE;
      i = end + 1;
      continue;
    }
    let close = null;
    if (ch === '"' || ch === '`') close = ch;
    else if (ch === '[' && dialect === 'tsql') close = ']';
    if (close) {
      const end = regionEnd(i + 1, close);
      if (end === -1) return null;
      // the name goes to the list; a neutral word takes its place in the text
      names.push(text.slice(i + 1, end));
      out += ' ' + QUOTED_NAME + ' ';
      i = end + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return { text: out, names };
}

function escapeRegExp(text) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * @param {string} sql
 * @param {{production?: boolean, piiColumns?: string[], dialect?: string}} [options]
 * @returns {{ok: true, statement: string} | {ok: false, reason: string}}
 */
function checkReadOnly(sql, options = {}) {
  const raw = String(sql || '').trim();
  if (!raw) return { ok: false, reason: 'the query is empty' };
  const dialect = normalizeDialect(options.dialect);

  // Client commands, not SQL: sqlcmd (":r", "!!", "GO") and psql ("\copy").
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith(':') || t.startsWith('!!') || t.startsWith('\\') || /^go\b/i.test(t)) {
      return { ok: false, reason: `"${t.slice(0, 30)}" is a client command, not a query` };
    }
  }
  if (raw.includes('$(')) return { ok: false, reason: 'sqlcmd variables $(...) are not allowed' };
  // Forms whose end this code cannot find the same way every server does.
  if (/\$\w*\$/.test(raw)) return { ok: false, reason: 'dollar-quoted strings are not allowed' };
  if (raw.includes('/*!')) {
    return { ok: false, reason: 'MySQL executable comments are not allowed' };
  }
  // MySQL strings, PostgreSQL E'..' strings and (on old settings) plain PostgreSQL strings
  // read \' as a quote; this code does not. SQL Server has no such escape.
  if (dialect !== 'tsql' && raw.includes('\\')) {
    const name = dialect === 'mysql' ? 'MySQL' : 'PostgreSQL';
    return { ok: false, reason: `a backslash is not allowed in a ${name} query` };
  }

  const stripped = stripLiterals(raw, dialect);
  if (stripped === null) {
    return { ok: false, reason: 'a string, name or comment is not closed' };
  }
  const { names } = stripped;

  const statements = stripped.text
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  if (statements.length === 0) return { ok: false, reason: 'the query is empty' };
  if (statements.length > 1) return { ok: false, reason: 'only one statement is allowed' };

  const body = statements[0];
  if (!/^(select|with)\b/i.test(body)) {
    return { ok: false, reason: 'the query must start with SELECT or WITH' };
  }
  const word = body.match(FORBIDDEN_RE);
  if (word) {
    return { ok: false, reason: `"${word[1].toUpperCase()}" is not allowed in a read query` };
  }
  const fn = body.match(FUNCTION_RE);
  if (fn) return { ok: false, reason: `function ${fn[1]}() is not allowed` };
  const proc = body.match(PROCEDURE_RE);
  if (proc) return { ok: false, reason: `"${proc[0]}" is not allowed` };
  // A quoted name is not a statement word, but it can still be a function or a
  // system procedure: "pg_sleep"(10) runs on PostgreSQL.
  for (const quoted of names) {
    const lower = quoted.trim().toLowerCase();
    if (FORBIDDEN_FUNCTIONS.includes(lower)) {
      return { ok: false, reason: `function ${lower}() is not allowed` };
    }
    if (/^(?:xp|sp)_/.test(lower)) return { ok: false, reason: `"${quoted}" is not allowed` };
  }

  if (options.production) {
    // COUNT(*) is the one column-list use of * that returns no personal data.
    const noCount = body.replaceAll(/\bcount\s*\(\s*\*\s*\)/gi, 'count()');
    if (STAR_COLUMNS_RE.test(noCount)) {
      return {
        ok: false,
        reason: 'on production, name the columns: "*" is allowed only as COUNT(*)',
      };
    }
    const quotedLower = new Set(names.map((n) => n.trim().toLowerCase()));
    for (const column of options.piiColumns || []) {
      const name = String(column).trim();
      if (!name) continue;
      const re = new RegExp(
        String.raw`(^|[^A-Za-z0-9_])${escapeRegExp(name)}([^A-Za-z0-9_]|$)`,
        'i',
      );
      if (re.test(body) || quotedLower.has(name.toLowerCase())) {
        return {
          ok: false,
          reason: `column "${name}" holds personal data and cannot be read on production; use COUNT or the primary key`,
        };
      }
    }
  }

  return { ok: true, statement: raw.replace(/\s*;\s*$/, '') };
}

module.exports = { checkReadOnly, stripLiterals, normalizeDialect };
