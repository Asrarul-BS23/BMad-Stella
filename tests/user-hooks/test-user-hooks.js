'use strict';

// Migration Task 2 — user-level hooks: personalization injection trigger, personalization
// detector staging path, and the silent hooks-manager install / re-run / update cycle.
// Everything runs against temp folders; the real ~/.claude is never touched.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const INJECT = path.join(
  ROOT,
  'stella/hooks/project/personalization-inject/user-prompt-expansion.js',
);
const DETECTOR = path.join(ROOT, 'stella/hooks/user/personalization/index.js');
const HOOKS_MANAGER = path.join(ROOT, 'tools/installer/lib/hooks-manager.js');

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed++;
    return;
  }
  failed++;
  console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

function tmpDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `stella-t2-${label}-`));
}

// ---------------------------------------------------------------------------
// 1. Injection hook, run as a real subprocess with a fake home and a fake project
// ---------------------------------------------------------------------------
{
  const home = tmpDir('home');
  const project = tmpDir('proj');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'personalization.md'), '# Me\n\nShort answers.\n');
  fs.mkdirSync(path.join(project, '_bmad'), { recursive: true });

  const run = (payload) =>
    spawnSync(process.execPath, [INJECT], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });

  const out = (payload) => {
    const result = run(payload);
    check('inject exits 0', result.status === 0, `status ${result.status}`);
    return result.stdout.trim();
  };

  const s1 = { session_id: 's1', cwd: project };

  const first = out({ ...s1, command_name: '/stella-build' });
  check('/stella-build injects', first.includes('Developer Personalization'), first.slice(0, 80));
  check(
    'injected text is the personalization file',
    first.includes('Short answers.') &&
      JSON.parse(first).hookSpecificOutput.hookEventName === 'UserPromptExpansion',
  );

  check('same session second time: nothing', out({ ...s1, command_name: '/stella-build' }) === '');
  check(
    'state file written under _bmad-output/stella/memory/.state',
    fs.existsSync(path.join(project, '_bmad-output/stella/memory/.state/.injection-state.json')),
  );

  check(
    'new session injects again',
    out({ session_id: 's2', cwd: project, command_name: 'stella-pr-review' }).includes(
      'Developer Personalization',
    ),
  );
  check(
    '/stella-security triggers',
    out({ session_id: 's3', cwd: project, command_name: '/stella-security' }) !== '',
  );
  check(
    '/STELLA-help (case) triggers',
    out({ session_id: 's4', cwd: project, command_name: '/STELLA-help' }) !== '',
  );

  check(
    '/bmad-build does not trigger (official, unmodified BMad skill)',
    out({ session_id: 's4b', cwd: project, command_name: '/bmad-build' }) === '',
  );
  check(
    '/BMAD-help (case) does not trigger',
    out({ session_id: 's4c', cwd: project, command_name: '/BMAD-help' }) === '',
  );
  check(
    '/help does not trigger',
    out({ session_id: 's5', cwd: project, command_name: '/help' }) === '',
  );
  check(
    '/caveman does not trigger',
    out({ session_id: 's6', cwd: project, command_name: '/caveman' }) === '',
  );
  check(
    'plain prompt (no command) does not trigger',
    out({ session_id: 's7', cwd: project }) === '',
  );
  check(
    'old v4 name bmad:agents:dev does not trigger',
    out({ session_id: 's8', cwd: project, command_name: 'bmad:agents:dev' }) === '',
  );

  const notBmad = tmpDir('plain');
  check(
    'project without _bmad/: nothing',
    out({ session_id: 's9', cwd: notBmad, command_name: '/stella-build' }) === '',
  );
  check('missing cwd: nothing', out({ session_id: 's10', command_name: '/stella-build' }) === '');
  check('invalid stdin exits 0', run('not json').status === 0);

  // helper-level checks
  const { isTriggerCommand } = require(INJECT);
  check('isTriggerCommand: bmad-build', !isTriggerCommand('bmad-build'));
  check('isTriggerCommand: /stella-domain-expert', isTriggerCommand('/stella-domain-expert'));
  check('isTriggerCommand: bmadx', !isTriggerCommand('bmadx'));
  check('isTriggerCommand: stellax', !isTriggerCommand('stellax'));
  check('isTriggerCommand: undefined', !isTriggerCommand());
}

