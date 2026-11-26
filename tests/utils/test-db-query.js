'use strict';

// db-query helper (stella-investigate): the read-only SQL check per dialect, the
// profile reader, the three client command lines, and end-to-end runs against a
// mock client. No database, no network.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const H = path.join(REPO, 'stella', 'utils', 'db-query');
const INDEX = path.join(H, 'index.js');
const MOCK = path.join(__dirname, 'mock-db-client.js');
const { checkReadOnly, normalizeDialect } = require(path.join(H, 'lib', 'sql-guard.js'));
const toml = require(path.join(H, 'lib', 'toml-lite.js'));
const profile = require(path.join(H, 'lib', 'profile.js'));
const { buildCommand, printable } = require(path.join(H, 'lib', 'clients.js'));
const { parseArgs, EXIT } = require(INDEX);

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

// ================= 1. read-only check =================
const pass = (sql, options, label) =>
  ok(checkReadOnly(sql, options).ok === true, `sql ok: ${label}`);
const refuse = (sql, options, label) => {
  const r = checkReadOnly(sql, options);
  ok(
    r.ok === false && typeof r.reason === 'string' && r.reason.length > 0,
    `sql refused: ${label}`,
  );
};

pass('SELECT Id, Name FROM Users', {}, 'plain select');
pass('  select 1  ', {}, 'leading and trailing spaces');
pass('SELECT 1;', {}, 'one trailing semicolon');
pass('WITH x AS (SELECT 1 AS a) SELECT a FROM x', {}, 'WITH');
pass("SELECT Id FROM Users WHERE Name = 'O''Brien'", {}, 'doubled quote inside a string');
pass("SELECT Id FROM t WHERE Note = 'please update; drop it'", {}, 'words and ; inside a string');
pass('SELECT last_update, offset_value, created_at FROM t', {}, 'forbidden words inside names');
pass('SELECT 1 -- a note; DROP TABLE x', { dialect: 'tsql' }, 'tsql comment hides the rest');
pass('SELECT 1 /* DROP TABLE x */', {}, 'block comment');
pass('SELECT 1 # note; DROP TABLE x', { dialect: 'mysql' }, 'mysql # comment');
pass('SELECT arr[1] FROM t', { dialect: 'postgresql' }, 'postgres array index');
pass('SELECT * FROM t', {}, 'star outside production');
pass('SELECT Id, Email FROM Users', { piiColumns: ['Email'] }, 'pii column outside production');
ok(
  checkReadOnly('SELECT 1 ;  ').statement === 'SELECT 1',
  'sql: the returned statement has no trailing semicolon',
);

refuse('', {}, 'empty');
refuse('   ', {}, 'blank');
refuse(null, {}, 'null');
refuse(';', {}, 'only a semicolon');
refuse('-- nothing here', {}, 'only a comment');
refuse('SELECT 1; SELECT 2', {}, 'two statements');
refuse('SELECT 1; DROP TABLE x', {}, 'select then drop');
refuse('UPDATE t SET a = 1', {}, 'update');
refuse('DELETE FROM t', {}, 'delete');
refuse('INSERT INTO t VALUES (1)', {}, 'insert');
refuse('DROP TABLE t', {}, 'drop');
refuse('EXEC sp_who', {}, 'exec');
refuse('SELECT a INTO b FROM t', {}, 'select into');
refuse('SELECT * FROM t FOR UPDATE', {}, 'for update');
refuse('WITH x AS (DELETE FROM t RETURNING 1) SELECT * FROM x', {}, 'delete inside WITH');
refuse('SELECT pg_sleep(10)', {}, 'pg_sleep');
refuse('SELECT xp_cmdshell', {}, 'system procedure name');
refuse("SELECT * FROM OPENROWSET(BULK 'c:/x', SINGLE_BLOB) AS a", {}, 'openrowset');
refuse("SELECT 'unclosed", {}, 'unclosed string');
refuse('SELECT 1 /* unclosed', {}, 'unclosed comment');
refuse('SELECT [unclosed FROM t', { dialect: 'tsql' }, 'unclosed bracket name');
refuse(':r file.sql', {}, 'sqlcmd :r');
refuse('!!dir', {}, 'sqlcmd !!');
refuse('SELECT 1\nGO', {}, 'sqlcmd GO');
refuse(String.raw`\copy t to 'x'`, {}, 'psql backslash command');
refuse('SELECT $(var)', {}, 'sqlcmd variable');
refuse("SELECT $$'$$", { dialect: 'postgresql' }, 'dollar quoting');
refuse("SELECT $tag$'$tag$", { dialect: 'postgresql' }, 'tagged dollar quoting');
refuse('SELECT /*! 1 */ 2', { dialect: 'mysql' }, 'mysql executable comment');
refuse(String.raw`SELECT 'a\'`, { dialect: 'mysql' }, 'backslash on mysql');
// PostgreSQL E'..' strings (and plain strings on old settings) read \' as a quote
refuse(
  String.raw`SELECT * FROM (SELECT E'a\'') AS q; DELETE FROM Orders; SELECT * FROM (SELECT 1 -- '`,
  { dialect: 'postgresql' },
  'postgresql: E-string hides a second statement',
);
refuse(String.raw`SELECT E'a\'b'`, { dialect: 'postgresql' }, 'backslash on postgresql');
refuse(String.raw`SELECT Id FROM t WHERE n LIKE 'a\_b'`, { dialect: 'psql' }, 'backslash on psql');

