'use strict';

// One command-line client per database. Each builder returns the program, its
// arguments and extra environment variables. The password goes in an environment
// variable of the child process, never in the arguments.

const CONNECT_TIMEOUT_SECONDS = 15;

// A value that becomes a client argument must not look like an option.
function plain(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`the profile has no "${label}" for this database`);
  if (text.startsWith('-')) throw new Error(`"${label}" must not start with "-"`);
  return text;
}

function port(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 1 || n > 65_535) throw new Error('"port" must be 1-65535');
  return String(n);
}

function sqlcmd(db, statement, { rowLimit, timeoutSeconds, password }) {
  const server = plain(db.server, 'server');
  const p = port(db.port);
  const args = ['-S', p ? `${server},${p}` : server, '-d', plain(db.database, 'database')];
  const env = {};
  const auth = String(db.auth || (db.user ? 'password' : 'windows')).toLowerCase();
  if (auth === 'windows') {
    args.push('-E');
  } else if (auth === 'entra') {
    args.push('-G');
    if (db.user) args.push('-U', plain(db.user, 'user'));
  } else {
    args.push('-U', plain(db.user, 'user'));
    env.SQLCMDPASSWORD = password || '';
  }
  if (db.trust_server_certificate === true) args.push('-C');
  // -b stop on error, -W trim spaces, -x no $(var) substitution
  args.push(
    '-b',
    '-W',
    '-x',
    '-s',
    '|',
    '-t',
    String(timeoutSeconds),
    '-l',
    String(CONNECT_TIMEOUT_SECONDS),
    '-Q',
    `SET ROWCOUNT ${rowLimit}; ${statement}`,
  );
  return { program: 'sqlcmd', args, env, needsPassword: auth !== 'windows' && auth !== 'entra' };
}

function psql(db, statement, { rowLimit, timeoutSeconds, password }) {
  const args = ['-h', plain(db.server, 'server')];
  const p = port(db.port);
  if (p) args.push('-p', p);
  args.push(
    '-U',
    plain(db.user, 'user'),
    '-d',
    plain(db.database, 'database'),
    '-X', // no psqlrc
    '-w', // never prompt
    '-A',
    '-F',
    '|',
    '-P',
    'pager=off',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    // own lines: a "--" comment at the end of the query must not hide the bracket
    `SELECT * FROM (\n${statement}\n) AS stella_q LIMIT ${rowLimit}`,
  );
  const env = {
    PGPASSWORD: password || '',
    PGCONNECT_TIMEOUT: String(CONNECT_TIMEOUT_SECONDS),
    // The session itself refuses writes, whatever the query text says.
    PGOPTIONS: `-c default_transaction_read_only=on -c statement_timeout=${timeoutSeconds * 1000}`,
  };
  return { program: 'psql', args, env, needsPassword: true };
}

function mysql(db, statement, { rowLimit, timeoutSeconds, password, dialect }) {
  const args = ['-h', plain(db.server, 'server')];
  const p = port(db.port);
  if (p) args.push('-P', p);
  const maria = /^mariadb/i.test(String(dialect || ''));
  const timeout = maria
    ? `SET SESSION max_statement_time=${timeoutSeconds}`
    : `SET SESSION max_execution_time=${timeoutSeconds * 1000}`;
  args.push(
    '-u',
    plain(db.user, 'user'),
    '-D',
    plain(db.database, 'database'),
    '--batch',
    `--connect-timeout=${CONNECT_TIMEOUT_SECONDS}`,
    '-e',
    `SET SESSION TRANSACTION READ ONLY; SET SESSION sql_select_limit=${rowLimit}; ${timeout}; ${statement}`,
  );
  return { program: 'mysql', args, env: { MYSQL_PWD: password || '' }, needsPassword: true };
}

const BUILDERS = { sqlcmd, psql, mysql };

/**
 * @param {string} tool sqlcmd | psql | mysql
 * @returns {{program: string, args: string[], env: object, needsPassword: boolean}}
 */
function buildCommand(tool, db, statement, options) {
  const builder = BUILDERS[tool];
  if (!builder) throw new Error(`unknown database tool "${tool}"`);
  return builder(db, statement, options);
}

// The statement with the row limit, in the project's dialect, for a person who
// runs it by hand (no access from this machine).
function printable(dialect, statement, rowLimit) {
  if (dialect === 'tsql') return `SET ROWCOUNT ${rowLimit};\n${statement};`;
  return `SELECT * FROM (\n${statement}\n) AS stella_q LIMIT ${rowLimit};`;
}

module.exports = { buildCommand, printable, CONNECT_TIMEOUT_SECONDS };