// ---------------------------------------------------------------------------
// 2. Personalization detector: staging dir resolution
// ---------------------------------------------------------------------------
{
  const { findBmadMemoryStateDir } = require(DETECTOR);
  const project = tmpDir('det');
  check('detector: no _bmad -> null', findBmadMemoryStateDir(project) === null);
  fs.mkdirSync(path.join(project, '_bmad'));
  const dir = findBmadMemoryStateDir(project);
  check(
    'detector: _bmad -> _bmad-output/stella/memory/.state (created)',
    dir === path.join(project, '_bmad-output', 'stella', 'memory', '.state') && fs.existsSync(dir),
    dir,
  );
  check('detector: empty cwd -> null', findBmadMemoryStateDir('') === null);
}

// ---------------------------------------------------------------------------
// 3. hooks-manager: silent install, no-op re-run, update after tampering
// ---------------------------------------------------------------------------
(async () => {
  const hooksManager = require(HOOKS_MANAGER);
  const home = tmpDir('hm');
  const claudeDir = path.join(home, '.claude');
  hooksManager.getUserClaudeDir = () => claudeDir;
  hooksManager._runNpmInstall = async () => {}; // node-notifier install is not under test
  const quiet = (fn) => {
    const original = console.log;
    console.log = () => {};
    return fn().finally(() => {
      console.log = original;
    });
  };

  // pre-existing settings with a foreign hook that must survive
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, 'settings.json'),
    JSON.stringify({
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo keep-me' }] }] },
    }),
  );

  const first = await quiet(() => hooksManager.setupCustomHooks(null));
  check(
    'first install: status missing, changed',
    first.status === 'missing' && first.changed === true,
    JSON.stringify(first),
  );
  check(
    'notification copied',
    fs.existsSync(path.join(claudeDir, 'bmad-hooks/notification/index.js')),
  );
  check(
    'personalization copied',
    fs.existsSync(path.join(claudeDir, 'bmad-hooks/personalization/index.js')),
  );
  check(
    'counters.json seeded',
    fs.existsSync(path.join(claudeDir, 'bmad-hooks/personalization/counters.json')),
  );
  check(
    'manifest written',
    fs.existsSync(path.join(claudeDir, 'bmad-hooks/.install-manifest.json')),
  );

  const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
  const commands = (event) => (settings.hooks[event] || []).map((e) => e.hooks[0].command);
  check('Stop keeps foreign hook', commands('Stop').includes('echo keep-me'));
  check(
    'Stop registers notification',
    commands('Stop').some((c) => c.includes('notification')),
  );
  check(
    'PermissionRequest registers notification',
    commands('PermissionRequest').some((c) => c.includes('notification')),
  );
  check(
    'SessionEnd registers personalization',
    commands('SessionEnd').some((c) => c.includes('personalization')),
  );
  check(
    'no inquirer prompt in silent install',
    !fs.readFileSync(HOOKS_MANAGER, 'utf8').includes("require('inquirer')"),
  );

  const second = await quiet(() => hooksManager.setupCustomHooks(null));
  check(
    're-run: current, unchanged',
    second.status === 'current' && second.changed === false,
    JSON.stringify(second),
  );

  // tamper an installed file -> hashes differ -> silent update restores it
  const installed = path.join(claudeDir, 'bmad-hooks/notification/index.js');
  fs.appendFileSync(installed, '\n// tampered\n');
  const third = await quiet(() => hooksManager.setupCustomHooks(null));
  check(
    'tampered: outdated, changed',
    third.status === 'outdated' && third.changed === true,
    JSON.stringify(third),
  );
  check('tampered file restored', !fs.readFileSync(installed, 'utf8').includes('// tampered'));

  // user removed the registration by hand -> re-registered silently
  const stripped = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
  delete stripped.hooks.SessionEnd;
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(stripped));
  const fourth = await quiet(() => hooksManager.setupCustomHooks(null));
  const after = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
  check(
    'stripped registration: reinstalled',
    fourth.changed === true && Array.isArray(after.hooks.SessionEnd),
  );

  console.log(`\nuser-hooks: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})();