// a second statement hidden behind a quote the server reads differently
refuse('SELECT * FROM #t; DROP TABLE x', { dialect: 'tsql' }, 'tsql: # is not a comment');
refuse(
  String.raw`SELECT 'a\' ; DROP TABLE x --'`,
  { dialect: 'tsql' },
  'tsql: backslash is not an escape',
);
refuse(
  `SELECT "'" ; DROP TABLE x ; SELECT "'"`,
  { dialect: 'mysql' },
  'quote inside double quotes',
);
refuse("SELECT [a'b] ; DROP TABLE x ; SELECT [c'd]", { dialect: 'tsql' }, 'quote inside brackets');
refuse(
  "SELECT `a'b` ; DROP TABLE x ; SELECT `c'd`",
  { dialect: 'mysql' },
  'quote inside backticks',
);
refuse('SELECT 1 --x\n; DROP TABLE x', { dialect: 'mysql' }, 'mysql: --x is not a comment');

// production rules
const PROD = { production: true, piiColumns: ['Email', 'PhoneNumber'] };
refuse('SELECT * FROM Users', PROD, 'production: star');
// "*" is refused only as a column list (found in live testing, 2026-11-25)
pass('SELECT 2 * 3 AS six', PROD, 'production: multiplication of two numbers');
pass(
  'SELECT Quantity * UnitPrice AS Total FROM Lines',
  PROD,
  'production: multiplication of two columns',
);
pass('SELECT Id, Quantity * 2 FROM Lines', PROD, 'production: multiplication after a comma item');
pass('SELECT COUNT(*) * 2 FROM Lines', PROD, 'production: count star times a number');
refuse('SELECT DISTINCT * FROM Users', PROD, 'production: distinct star');
refuse('SELECT TOP 5 * FROM Users', PROD, 'production: top n star');
refuse('SELECT TOP (5) * FROM Users', PROD, 'production: top (n) star');
refuse('SELECT Id, * FROM Users', PROD, 'production: star after a comma');
refuse(
  'SELECT [u].* FROM Users [u]',
  { ...PROD, dialect: 'tsql' },
  'production: star after a quoted alias',
);
refuse('SELECT/**/* FROM Users', PROD, 'production: star hidden behind a comment');
refuse('SELECT Id FROM T WHERE Id IN (SELECT * FROM U)', PROD, 'production: star in a subquery');

