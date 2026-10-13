'use strict';
// Mock `gh` for pr-comments tests. Scenario from BMAD_GH_MOCK (JSON file); every call appended to BMAD_GH_CALLS.
const fs = require('node:fs');
const scenario = JSON.parse(fs.readFileSync(process.env.BMAD_GH_MOCK, 'utf8'));
const args = process.argv.slice(2);
const key = args.join(' ');
let input = null;
const i = args.indexOf('--input');
if (i !== -1) input = JSON.parse(fs.readFileSync(args[i + 1], 'utf8'));
fs.appendFileSync(process.env.BMAD_GH_CALLS, JSON.stringify({ args, input }) + '\n');

function out(v) {
  process.stdout.write(typeof v === 'string' ? v : JSON.stringify(v));
  process.exit(0);
}
function fail(msg) {
  process.stderr.write(msg + '\n');
  process.exit(1);
}

if (args[0] === 'pr' && args[1] === 'view') out({ headRefOid: scenario.headRefOid, state: 'OPEN' });
if (args[0] === 'pr' && args[1] === 'diff') out(scenario.diff);
if (args[0] === 'api' && args[1] === 'user') out({ login: scenario.me });
if (args[0] === 'api' && /\/pulls\/\d+\/reviews$/.test(args[1]) && !args.includes('--method'))
  out([scenario.reviews || []]);
if (args[0] === 'api' && /\/reviews\/(\d+)\/comments$/.test(args[1])) {
  const id = Number(/\/reviews\/(\d+)\/comments$/.exec(args[1])[1]);
  out([(scenario.reviewComments || {})[id] || []]);
}
if (args[0] === 'api' && args.includes('--method')) {
  if (scenario.postFails) fail('HTTP 422: Unprocessable Entity (' + scenario.postFails + ')');
  out({
    id: 999,
    html_url: 'https://github.com/o/r/pull/12#pullrequestreview-999',
    state: input.event ? 'COMMENTED' : 'PENDING',
  });
}
fail('mock gh: unexpected call ' + key);
