'use strict';

// db-query — run ONE read-only query on a named environment for stella-investigate.
//
//   node _bmad/custom/stella/utils/db-query --env <name> --query "<SELECT ...>"
//   node _bmad/custom/stella/utils/db-query --env <name> --file <query.sql>
//   node _bmad/custom/stella/utils/db-query --env <name> --file <query.sql> --print
//
// Safety by construction:
//   - the agent passes only the environment name and the query; the connection and
//     the password come from the personal profile and secrets file, read here
//   - the password reaches the database client as an environment variable of the
//     child process; it is never an argument and never printed
//   - the query must be a single SELECT / WITH statement (lib/sql-guard.js)
//   - every run has a row limit and a time limit
//   - a production environment must be marked read_only in the profile, and a
//     production query cannot use "*" or a listed personal-data column
//   - --print runs nothing: it prints the checked statement for a person who has access
//
// These checks are a second layer. The database login itself must be read-only.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkReadOnly, normalizeDialect } = require('./lib/sql-guard');
const { buildCommand, printable } = require('./lib/clients');
const profile = require('./lib/profile');

const EXIT = Object.freeze({
  OK: 0,
  USAGE: 2,
  NO_PROFILE: 10,
  NO_ENV: 10,
  NO_DB: 11,
  NOT_READ_ONLY_QUERY: 12,
  NOT_READ_ONLY_LOGIN: 13,
  NO_CLIENT: 14,
  NO_PASSWORD: 15,
  CLIENT_FAILED: 20,
});

const USAGE =
  'usage: node db-query --env <name> (--query "<SELECT ...>" | --file <query.sql>) [--print]';
const ENV_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_QUERY_BYTES = 64 * 1024;
const HEADER_LINES = 4; // column names, the separator line and client notes

function fail(code, message) {
  process.stderr.write(`db-query: ${message}\n`);
  return code;
}

function parseArgs(argv) {
  const out = { env: null, query: null, file: null, print: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--help':
      case '-h': {
        out.help = true;
        break;
      }
      case '--print': {
        out.print = true;
        break;
      }
      case '--env':
      case '--query':
      case '--file': {
        const value = argv[++i];
        if (value === undefined) return null;
        out[a.slice(2)] = value;
        break;
      }
      default: {
        return null;
      }
    }
  }
  return out;
}

// STELLA_DB_BIN_<TOOL> may point at a .js mock (tests); real runs use the client itself.
function run(command, extraEnv, timeoutSeconds) {
  const override = process.env[`STELLA_DB_BIN_${command.program.toUpperCase()}`];
  const options = {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, ...extraEnv },
    // the client has its own limit; this one stops a client that hangs
    timeout: (timeoutSeconds + 30) * 1000,
    maxBuffer: 16 * 1024 * 1024,
  };
  if (override && override.endsWith('.js')) {
    return spawnSync(process.execPath, [override, ...command.args], options);
  }
  return spawnSync(override || command.program, command.args, options);
}