// a quoted name is a name, not a statement word (found in live testing)
pass(
  'SELECT [Lock], [Set], [Update] FROM T',
  { dialect: 'tsql' },
  'quoted column names that look like keywords',
);
pass(
  'SELECT "Lock", "Do" FROM t',
  { dialect: 'postgresql' },
  'double-quoted names that look like keywords',
);
pass('SELECT `Lock`, `Use` FROM t', { dialect: 'mysql' }, 'backtick names that look like keywords');
refuse('SELECT Lock FROM T', {}, 'an unquoted keyword is still refused');
refuse(
  'SELECT "pg_sleep"(10)',
  { dialect: 'postgresql' },
  'a quoted forbidden function is still refused',
);
refuse(
  'SELECT "PG_SLEEP"(10)',
  { dialect: 'postgresql' },
  'a quoted forbidden function, other case',
);
refuse(
  'SELECT [xp_cmdshell] FROM T',
  { dialect: 'tsql' },
  'a quoted system procedure name is still refused',
);
refuse(
  'SELECT [Lock] FROM T; DROP TABLE T',
  { dialect: 'tsql' },
  'a quoted name does not hide a second statement',
);
refuse(
  'SELECT [Email] FROM Users',
  { ...PROD, dialect: 'tsql' },
  'production: a quoted pii column is still refused',
);
refuse(
  'SELECT [ email ] FROM Users',
  { ...PROD, dialect: 'tsql' },
  'production: a quoted pii column with spaces',
);
pass(
  'SELECT [EmailSentCount] FROM Users',
  { ...PROD, dialect: 'tsql' },
  'production: a longer quoted name is not the pii column',
);
refuse('SELECT u.* FROM Users u', PROD, 'production: alias star');
pass('SELECT COUNT(*) FROM Users', PROD, 'production: count star');
pass('SELECT count( * ) FROM Users', PROD, 'production: count star with spaces');
refuse('SELECT Id, Email FROM Users', PROD, 'production: pii column');
refuse('SELECT Id, email FROM Users', PROD, 'production: pii column, other case');
refuse(
  'SELECT Id, [Email] FROM Users',
  { ...PROD, dialect: 'tsql' },
  'production: pii in brackets',
);
refuse('SELECT Id FROM Users WHERE PhoneNumber IS NULL', PROD, 'production: pii in WHERE');
pass('SELECT Id, EmailSentCount FROM Users', PROD, 'production: longer name is not the pii column');
pass("SELECT Id FROM Users WHERE Kind = 'Email'", PROD, 'production: pii word inside a string');
pass('SELECT Id FROM Users', { production: true }, 'production: no pii list');
pass(
  'SELECT Id FROM Users',
  { production: true, piiColumns: ['', '  '] },
  'production: blank pii names',
);
ok(
  /COUNT or the primary key/.test(checkReadOnly('SELECT Email FROM U', PROD).reason),
  'production: the pii refusal says what to use',
);

ok(
  normalizeDialect('MySQL') === 'mysql' && normalizeDialect('mariadb') === 'mysql',
  'dialect: mysql family',
);
ok(
  normalizeDialect('PostgreSQL') === 'postgresql' && normalizeDialect('psql') === 'postgresql',
  'dialect: postgres',
);
ok(
  normalizeDialect('tsql') === 'tsql' && normalizeDialect('') === 'tsql',
  'dialect: tsql and default',
);
ok(
  normalizeDialect() === 'tsql' && normalizeDialect('oracle') === 'tsql',
  'dialect: unknown reads as tsql',
);

// ================= 2. profile reader (TOML subset) =================
const PROFILE = `# personal profile
[workflow]
persistent_facts = ["a fact"]   # another skill setting in the same file

[workflow.defaults]
environment = "dev"   # default
sql_dialect = 'tsql'

[workflow.db]
row_limit = 50
timeout_seconds = 10
pii_columns = [
  "Email",   # first
  "PhoneNumber",
]

[workflow.environments.dev]
[[workflow.environments.dev.sources]]
kind = "working-tree"

[workflow.environments.staging]
layout = """
Logic: src/Features
Endpoints: src/Api"""
[[workflow.environments.staging.sources]]
kind = "branch"
ref = "origin/staging"
[workflow.environments.staging.db]
tool = "sqlcmd"
server = "stg-sql"
port = 1433
database = "AppDb"
auth = "password"
user = "ro_user"
password_env = "STG_PW"

[workflow.environments.production]
production = true
[[workflow.environments.production.sources]]
kind = "tag"
pattern = "release-*"
[[workflow.environments.production.sources]]
kind = "path"
roots = ["C:/src/a", "C:/src/b"]

[workflow.environments.prod-db]
production = true
[workflow.environments.prod-db.db]
tool = "psql"
server = "pg"
database = "app"
user = "ro"
password_env = "PG_PW"

[workflow.environments.prod-ro]
production = true
[workflow.environments.prod-ro.db]
tool = "mysql"
server = "my"
database = "app"
user = "ro"
password_env = "MY_PW"
read_only = true
`;

