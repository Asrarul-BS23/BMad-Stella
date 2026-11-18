'use strict';

// tea-setup.apply(): write the [modules.tea] table `bmad setup tea` would
// write, into _bmad/config.toml, only when no modules.tea exists in any merged
// config file (plan: tea-module/tea-setup-automation-plan.md). The fs is
// injected — no test touches the disk.

const path = require('node:path');
const teaSetup = require('../../tools/installer/lib/tea-setup');

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

const ROOT = path.join('C:', 'proj');

// In-memory fs over relative paths (joined with the root, normalized).
const memFs = (files) => {
  const store = new Map(Object.entries(files).map(([k, v]) => [path.join(ROOT, k), v]));
  return {
    store,
    existsSync: (p) => store.has(p),
    readFileSync: (p) => {
      if (!store.has(p)) throw new Error(`ENOENT: ${p}`);
      return store.get(p);
    },
    writeFileSync: (p, text) => store.set(p, text),
  };
};

const BASE_CONFIG =
  '[core]\nproject_name = "proj"\n\n[modules.bmm]\nuser_skill_level = "intermediate"\n';

const BMOD_TOML = `# comment
[bmod]
code = "tea"
version = "3.6.0"
post_install_message = '''
TEA is ready. key = "trap inside triple quotes"
[[bmod.config_questions]]
'''

[[bmod.config_questions]]
key = "test_artifacts"
prompt = "Where should test artifacts be stored?"
default = "{project-root}/_bmad-output/test-artifacts"

[[bmod.config_questions]]
key = "tea_browser_automation"
prompt = "How should TEA drive live browsers?"
default = "auto"

[[bmod.config_questions]]
key = "max_healing_iterations"
prompt = "How many repair rounds?"
default = "3"
`;

// fresh install: block appended from bmod.toml, override applied, order kept
{
  const fs = memFs({
    '_bmad/config.toml': BASE_CONFIG,
    '.claude/skills/bmod-tea/bmod.toml': BMOD_TOML,
  });
  const r = teaSetup.apply(ROOT, { fs });
  ok(r.status === 'written' && r.keys === 3, `fresh: written with 3 keys (${JSON.stringify(r)})`);
  ok(r.source === '.claude/skills/bmod-tea/bmod.toml', 'fresh: source is the .claude bmod.toml');
  const text = fs.store.get(path.join(ROOT, '_bmad/config.toml'));
  const block =
    BASE_CONFIG +
    '\n[modules.tea]\n' +
    'test_artifacts = "{project-root}/_bmad-output/test-artifacts"\n' +
    'tea_browser_automation = "mcp"\n' +
    'max_healing_iterations = "3"\n';
  ok(text === block, 'fresh: exact block — bmod.toml order, mcp override, blank line before table');
}

// triple-quoted install message never leaks a fake question
{
  const fs = memFs({
    '_bmad/config.toml': BASE_CONFIG,
    '.claude/skills/bmod-tea/bmod.toml': BMOD_TOML,
  });
  const r = teaSetup.apply(ROOT, { fs });
  const text = fs.store.get(path.join(ROOT, '_bmad/config.toml'));
  ok(r.keys === 3 && !text.includes('trap'), 'parse: content inside triple quotes is ignored');
}

// modules.tea in custom/config.toml → present, base file untouched
{
  const fs = memFs({
    '_bmad/config.toml': BASE_CONFIG,
    '_bmad/custom/config.toml': '[modules.tea]\ntest_artifacts = "x"\n',
    '.claude/skills/bmod-tea/bmod.toml': BMOD_TOML,
  });
  const r = teaSetup.apply(ROOT, { fs });
  ok(
    r.status === 'present' && r.file === '_bmad/custom/config.toml',
    'present: custom/config.toml satisfies the gate',
  );
  ok(
    fs.store.get(path.join(ROOT, '_bmad/config.toml')) === BASE_CONFIG,
    'present: base config untouched',
  );
}