function main(argv, cwd = process.cwd()) {
  const args = parseArgs(argv);
  if (!args || args.help) {
    process.stderr.write(USAGE + '\n');
    return args && args.help ? EXIT.OK : EXIT.USAGE;
  }
  if (!args.env || !ENV_NAME_RE.test(args.env))
    return fail(EXIT.USAGE, `--env is missing or not a name. ${USAGE}`);
  if (Boolean(args.query) === Boolean(args.file)) {
    return fail(EXIT.USAGE, `give exactly one of --query or --file. ${USAGE}`);
  }

  const root = profile.findProjectRoot(cwd);
  if (!root) return fail(EXIT.NO_PROFILE, 'no _bmad/ folder found: run /stella-init first');

  let sql = args.query;
  if (args.file) {
    try {
      const file = path.resolve(cwd, args.file);
      if (fs.statSync(file).size > MAX_QUERY_BYTES) {
        return fail(EXIT.USAGE, 'the query file is too large');
      }
      sql = fs.readFileSync(file, 'utf8');
    } catch (error) {
      return fail(EXIT.USAGE, `cannot read the query file: ${error.message}`);
    }
  }

  const loaded = profile.loadEnvironment(root, args.env);
  if (!loaded.ok) return fail(EXIT[loaded.code], loaded.reason);
  const env = loaded.env;
  // The read-only check must follow the server the query will reach, so the client
  // decides the dialect. The dialect saved in the profile is used only when there
  // is no database entry (--print). A profile that says "mysql" for a sqlcmd
  // database must not make this code read the query with MySQL rules.
  const dialect = normalizeDialect(profile.TOOL_DIALECT[env.tool] || env.dialect);

  const checked = checkReadOnly(sql, {
    production: env.production,
    piiColumns: env.piiColumns,
    dialect,
  });
  if (!checked.ok) return fail(EXIT.NOT_READ_ONLY_QUERY, `query refused: ${checked.reason}`);

  if (args.print) {
    process.stdout.write(printable(dialect, checked.statement, env.rowLimit) + '\n');
    process.stdout.write(
      `-- db-query: not run. For a person with access to "${env.name}". dialect=${dialect} rows<=${env.rowLimit}\n`,
    );
    return EXIT.OK;
  }

  if (!env.db) {
    return fail(
      EXIT.NO_DB,
      `environment "${env.name}" has no [db] entry in the profile. Use --print to get the query for a person who has access.`,
    );
  }
  if (!profile.TOOLS.includes(env.tool)) {
    return fail(EXIT.NO_DB, `db.tool must be one of ${profile.TOOLS.join(', ')}`);
  }
  if (env.production && env.db.read_only !== true) {
    return fail(
      EXIT.NOT_READ_ONLY_LOGIN,
      `"${env.name}" is a production environment and its [db] entry does not say read_only = true. Use a read-only database login, then set it.`,
    );
  }

  const password = profile.resolveSecret(root, env.db.password_env);
  let command;
  try {
    command = buildCommand(env.tool, env.db, checked.statement, {
      rowLimit: env.rowLimit,
      timeoutSeconds: env.timeoutSeconds,
      password,
      dialect: env.dialect,
    });
  } catch (error) {
    return fail(EXIT.NO_DB, error.message);
  }
  if (command.needsPassword && !password) {
    const name = env.db.password_env || '(password_env is not set in the profile)';
    return fail(
      EXIT.NO_PASSWORD,
      `no password found for "${env.name}". Expected ${name} in ${profile.CUSTOM_LABEL}/${profile.SECRETS_FILE} or in the OS environment.`,
    );
  }

  const res = run(command, command.env, env.timeoutSeconds);
  if (res.error) {
    if (res.error.code === 'ENOENT') {
      return fail(EXIT.NO_CLIENT, `"${command.program}" is not installed or not on PATH`);
    }
    if (res.error.code === 'ETIMEDOUT') {
      return fail(
        EXIT.CLIENT_FAILED,
        `the query ran longer than ${env.timeoutSeconds}s and was stopped`,
      );
    }
    return fail(EXIT.CLIENT_FAILED, `cannot run ${command.program}: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const text = (res.stderr || res.stdout || '').trim().split(/\r?\n/).slice(-5).join(' | ');
    return fail(EXIT.CLIENT_FAILED, `${command.program} failed: ${text}`);
  }

  const lines = String(res.stdout || '')
    .replace(/\s+$/, '')
    .split(/\r?\n/);
  const cap = env.rowLimit + HEADER_LINES;
  process.stdout.write(lines.slice(0, cap).join('\n') + '\n');
  if (lines.length > cap) process.stdout.write(`-- output cut at ${cap} lines\n`);
  process.stdout.write(
    `-- db-query: env=${env.name}${env.production ? ' (production)' : ''} tool=${env.tool} rows<=${env.rowLimit} read at ${new Date().toISOString()}\n`,
  );
  return EXIT.OK;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { main, parseArgs, EXIT };