const parsed = toml.parse(PROFILE);
const envs = parsed.workflow.environments;
ok(parsed.workflow.defaults.environment === 'dev', 'toml: string with a trailing comment');
ok(parsed.workflow.defaults.sql_dialect === 'tsql', 'toml: single-quoted string');
ok(parsed.workflow.db.row_limit === 50, 'toml: integer');
ok(
  parsed.workflow.db.pii_columns.join(',') === 'Email,PhoneNumber',
  'toml: multi-line array with comments',
);
ok(envs.production.production === true, 'toml: boolean');
ok(envs.staging.layout === 'Logic: src/Features\nEndpoints: src/Api', 'toml: multi-line string');
ok(envs.production.sources.length === 2, 'toml: array of tables has two entries');
ok(
  envs.production.sources[1].roots.join(',') === 'C:/src/a,C:/src/b',
  'toml: array inside an array table',
);
ok(
  envs.staging.db.tool === 'sqlcmd' && envs.staging.db.port === 1433,
  'toml: sub-table after an array table',
);
ok(Object.hasOwn(envs, 'prod-db'), 'toml: name with a hyphen');
ok(parsed.workflow.persistent_facts[0] === 'a fact', 'toml: other settings in the file are kept');

ok(Object.keys(toml.parse('')).length === 0, 'toml: empty file');
ok(toml.parse(String.fromCodePoint(0xfe_ff) + 'a = 1').a === 1, 'toml: byte order mark');
ok(toml.parse('a = 1\r\nb = "x"\r\n').b === 'x', 'toml: CRLF');
ok(toml.parse('[t."my env"]\nx = 1').t['my env'].x === 1, 'toml: quoted table name');
ok(toml.parse('x = { a = 1 }').x === '{ a = 1 }', 'toml: unknown value kept as text');
ok(toml.parse('x = "a # b"').x === 'a # b', 'toml: # inside a string is not a comment');
ok(toml.parse(String.raw`x = "a\"b"`).x === 'a"b', 'toml: escaped quote');
ok(toml.parse('x = 1.5').x === 1.5 && toml.parse('x = -3').x === -3, 'toml: float and negative');
const throws = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
ok(
  throws(() => toml.parse('just words')),
  'toml: a line with no = fails',
);
ok(
  throws(() => toml.parse('x = """\nopen')),
  'toml: unclosed multi-line string fails',
);
ok(
  throws(() => toml.parse('x = [1,\n2')),
  'toml: unclosed array fails',
);
ok(
  throws(() => toml.parse('[__proto__]\nx = 1')),
  'toml: __proto__ table is refused',
);
ok(
  throws(() => toml.parse('a = 1\n[a]\nb = 2')),
  'toml: value then table of the same name fails',
);
ok(Object.getPrototypeOf({}).x === undefined, 'toml: prototype not polluted');

const envFile = profile.parseDotenv('A=1\n# c\nB="two"\n\nC=\'3\'\nbad line\n__proto__=x\n');
ok(envFile.A === '1' && envFile.B === 'two' && envFile.C === '3', 'dotenv: values and quotes');
ok(
  envFile.__proto__ === undefined || typeof envFile.__proto__ !== 'string',
  'dotenv: __proto__ skipped',
);

// ================= 3. client command lines =================
const OPT = { rowLimit: 100, timeoutSeconds: 30, password: 'S3cret!' };
const noSecret = (c) => !c.args.some((a) => a.includes('S3cret!'));

let c = buildCommand('sqlcmd', envs.staging.db, 'SELECT 1', OPT);
ok(c.program === 'sqlcmd' && c.args.includes('-U') && c.args.includes('ro_user'), 'sqlcmd: user');
ok(c.args[c.args.indexOf('-S') + 1] === 'stg-sql,1433', 'sqlcmd: server,port');
ok(c.args.at(-1) === 'SET ROWCOUNT 100; SELECT 1', 'sqlcmd: row limit in the batch');
ok(c.args[c.args.indexOf('-t') + 1] === '30', 'sqlcmd: query timeout');
ok(
  c.args.includes('-b') && c.args.includes('-x'),
  'sqlcmd: stop on error, no variable substitution',
);
ok(c.env.SQLCMDPASSWORD === 'S3cret!' && noSecret(c), 'sqlcmd: password in env, not in args');
ok(c.needsPassword === true, 'sqlcmd: password login needs a password');

