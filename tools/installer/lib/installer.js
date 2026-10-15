'use strict';

// Orchestrator for `install` and `uninstall`. Every external effect (prompt, fetch,
// BMad runner, user-level hooks, terminal output) is injectable so the whole cycle
// is testable. Terminal output goes through a `ui` (see ./ui.js); tests pass the
// silent one.

const path = require('node:path');
const constants = require('./constants');
const preflight = require('./preflight');
const jira = require('./jira-credentials-manager');
const picker = require('./project-picker');
const cleaner = require('./cleaner');
const runner = require('./bmad-runner');
const gitignore = require('./gitignore');
const layer = require('./stella-layer');
const domain = require('./domain-knowledge-fetcher');
const { silentUi, NEXT_TEXT } = require('./ui');

const defaultUserHooks = async () => {
  const hooksManager = require('./hooks-manager');
  return hooksManager.setupCustomHooks(null, { quiet: true });
};

const seconds = (ms) => Math.max(1, Math.round(ms / 1000));

/**
 * @param {string} root project folder
 * @param {object} deps prompt (required), fetch, verbose, runBmad(root, opts) → status,
 *   userHooks() → {status}, ui, env, isTTY, now
 * @returns {Promise<object>} summary
 */
async function install(root, deps) {
  const {
    prompt,
    fetch,
    verbose = false,
    runBmad = (r, o) => runner.install(r, o),
    userHooks = defaultUserHooks,
    ui = silentUi(),
    env = process.env,
    isTTY = Boolean(process.stdin.isTTY),
    now = Date.now,
  } = deps;
  const summary = { root, warnings: [], removed: [], created: [] };
  const note = (text) => ui.line('note', text);

  if (!isTTY) {
    const missing = ['JIRA_EMAIL', 'JIRA_API_TOKEN', 'STELLA_PROJECT'].filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(
        `No interactive terminal. Set ${missing.join(', ')} in the environment to install non-interactively.`,
      );
    }
  }

  ui.header(root);

  // 1. preflight
  ui.step(1);
  const s1 = ui.spin('checking node, uv, gh, git…');
  const pf = preflight.check();
  summary.warnings.push(...pf.warnings);
  if (!pf.ok) {
    s1.fail(pf.errors[0]);
    throw new Error(pf.errors.join('\n'));
  }
  s1.succeed(
    ['node', 'uv', 'gh', 'git']
      .filter((t) => pf.found[t])
      .map((t) => (pf.versions[t] ? `${t} ${pf.versions[t]}` : t))
      .join('   '),
  );
  for (const w of pf.warnings) ui.line('warn', w);

  // 2. re-run detection
  summary.rerun = cleaner.isRerun(root);
  if (summary.rerun)
    ui.line('info', 'Existing install found — re-installing (_bmad-output is kept)');
  ui.gap();

  // 3 + 4. credentials (inquirer lines render inside the tree)
  ui.step(2);
  const creds = await jira.run(root, { prompt, fetch, log: note, env });
  summary.credentials = {
    email: creds.email,
    verified: creds.verified,
    source: creds.source,
    displayName: creds.displayName || null,
  };
  ui.line(
    'ok',
    creds.verified
      ? `Signed in as ${creds.displayName || creds.email}`
      : `${creds.email} (not verified)`,
  );
  ui.gap();

  // 5. project
  ui.step(3);
  const project = await picker.run(root, creds, { prompt, fetch, log: note, env });
  summary.project = project;
  ui.line('ok', `${project.name}${project.pageId ? '' : ' (no Confluence page)'}`);

  // 6. clean (v4 leftovers; on re-run also _bmad/ and the Stella parts of .claude/)
  summary.removed.push(...cleaner.clean(root, { rerun: summary.rerun }).removed);
  if (summary.rerun) summary.removed.push(...layer.removeStellaClaudeParts(root));
  if (summary.rerun)
    ui.line('ok', 'Removed previous install  _bmad · Stella skills · .claude/stella');
  else if (summary.removed.length > 0)
    ui.line('ok', `Removed v4 leftovers  ${summary.removed.join(' · ')}`);
  ui.gap();

  // 7. BMad (spinner unless --verbose streams BMad's own output)
  ui.step(4);
  const started = now();
  const tail = [];
  const s4 = verbose ? null : ui.spin('installing…');
  const status = await runBmad(root, {
    projectName: project.name,
    userName: runner.gitUserName({ cwd: root }),
    verbose,
    write: () => {},
    log: verbose ? note : (t) => tail.push(t),
  });
  const took = `${seconds(now() - started)}s`;
  if (status !== 0) {
    if (s4) s4.fail(`exit ${status}`);
    else ui.line('fail', `exit ${status}`);
    for (const t of tail) ui.cont(t);
    throw new Error(`BMad install exited with code ${status}. Nothing else was changed.`);
  }
  if (s4) s4.succeed('Installed', took);
  else ui.line('ok', 'Installed', took);
  ui.gap();

  // 8. gitignore
  summary.gitignoreAdded = gitignore.ensure(root).added;

  // 9-13. Stella layer
  ui.step(5);
  const s5 = ui.spin('copying skills, hooks and helpers…');
  layer.copyStellaFiles(root);
  summary.skills = layer.copySkills(root);
  summary.hooks = layer.copyHooks(root);
  summary.settings = layer.registerSettings(root);
  summary.created.push(...layer.ensureOutputFolders(root));

  // 14. domain docs
  s5.update('fetching domain docs…');
  summary.domainDocs = await domain.fetchDomainDocs(root, { project, creds, fetch, log: note });

  // 15. user-level hooks, silent and never fatal
  s5.update('user-level hooks…');
  try {
    summary.userHooks = await userHooks();
    if (summary.userHooks && summary.userHooks.error) {
      summary.userHooks.status = 'error';
      summary.warnings.push(
        `User-level hooks not installed: ${summary.userHooks.error.message || summary.userHooks.error}`,
      );
    }
  } catch (error) {
    summary.userHooks = { status: 'error', error: error.message };
    summary.warnings.push(`User-level hooks not installed: ${error.message}`);
  }
  s5.succeed(layerDetail(summary));
  for (const n of layerNotes(summary)) {
    if (n.kind === 'warn') {
      ui.line('warn', n.text);
      if (n.cont) ui.cont(n.cont);
    } else ui.line('note', n.text);
  }
  for (const w of summary.warnings.filter((w) => !pf.warnings.includes(w))) ui.line('warn', w);

  summary.next = NEXT_TEXT.join(' ');
  ui.end(`${project.name} is set up in ${path.basename(root)}`);
  ui.next();
  return summary;
}

