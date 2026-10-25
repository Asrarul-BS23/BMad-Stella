'use strict';

// stella-project-context/scripts/check-context.js — the deterministic check the skill
// runs after writing. Fixtures are built in a temp folder: a good pair of files passes;
// a missing path, an over-budget file, four marked lines, a bad provenance line, a
// missing CLAUDE.md line and a missing context file each fail with a named reason.
// Also: path extraction ignores commands, placeholders, URLs and generics; globs are
// checked by their fixed prefix; the CLI prints `ok` / `FAIL:` lines with exit codes 0 / 1 / 10.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(
  REPO,
  'stella',
  'skills',
  'stella-project-context',
  'scripts',
  'check-context.js',
);
const check = require(SCRIPT);

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

const PROV = (sha = 'abc1234') =>
  `<!-- Verified 2026-10-25 against ${sha}. Managed by stella-project-context; refresh re-verifies every line. -->`;

const PROJECT = [
  PROV(),
  '',
  '# demo',
  '',
  '## Orientation',
  '',
  'Demo app. Team rules in `CLAUDE.md`. Code beats any doc.',
  '',
  '## Policy',
  '',
  '- Never stage `.env*`; values come from the vault.',
  '- Never hand-edit `src/generated/**`; run `pnpm codegen`.',
  '- Unverified: `legacy/` may be dead. Edit this line or delete it.',
  '',
  '## Where things are',
  '',
  '- Entry point `src/app.js`; docs in `docs/`; the only mapper is `Order.cs`.',
  '- Handlers implement `IRequest<T>` and are found by `{spec_file}` style placeholders never.',
  '- Wiki: `https://example.test/wiki`.',
];

const ARCH = [
  PROV(),
  '',
  '# Architecture — demo',
  '',
  '## Layers',
  '',
  '| layer | path |',
  '| --- | --- |',
  '| api | `src/` |',
];