c = buildCommand('sqlcmd', { server: 's', database: 'd' }, 'SELECT 1', OPT);
ok(
  c.args.includes('-E') && !c.args.includes('-U') && c.needsPassword === false,
  'sqlcmd: windows login by default',
);
ok(c.env.SQLCMDPASSWORD === undefined, 'sqlcmd: no password env for windows login');
c = buildCommand(
  'sqlcmd',
  { server: 's', database: 'd', auth: 'entra', user: 'me@x' },
  'SELECT 1',
  OPT,
);
ok(c.args.includes('-G') && c.needsPassword === false, 'sqlcmd: entra login');
c = buildCommand(
  'sqlcmd',
  { server: 's', database: 'd', trust_server_certificate: true },
  'SELECT 1',
  OPT,
);
ok(c.args.includes('-C'), 'sqlcmd: trust server certificate');

c = buildCommand('psql', envs['prod-db'].db, 'SELECT 1', OPT);
ok(
  c.program === 'psql' && c.args.at(-1) === 'SELECT * FROM (\nSELECT 1\n) AS stella_q LIMIT 100',
  'psql: limit wrap',
);
ok(c.env.PGPASSWORD === 'S3cret!' && noSecret(c), 'psql: password in env, not in args');
ok(/default_transaction_read_only=on/.test(c.env.PGOPTIONS), 'psql: read-only session');
ok(/statement_timeout=30000/.test(c.env.PGOPTIONS), 'psql: statement timeout');
ok(
  c.args.includes('-X') && c.args.includes('-w') && !c.args.includes('-p'),
  'psql: no psqlrc, no prompt, no port',
);

c = buildCommand('mysql', { ...envs['prod-ro'].db, port: 3307 }, 'SELECT 1', OPT);
ok(c.program === 'mysql' && c.args[c.args.indexOf('-P') + 1] === '3307', 'mysql: port');
ok(/SET SESSION TRANSACTION READ ONLY/.test(c.args.at(-1)), 'mysql: read-only session');
ok(
  /sql_select_limit=100/.test(c.args.at(-1)) && /max_execution_time=30000/.test(c.args.at(-1)),
  'mysql: limits',
);
ok(c.env.MYSQL_PWD === 'S3cret!' && noSecret(c), 'mysql: password in env, not in args');
c = buildCommand('mysql', envs['prod-ro'].db, 'SELECT 1', { ...OPT, dialect: 'mariadb' });
ok(/max_statement_time=30\b/.test(c.args.at(-1)), 'mariadb: its own timeout setting');

ok(
  throws(() => buildCommand('oracle', {}, 'SELECT 1', OPT)),
  'clients: unknown tool fails',
);
ok(
  throws(() => buildCommand('psql', { database: 'd', user: 'u' }, 'SELECT 1', OPT)),
  'clients: missing server fails',
);
ok(
  throws(() =>
    buildCommand('psql', { server: '-evil', database: 'd', user: 'u' }, 'SELECT 1', OPT),
  ),
  'clients: a value starting with - fails',
);
ok(
  throws(() =>
    buildCommand('psql', { server: 's', database: 'd', user: 'u', port: 99_999 }, 'SELECT 1', OPT),
  ),
  'clients: port out of range fails',
);
ok(printable('tsql', 'SELECT 1', 100) === 'SET ROWCOUNT 100;\nSELECT 1;', 'printable: tsql');
ok(printable('postgresql', 'SELECT 1', 100).endsWith('LIMIT 100;'), 'printable: other dialects');

// ================= 4. argument parsing =================
ok(parseArgs(['--env', 'dev', '--query', 'SELECT 1']).query === 'SELECT 1', 'args: env + query');
ok(parseArgs(['--env', 'dev', '--file', 'q.sql', '--print']).print === true, 'args: file + print');
ok(parseArgs(['--env']) === null, 'args: missing value');
ok(parseArgs(['--exec', 'x']) === null, 'args: unknown option');
ok(parseArgs(['-h']).help === true, 'args: help');

// ================= 5. end to end with a mock client =================
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-dbq-home-'));
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-dbq-'));
const CUSTOM = path.join(ROOT, '_bmad', 'custom');
fs.mkdirSync(CUSTOM, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'src', 'deep'), { recursive: true });
const PROFILE_FILE = path.join(CUSTOM, 'stella-investigate.user.toml');
const SECRETS = path.join(CUSTOM, 'stella-investigate.secrets.env');
fs.writeFileSync(PROFILE_FILE, PROFILE);
fs.writeFileSync(SECRETS, 'STG_PW=S3cret!\nMY_PW=S3cret!\n');
const LOG = path.join(ROOT, 'mock.json');