/** The ✓ line of step 5. */
function layerDetail(s) {
  const d = s.domainDocs;
  const parts = [
    `${s.skills.length} skills`,
    `${s.hooks.length} hooks`,
    'permissions',
    d.status === 'fetched' ? `${d.files.length} domain pages` : null,
    s.userHooks && s.userHooks.status && s.userHooks.status !== 'error' ? 'user hooks' : null,
  ];
  return parts.filter(Boolean).join('   ');
}

/** "already has files (delete …)" → warn + how-to continuation; other reasons stay whole. */
function skippedNote(reason) {
  const howTo = /\((delete[^)]*)\)$/.exec(reason);
  return {
    kind: 'warn',
    text: `Domain docs skipped — ${howTo ? reason.slice(0, howTo.index).trim() : reason}`,
    cont: howTo ? howTo[1] : null,
  };
}

/** Lines under step 5: only what is new, skipped or failed. */
function layerNotes(s) {
  const d = s.domainDocs;
  return [
    s.gitignoreAdded.length > 0
      ? { kind: 'note', text: `.gitignore  added ${s.gitignoreAdded.join(', ')}` }
      : null,
    d.status === 'fetched'
      ? { kind: 'note', text: `Domain docs → ${path.relative(s.root, d.dir)}` }
      : null,
    d.status === 'skipped' ? skippedNote(d.reason) : null,
    d.status === 'failed' ? { kind: 'warn', text: `Domain docs failed — ${d.reason}` } : null,
    s.created.length > 0 ? { kind: 'note', text: `created ${s.created.join(', ')}` } : null,
  ].filter(Boolean);
}

/**
 * Removes everything the installer put in place except _bmad-output/.
 * @returns {Promise<{removed:string[], aborted:boolean}>}
 */
async function uninstall(root, { prompt, yes = false } = {}) {
  if (!yes) {
    const { confirm } = await prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Remove BMad-Stella from this folder? (_bmad-output/ is kept)',
        default: false,
      },
    ]);
    if (!confirm) return { removed: [], aborted: true };
  }
  const settingsTouched = layer.unregisterSettings(root);
  const gi = gitignore.remove(root);
  const removed = [
    ...cleaner.clean(root, { rerun: true }).removed,
    ...layer.removeStellaClaudeParts(root),
    ...layer.removeBmadSkills(root),
    settingsTouched ? `${constants.SETTINGS_LOCAL} (our entries)` : null,
    gi.removed.length > 0 ? `.gitignore (${gi.removed.join(', ')})` : null,
  ].filter(Boolean);
  return { removed, aborted: false };
}

module.exports = { install, uninstall, layerDetail, layerNotes, NEXT_TEXT };