// modules.tea in the base file itself → present
{
  const fs = memFs({
    '_bmad/config.toml': BASE_CONFIG + '\n[modules.tea]\ntest_artifacts = "x"\n',
  });
  const r = teaSetup.apply(ROOT, { fs });
  ok(
    r.status === 'present' && r.file === '_bmad/config.toml',
    'present: base config satisfies the gate',
  );
}

// modules.tea in custom/config.user.toml → present
{
  const fs = memFs({
    '_bmad/config.toml': BASE_CONFIG,
    '_bmad/custom/config.user.toml': '[modules.tea]\ntest_framework = "jest"\n',
  });
  const r = teaSetup.apply(ROOT, { fs });
  ok(
    r.status === 'present' && r.file === '_bmad/custom/config.user.toml',
    'present: user config satisfies the gate',
  );
}

// .agents layout is the fallback location for bmod.toml
{
  const fs = memFs({
    '_bmad/config.toml': BASE_CONFIG,
    '.agents/skills/bmod-tea/bmod.toml': BMOD_TOML,
  });
  const r = teaSetup.apply(ROOT, { fs });
  ok(
    r.status === 'written' && r.source === '.agents/skills/bmod-tea/bmod.toml',
    'layout: .agents/skills bmod.toml found when .claude copy is absent',
  );
}

// no bmod.toml anywhere → fallback defaults (13 keys), override still applied
{
  const fs = memFs({ '_bmad/config.toml': BASE_CONFIG });
  const r = teaSetup.apply(ROOT, { fs });
  const text = fs.store.get(path.join(ROOT, '_bmad/config.toml'));
  ok(
    r.status === 'written' && r.source === 'fallback' && r.keys === 13,
    `fallback: 13 keys (${JSON.stringify(r)})`,
  );
  ok(
    text.includes('tea_browser_automation = "mcp"') && text.includes('use_mcp_healing = "true"'),
    'fallback: defaults written with the mcp override',
  );
}

// unparsable bmod.toml (an entry without default) → fallback defaults
{
  const broken = '[[bmod.config_questions]]\nkey = "only_key_no_default"\n';
  const fs = memFs({
    '_bmad/config.toml': BASE_CONFIG,
    '.claude/skills/bmod-tea/bmod.toml': broken,
  });
  const r = teaSetup.apply(ROOT, { fs });
  ok(
    r.status === 'written' && r.source === 'fallback' && r.keys === 13,
    'fallback: incomplete question entry',
  );
}

// config without trailing newline still gets a separated table
{
  const fs = memFs({ '_bmad/config.toml': '[core]\nproject_name = "proj"' });
  const r = teaSetup.apply(ROOT, { fs });
  const text = fs.store.get(path.join(ROOT, '_bmad/config.toml'));
  ok(
    r.status === 'written' && text.includes('project_name = "proj"\n\n[modules.tea]\n'),
    'write: missing trailing newline handled',
  );
}

// quotes and backslashes in a default are TOML-escaped
{
  const weird =
    '[[bmod.config_questions]]\nkey = "test_artifacts"\nprompt = "p"\ndefault = "a\\\\b \\"c\\""\n';
  const fs = memFs({
    '_bmad/config.toml': BASE_CONFIG,
    '.claude/skills/bmod-tea/bmod.toml': weird,
  });
  teaSetup.apply(ROOT, { fs });
  const text = fs.store.get(path.join(ROOT, '_bmad/config.toml'));
  ok(text.includes('test_artifacts = "a\\\\b \\"c\\""'), 'write: values are TOML-escaped');
}

// missing _bmad/config.toml → throws (BMad step must run first)
{
  let threw = null;
  try {
    teaSetup.apply(ROOT, { fs: memFs({}) });
  } catch (error) {
    threw = error;
  }
  ok(
    threw !== null && threw.message.includes('config.toml not found'),
    'gate: missing _bmad/config.toml throws',
  );
}

console.log(`tea setup: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`);
process.exit(fails ? 1 : 0);