function run(args, { cwd = ROOT, env = {} } = {}) {
  fs.rmSync(LOG, { force: true });
  const res = spawnSync(process.execPath, [INDEX, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME,
      USERPROFILE: HOME,
      STELLA_DB_BIN_SQLCMD: MOCK,
      STELLA_DB_BIN_PSQL: MOCK,
      STELLA_DB_BIN_MYSQL: MOCK,
      MOCK_DB_LOG: LOG,
      MOCK_DB_SECRET: 'S3cret!',
      MOCK_DB_MODE: 'ok',
      STG_PW: '',
      PG_PW: '',
      MY_PW: '',
      ...env,
    },
  });
  let call = null;
  try {
    call = JSON.parse(fs.readFileSync(LOG, 'utf8'));
  } catch {
    /* the client was not run */
  }
  return { status: res.status, out: res.stdout || '', err: res.stderr || '', call };
}

let r = run(['--env', 'staging', '--query', 'SELECT Id, Status FROM Orders']);
ok(r.status === EXIT.OK, `e2e: staging query runs (${r.status} ${r.err})`);
ok(/1\|Open/.test(r.out), 'e2e: the client output is printed');
ok(
  /-- db-query: env=staging tool=sqlcmd rows<=50 read at \d{4}-/.test(r.out),
  'e2e: last line names env, tool, limit and time',
);
ok(
  r.call && r.call.env.SQLCMDPASSWORD === 'S3cret!',
  'e2e: password from the secrets file reaches the client env',
);
ok(r.call && r.call.passwordInArgs === false, 'e2e: password is not in the client arguments');
ok(!r.out.includes('S3cret!') && !r.err.includes('S3cret!'), 'e2e: password is never printed');
ok(
  r.call && r.call.args.at(-1) === 'SET ROWCOUNT 50; SELECT Id, Status FROM Orders',
  'e2e: profile row limit used',
);

r = run(['--env', 'staging', '--query', 'SELECT 1'], { cwd: path.join(ROOT, 'src', 'deep') });
ok(r.status === EXIT.OK, 'e2e: runs from a sub-folder of the project');

const QFILE = path.join(ROOT, 'q.sql');
fs.writeFileSync(QFILE, "SELECT Id FROM Orders WHERE Status = 'Open';\n");
r = run(['--env', 'staging', '--file', 'q.sql']);
ok(
  r.status === EXIT.OK && r.call.args.at(-1).endsWith("Status = 'Open'"),
  'e2e: query from a file, quotes kept',
);

r = run(['--env', 'staging', '--query', 'SELECT 1'], { env: { MOCK_DB_MODE: 'many' } });
const dataLines = r.out.split('\n').filter((l) => /^\d+\|row/.test(l));
ok(
  r.status === EXIT.OK && dataLines.length <= 54,
  `e2e: output is cut near the row limit (${dataLines.length})`,
);
ok(/-- output cut at/.test(r.out), 'e2e: a cut is announced');

r = run(['--env', 'staging', '--query', 'SELECT 1'], { env: { MOCK_DB_MODE: 'fail' } });
ok(
  r.status === EXIT.CLIENT_FAILED && /Invalid object name/.test(r.err),
  'e2e: client error is reported',
);

r = run(['--env', 'staging', '--query', 'DELETE FROM Orders']);
ok(
  r.status === EXIT.NOT_READ_ONLY_QUERY && r.call === null,
  'e2e: a write query is refused and never run',
);
ok(/query refused/.test(r.err), 'e2e: the refusal says why');

r = run(['--env', 'nowhere', '--query', 'SELECT 1']);
ok(
  r.status === EXIT.NO_ENV && /known: .*staging/.test(r.err),
  'e2e: unknown environment lists the known ones',
);

r = run(['--env', 'dev', '--query', 'SELECT 1']);
ok(
  r.status === EXIT.NO_DB && /--print/.test(r.err) && r.call === null,
  'e2e: no db entry points to --print',
);

r = run(['--env', 'production', '--query', 'SELECT Id FROM Orders', '--print']);
ok(r.status === EXIT.OK && r.call === null, 'e2e: --print runs nothing');
ok(
  /SET ROWCOUNT 50;\nSELECT Id FROM Orders;/.test(r.out) && /not run/.test(r.out),
  'e2e: --print shows the checked query',
);

