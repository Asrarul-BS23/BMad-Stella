'use strict';

// Migration Task 6 — stella-build is a copy of the official bmad-build 6.12.2 skill.
// The pristine reference lives in tests/fixtures. Every difference must be an agreed
// one: ALLOWED below mirrors CHANGES.md line by line. A file not in ALLOWED must be
// byte-identical; a file in ALLOWED may differ only on the lines its rule names.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO = path.resolve(__dirname, '..', '..');
const SKILL = path.join(REPO, 'stella', 'skills', 'stella-build');
const FIXTURE = path.join(REPO, 'tests', 'fixtures', 'bmad-build-6.12.2');

// Files that exist on one side only, by design.
const SKILL_ONLY = new Set(['CHANGES.md']);
const FIXTURE_ONLY = new Set(['SOURCE.md']);

// Agreed differences. Each rule: the fixture line must equal `from`, the skill line
// must equal `to`, same line count, everything else identical.
const ALLOWED = {
  'SKILL.md': [{ line: 2, from: 'name: bmad-build', to: 'name: stella-build' }],
};

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

const listFiles = (dir, base = dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).replaceAll('\\', '/'));
  }
  return out.sort();
};
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const lines = (file) => fs.readFileSync(file, 'utf8').split('\n');

ok(fs.existsSync(SKILL), 'stella/skills/stella-build exists');
ok(fs.existsSync(FIXTURE), 'tests/fixtures/bmad-build-6.12.2 exists');

const skillFiles = listFiles(SKILL).filter((f) => !SKILL_ONLY.has(f));
const fixtureFiles = listFiles(FIXTURE).filter((f) => !FIXTURE_ONLY.has(f));

ok(fixtureFiles.length === 16, `fixture holds the 16 official files (${fixtureFiles.length})`);
for (const required of ['SKILL.md', 'workflow.md', 'customize.toml', 'step-05-present.md']) {
  ok(fixtureFiles.includes(required), `fixture has ${required}`);
}
ok(fs.existsSync(path.join(SKILL, 'CHANGES.md')), 'skill has CHANGES.md');
ok(fs.existsSync(path.join(FIXTURE, 'SOURCE.md')), 'fixture has SOURCE.md');

const missing = fixtureFiles.filter((f) => !skillFiles.includes(f));
const extra = skillFiles.filter((f) => !fixtureFiles.includes(f));
ok(missing.length === 0, `no official file missing from the skill (${missing.join(', ')})`);
ok(extra.length === 0, `no unlisted extra file in the skill (${extra.join(', ')})`);

// ---- unlisted files: byte-identical ----
const drifted = fixtureFiles.filter(
  (f) =>
    !ALLOWED[f] &&
    skillFiles.includes(f) &&
    sha(path.join(SKILL, f)) !== sha(path.join(FIXTURE, f)),
);
ok(drifted.length === 0, `every unlisted file identical to the fixture (${drifted.join(', ')})`);

// ---- listed files: differ only on the agreed lines ----
for (const [file, rules] of Object.entries(ALLOWED)) {
  const a = lines(path.join(FIXTURE, file));
  const b = lines(path.join(SKILL, file));
  ok(a.length === b.length, `${file}: same line count as the fixture (${a.length} vs ${b.length})`);
  const ruleLines = new Set(rules.map((r) => r.line));
  const unexpected = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i] && !ruleLines.has(i + 1)) unexpected.push(i + 1);
  }
  ok(unexpected.length === 0, `${file}: no unlisted changed line (${unexpected.join(', ')})`);
  for (const r of rules) {
    ok(a[r.line - 1] === r.from, `${file}:${r.line} fixture reads "${r.from}"`);
    ok(b[r.line - 1] === r.to, `${file}:${r.line} skill reads "${r.to}"`);
  }
}

// ---- CHANGES.md names every listed file ----
const changes = fs.readFileSync(path.join(SKILL, 'CHANGES.md'), 'utf8');
for (const file of Object.keys(ALLOWED)) {
  ok(changes.includes(`### ${file}`), `CHANGES.md has a section for ${file}`);
}
ok(!/none yet/.test(changes), 'CHANGES.md no longer says "none yet"');

const crlf = [
  ...fixtureFiles.map((f) => path.join(FIXTURE, f)),
  ...skillFiles.map((f) => path.join(SKILL, f)),
]
  .filter((f) => fs.readFileSync(f, 'utf8').includes('\r\n'))
  .map((f) => path.relative(REPO, f));
ok(crlf.length === 0, `no CRLF line endings (${crlf.join(', ')})`);

const ignore = fs.readFileSync(path.join(REPO, '.prettierignore'), 'utf8');
ok(
  ignore.includes('stella/skills/stella-build/') && ignore.includes('tests/fixtures/'),
  '.prettierignore excludes the skill copy and the fixture',
);

console.log(
  `stella-build drift: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
