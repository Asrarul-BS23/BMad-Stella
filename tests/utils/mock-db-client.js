'use strict';

// Stand-in for sqlcmd / psql / mysql in tests (STELLA_DB_BIN_<TOOL> points here).
// Writes what it was called with to MOCK_DB_LOG and answers as MOCK_DB_MODE says.
// The password is recorded only as "set" / "missing", never its value's presence in argv.

const fs = require('node:fs');

const args = process.argv.slice(2);
const record = {
  args,
  passwordInArgs: args.some((a) => a.includes(process.env.MOCK_DB_SECRET || '\u0000no-secret')),
  env: {
    SQLCMDPASSWORD: process.env.SQLCMDPASSWORD || null,
    PGPASSWORD: process.env.PGPASSWORD || null,
    MYSQL_PWD: process.env.MYSQL_PWD || null,
    PGOPTIONS: process.env.PGOPTIONS || null,
  },
};
if (process.env.MOCK_DB_LOG) fs.writeFileSync(process.env.MOCK_DB_LOG, JSON.stringify(record));

const mode = process.env.MOCK_DB_MODE || 'ok';
if (mode === 'fail') {
  process.stderr.write('Msg 208, Level 16: Invalid object name\n');
  process.exit(1);
}
if (mode === 'many') {
  const rows = ['Id|Name', '--|----'];
  for (let i = 1; i <= 500; i++) rows.push(`${i}|row${i}`);
  process.stdout.write(rows.join('\n') + '\n');
  process.exit(0);
}
process.stdout.write('Id|Status\n--|------\n1|Open\n2|Closed\n');