r = run(['--env', 'production', '--query', 'SELECT Email FROM Users', '--print']);
ok(r.status === EXIT.NOT_READ_ONLY_QUERY, 'e2e: --print still applies the production rules');

r = run(['--env', 'prod-db', '--query', 'SELECT Id FROM Orders'], { env: { PG_PW: 'S3cret!' } });
ok(
  r.status === EXIT.NOT_READ_ONLY_LOGIN && r.call === null,
  'e2e: production without read_only = true is refused',
);

r = run(['--env', 'prod-ro', '--query', 'SELECT Id FROM Orders']);
ok(r.status === EXIT.OK && /\(production\)/.test(r.out), 'e2e: production marked read_only runs');
r = run(['--env', 'prod-ro', '--query', 'SELECT * FROM Orders']);
ok(r.status === EXIT.NOT_READ_ONLY_QUERY && r.call === null, 'e2e: production star is refused');
r = run(['--env', 'staging', '--query', 'SELECT * FROM Orders']);
ok(r.status === EXIT.OK, 'e2e: star is fine outside production');

// production by name: an environment called prod / live is production without the flag
{
  const named = [
    '[workflow.environments.prod.db]',
    'tool = "sqlcmd"',
    'server = "s"',
    'database = "d"',
    '',
    '[workflow.environments.live]',
    '[workflow.environments.live.db]',
    'tool = "sqlcmd"',
    'server = "s"',
    'database = "d"',
    'read_only = true',
    '',
    '[workflow.environments.pre-prod]',
    'production = false',
    '[workflow.environments.pre-prod.db]',
    'tool = "sqlcmd"',
    'server = "s"',
    'database = "d"',
    '',
  ].join('\n');
  fs.writeFileSync(PROFILE_FILE, named);
  r = run(['--env', 'prod', '--query', 'SELECT Id FROM Orders']);
  ok(
    r.status === EXIT.NOT_READ_ONLY_LOGIN && r.call === null,
    'by name: "prod" with no flag needs read_only = true',
  );
  r = run(['--env', 'live', '--query', 'SELECT * FROM Orders']);
  ok(r.status === EXIT.NOT_READ_ONLY_QUERY, 'by name: "live" gets the production query rules');
  r = run(['--env', 'live', '--query', 'SELECT Id FROM Orders']);
  ok(
    r.status === EXIT.OK && /\(production\)/.test(r.out),
    'by name: "live" marked read_only runs as production',
  );
  r = run(['--env', 'pre-prod', '--query', 'SELECT * FROM Orders']);
  ok(
    r.status === EXIT.OK && !/\(production\)/.test(r.out),
    'by name: production = false wins over the name',
  );
  fs.writeFileSync(PROFILE_FILE, PROFILE);
}
ok(profile.isProduction('dev', true) === true, 'isProduction: an explicit true wins');
ok(profile.isProduction('prod', false) === false, 'isProduction: an explicit false wins');
ok(
  profile.isProduction('prod', 'yes') === true,
  'isProduction: a non-boolean flag falls back to the name',
);
ok(profile.isProduction() === false, 'isProduction: no name is not production');

// password: the secrets file wins, then the OS environment, then a clear error
fs.writeFileSync(SECRETS, 'OTHER=1\n');
r = run(['--env', 'staging', '--query', 'SELECT 1'], { env: { STG_PW: 'FromEnv9' } });
ok(
  r.status === EXIT.OK && r.call.env.SQLCMDPASSWORD === 'FromEnv9',
  'e2e: password from the OS environment',
);
r = run(['--env', 'staging', '--query', 'SELECT 1']);
ok(
  r.status === EXIT.NO_PASSWORD && /STG_PW/.test(r.err) && r.call === null,
  'e2e: missing password names the variable',
);
fs.rmSync(SECRETS);
r = run(['--env', 'staging', '--query', 'SELECT 1']);
ok(r.status === EXIT.NO_PASSWORD, 'e2e: no secrets file at all');
fs.writeFileSync(SECRETS, 'STG_PW=S3cret!\nMY_PW=S3cret!\n');