function makeRoot(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-check-'));
  fs.mkdirSync(path.join(root, 'project-context'));
  fs.mkdirSync(path.join(root, 'src', 'generated'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs'));
  fs.mkdirSync(path.join(root, 'legacy'));
  fs.writeFileSync(path.join(root, 'src', 'app.js'), '');
  fs.writeFileSync(path.join(root, 'Order.cs'), '');
  fs.writeFileSync(path.join(root, '.env'), '');
  const project = overrides.project === undefined ? PROJECT.join('\n') + '\n' : overrides.project;
  const arch = overrides.arch === undefined ? ARCH.join('\n') + '\n' : overrides.arch;
  if (project !== null) fs.writeFileSync(path.join(root, 'project-context', 'project.md'), project);
  if (arch !== null) fs.writeFileSync(path.join(root, 'project-context', 'architecture.md'), arch);
  const claude =
    overrides.claude === undefined ? '# Rules\n\n@project-context/project.md\n' : overrides.claude;
  if (claude !== null) fs.writeFileSync(path.join(root, 'CLAUDE.md'), claude);
  return root;
}

const failuresOf = (root) => check.checkContext(root).failures;

// ---- good fixture passes ----
{
  const root = makeRoot();
  const r = check.checkContext(root);
  ok(r.ok, `good: passes (${r.failures.join(' | ')})`);
  const sha = makeRoot({ project: PROJECT.map((l, i) => (i === 0 ? PROV('none') : l)).join('\n') });
  ok(check.checkContext(sha).ok, 'good: provenance sha `none` accepted');
}

// ---- missing path ----
{
  const root = makeRoot({
    project: [...PROJECT, '', '## Known pitfalls', '', '- See `src/missing.js` first.'].join('\n'),
  });
  const f = failuresOf(root);
  ok(
    f.some((x) => x.includes('does not exist: src/missing.js')),
    `path: missing path reported (${f.join(' | ')})`,
  );
}

// ---- budgets ----
{
  const lines = [...PROJECT];
  while (lines.length < 61) lines.push('- filler line');
  const f = failuresOf(makeRoot({ project: lines.join('\n') + '\n' }));
  ok(
    f.some((x) => x.includes('project-context/project.md has 61 lines, budget 60')),
    `budget: 61 lines fails (${f.join(' | ')})`,
  );
  const lines90 = [...ARCH];
  while (lines90.length < 90) lines90.push('- filler line');
  ok(
    check.checkContext(makeRoot({ arch: lines90.join('\n') + '\n' })).ok,
    'budget: 90 lines passes',
  );
  const lines91 = [...lines90, '- one more'];
  ok(
    failuresOf(makeRoot({ arch: lines91.join('\n') + '\n' })).some((x) =>
      x.includes('91 lines, budget 90'),
    ),
    'budget: 91 lines fails',
  );
}

// ---- marked lines ----
{
  const extra = [
    '- Unverified: two. Edit this line or delete it.',
    '- Unverified: three. Edit this line or delete it.',
  ];
  ok(
    check.checkContext(makeRoot({ project: [...PROJECT, ...extra].join('\n') + '\n' })).ok,
    'marked: three across both files passes',
  );
  const four = [...extra, '- Unverified: four. Edit this line or delete it.'];
  const f = failuresOf(makeRoot({ project: [...PROJECT, ...four].join('\n') + '\n' }));
  ok(
    f.some((x) => x.includes('4 Unverified lines across both files, at most 3')),
    `marked: four fails (${f.join(' | ')})`,
  );
  const split = makeRoot({
    project: [...PROJECT, ...extra].join('\n') + '\n',
    arch: [...ARCH, '', '- Unverified: in arch. Edit this line or delete it.'].join('\n') + '\n',
  });
  ok(
    failuresOf(split).some((x) => x.includes('4 Unverified lines')),
    'marked: counted across both files',
  );
}

// ---- provenance ----
{
  const old = PROJECT.map((l, i) =>
    i === 0
      ? '<!-- Verified 2026-10-25 against abc1234. Managed by stella-project-context; edits are replaced on refresh. -->'
      : l,
  );
  const f = failuresOf(makeRoot({ project: old.join('\n') + '\n' }));
  ok(
    f.includes('project-context/project.md line 1 is not the provenance line'),
    `provenance: old wording fails (${f.join(' | ')})`,
  );
  const none = failuresOf(makeRoot({ arch: ['# Architecture', ...ARCH.slice(1)].join('\n') }));
  ok(
    none.includes('project-context/architecture.md line 1 is not the provenance line'),
    'provenance: missing line fails',
  );
}

// ---- CLAUDE.md ----
{
  const noFile = failuresOf(makeRoot({ claude: null }));
  ok(
    noFile.some((x) => x.startsWith('CLAUDE.md missing')),
    `claude: missing file fails (${noFile.join(' | ')})`,
  );
  const noLine = failuresOf(makeRoot({ claude: '# Rules\n\nSome text.\n' }));
  ok(
    noLine.includes('CLAUDE.md does not contain the line @project-context/project.md'),
    'claude: missing line fails',
  );
  ok(
    check.checkContext(makeRoot({ claude: '  @project-context/project.md  \n' })).ok,
    'claude: line with surrounding spaces accepted',
  );
  ok(
    !check.checkContext(makeRoot({ claude: 'see @project-context/project.md for context\n' })).ok,
    'claude: line must stand alone',
  );
}

// ---- missing context files ----
{
  const f = failuresOf(makeRoot({ project: null, arch: null }));
  ok(f.includes('project-context/project.md missing'), 'missing: project.md reported');
  ok(f.includes('project-context/architecture.md missing'), 'missing: architecture.md reported');
}

// ---- path extraction ----
{
  const text = [
    '`src/app.js` `docs/` `./src/app.js` `.env*` `src/generated/**` `Order.cs`',
    '`pnpm codegen` `{spec_file}` `https://example.test/x` `IRequest<T>` `--flag` `BeginTransactionAsync`',
    '`docs/lessons.md §2` `@project-context/project.md` `a=b/c` `src/x|y`',
  ].join('\n');
  const got = check.pathCandidates(text).sort();
  const want = ['.env', 'Order.cs', 'docs', 'src/app.js', 'src/generated'].sort();
  ok(got.join(',') === want.join(','), `extract: ${got.join(',')} === ${want.join(',')}`);
}

// ---- main(): exit codes and output ----
{
  const lines = [];
  const io = { log: (s) => lines.push(s) };
  ok(check.main([makeRoot()], io) === 0 && lines.join('') === 'ok', 'main: good root → 0 and `ok`');
  const bad = [];
  const code = check.main([makeRoot({ claude: null })], { log: (s) => bad.push(s) });
  ok(code === 1 && bad.every((l) => l.startsWith('FAIL: ')), 'main: failures → 1 and FAIL lines');
  const usage = [];
  ok(
    check.main([path.join(os.tmpdir(), 'does-not-exist-' + Date.now())], {
      log: (s) => usage.push(s),
    }) === 10,
    'main: bad root → 10',
  );
  ok(
    check.EXIT_CODES.OK === 0 && check.EXIT_CODES.FAIL === 1 && check.EXIT_CODES.USAGE === 10,
    'main: exit code table',
  );
  ok(
    check.MARKED_MAX === 3 &&
      check.FILES['project.md'] === 60 &&
      check.FILES['architecture.md'] === 90,
    'main: constants',
  );
}

// ---- CLI ----
{
  const good = makeRoot();
  const r = spawnSync(process.execPath, [SCRIPT, good], { encoding: 'utf8' });
  ok(r.status === 0 && r.stdout.trim() === 'ok', `cli: ok on good root (${r.stdout.trim()})`);
  const cwd = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', cwd: good });
  ok(cwd.status === 0 && cwd.stdout.trim() === 'ok', 'cli: defaults to cwd');
  const bad = spawnSync(process.execPath, [SCRIPT, makeRoot({ claude: null })], {
    encoding: 'utf8',
  });
  ok(
    bad.status === 1 && /^FAIL: CLAUDE\.md missing/m.test(bad.stdout),
    'cli: exit 1 with FAIL line',
  );
}

console.log(`check-context: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`);
process.exit(fails ? 1 : 0);