// usage errors
ok(run([]).status === EXIT.USAGE, 'e2e: no arguments');
ok(run(['--env', 'staging']).status === EXIT.USAGE, 'e2e: neither --query nor --file');
ok(
  run(['--env', 'staging', '--query', 'SELECT 1', '--file', 'q.sql']).status === EXIT.USAGE,
  'e2e: both --query and --file',
);
ok(
  run(['--env', 'a b', '--query', 'SELECT 1']).status === EXIT.USAGE,
  'e2e: environment name with a space',
);
ok(
  run(['--env', 'staging', '--file', 'missing.sql']).status === EXIT.USAGE,
  'e2e: missing query file',
);
ok(
  run(['--env', 'staging', '--query', 'SELECT 1', '--drop']).status === EXIT.USAGE,
  'e2e: unknown option',
);
ok(run(['--help']).status === EXIT.OK, 'e2e: --help');

// the client is not installed
r = run(['--env', 'staging', '--query', 'SELECT 1'], {
  env: { STELLA_DB_BIN_SQLCMD: 'stella-no-such-client-xyz' },
});
ok(r.status === EXIT.NO_CLIENT && /not installed/.test(r.err), 'e2e: missing client is named');

// broken or missing profile, wrong tool, project not set up
fs.writeFileSync(PROFILE_FILE, 'this is not toml');
ok(
  run(['--env', 'staging', '--query', 'SELECT 1']).status === EXIT.NO_PROFILE,
  'e2e: unreadable profile',
);
fs.writeFileSync(PROFILE_FILE, '[workflow.environments.x.db]\ntool = "oracle"\nserver = "s"\n');
r = run(['--env', 'x', '--query', 'SELECT 1']);
ok(
  r.status === EXIT.NO_DB && /sqlcmd, psql, mysql/.test(r.err),
  'e2e: unknown tool lists the known ones',
);
fs.writeFileSync(
  PROFILE_FILE,
  '[workflow.environments.x.db]\ntool = "psql"\ndatabase = "d"\nuser = "u"\npassword_env = "STG_PW"\n',
);
r = run(['--env', 'x', '--query', 'SELECT 1']);
ok(r.status === EXIT.NO_DB && /server/.test(r.err), 'e2e: missing server in the profile is named');
fs.rmSync(PROFILE_FILE);
ok(
  run(['--env', 'staging', '--query', 'SELECT 1']).status === EXIT.NO_PROFILE,
  'e2e: no profile file',
);

// the read-only check follows the client, not the dialect written in the profile.
// With MySQL rules "#t; DROP TABLE x" is a comment; on SQL Server it is a second statement.
fs.writeFileSync(
  PROFILE_FILE,
  '[workflow.defaults]\nsql_dialect = "mysql"\n[workflow.environments.x.db]\ntool = "sqlcmd"\nserver = "s"\ndatabase = "d"\n',
);
r = run(['--env', 'x', '--query', 'SELECT * FROM #t; DROP TABLE x']);
ok(
  r.status === EXIT.NOT_READ_ONLY_QUERY && r.call === null,
  'e2e: a wrong dialect in the profile cannot hide a second statement from the check',
);
r = run(['--env', 'x', '--query', 'SELECT Id FROM Orders']);
ok(r.status === EXIT.OK, 'e2e: a normal query still runs with a mismatched dialect');
fs.writeFileSync(
  PROFILE_FILE,
  '[workflow.defaults]\nsql_dialect = "mysql"\n[workflow.environments.nodb]\n',
);
r = run(['--env', 'nodb', '--query', 'SELECT 1 # note', '--print']);
ok(
  r.status === EXIT.OK && /dialect=mysql/.test(r.out),
  'e2e: --print with no database entry uses the saved dialect',
);
fs.rmSync(PROFILE_FILE);

// `.profile.toml` wins over `.user.toml` when both exist
fs.writeFileSync(PROFILE_FILE, '[workflow.environments.only-user]\n');
fs.writeFileSync(path.join(CUSTOM, 'stella-investigate.profile.toml'), PROFILE);
ok(
  run(['--env', 'staging', '--query', 'SELECT 1']).status === EXIT.OK,
  'e2e: .profile.toml is used when present',
);

const OUTSIDE = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-dbq-out-'));
r = run(['--env', 'staging', '--query', 'SELECT 1'], { cwd: OUTSIDE });
ok(
  r.status === EXIT.NO_PROFILE && /stella-init/.test(r.err),
  'e2e: outside a project points to /stella-init',
);

for (const dir of [ROOT, HOME, OUTSIDE]) fs.rmSync(dir, { recursive: true, force: true });

console.log(`utils db-query: ${total - fails}/${total} passed`);
process.exit(fails === 0 ? 0 : 1);
