'use strict';

// Orchestrator for `install` and `uninstall`. Every external effect (prompt, fetch,
// BMad runner, user-level hooks) is injectable so the whole cycle is testable.

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

const CONNECTOR_REMINDER =
  'Enable the Atlassian connector in claude.ai (Settings → Connectors) — stella-build and stella-pr-review fetch tickets through it.';

const defaultUserHooks = async () => {
  const hooksManager = require('./hooks-manager');
  return hooksManager.setupCustomHooks();
};

/**
 * @param {string} root project folder
 * @param {object} deps prompt (required), fetch, runBmad(root,{projectName,userName}) → status,
 *   userHooks() → {status}, log, env, isTTY
 * @returns {Promise<object>} summary
 */
async function install(root, deps) {
  const {
    prompt,
    fetch,
    verbose = false,
    runBmad = (r, o) => runner.install(r, { ...o, verbose, log }),
    userHooks = defaultUserHooks,
    log = console.log,
    env = process.env,
    isTTY = Boolean(process.stdin.isTTY),
  } = deps;
  const summary = { root, warnings: [], removed: [], created: [] };

  if (!isTTY) {
    const missing = ['JIRA_EMAIL', 'JIRA_API_TOKEN', 'STELLA_PROJECT'].filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(
        `No interactive terminal. Set ${missing.join(', ')} in the environment to install non-interactively.`,
      );
    }
  }

  // 1. preflight
  const pf = preflight.check();
  summary.warnings.push(...pf.warnings);
  if (!pf.ok) throw new Error(pf.errors.join('\n'));

  // 2. re-run detection
  summary.rerun = cleaner.isRerun(root);

  // 3 + 4. credentials
  const creds = await jira.run(root, { prompt, fetch, log, env });
  summary.credentials = { email: creds.email, verified: creds.verified, source: creds.source };

  // 5. project
  const project = await picker.run(root, creds, { prompt, fetch, log, env });
  summary.project = project;

  // 6. clean (v4 leftovers; on re-run also _bmad/ and the Stella parts of .claude/)
  summary.removed.push(...cleaner.clean(root, { rerun: summary.rerun }).removed);
  if (summary.rerun) summary.removed.push(...layer.removeStellaClaudeParts(root));

  // 7. BMad
  const status = await runBmad(root, {
    projectName: project.name,
    userName: runner.gitUserName({ cwd: root }),
  });
  if (status !== 0)
    throw new Error(`BMad install exited with code ${status}. Nothing else was changed.`);

  // 8. gitignore
  summary.gitignoreAdded = gitignore.ensure(root).added;

  // 9-13. Stella layer
  layer.copyStellaFiles(root);
  summary.skills = layer.copySkills(root);
  summary.hooks = layer.copyHooks(root);
  summary.settings = layer.registerSettings(root);
  summary.created.push(...layer.ensureOutputFolders(root));

  // 14. domain docs
  summary.domainDocs = await domain.fetchDomainDocs(root, { project, creds, fetch, log });

  // 15. user-level hooks, silent and never fatal
  try {
    summary.userHooks = await userHooks();
  } catch (error) {
    summary.userHooks = { status: 'error', error: error.message };
    summary.warnings.push(`User-level hooks not installed: ${error.message}`);
  }

  summary.reminder = CONNECTOR_REMINDER;
  return summary;
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

function formatSummary(s) {
  const d = s.domainDocs;
  const lines = [
    '✓ BMad-Stella installed.',
    `  Project: ${s.project.name}${s.project.pageId ? '' : ' (no Confluence page)'}`,
    `  JIRA credentials: ${path.relative(s.root, jira.tokenFilePath(s.root))} (${s.credentials.verified ? 'verified' : 'not verified'})`,
    `  Skills: ${s.skills.join(', ')} + official bmad-*`,
    `  Hooks: ${s.hooks.join(', ')} → ${constants.SETTINGS_LOCAL}`,
    `  Permissions: written to ${constants.SETTINGS_LOCAL}`,
    d.status === 'fetched'
      ? `  Domain docs: ${d.files.length} page(s) → ${path.relative(s.root, d.dir)}`
      : `  Domain docs: ${d.status} — ${d.reason}`,
    `  .gitignore: ${s.gitignoreAdded.length > 0 ? `added ${s.gitignoreAdded.join(', ')}` : 'already complete'}`,
    s.userHooks && s.userHooks.status ? `  User-level hooks: ${s.userHooks.status}` : null,
    s.removed.length > 0 ? `  Removed: ${s.removed.join(', ')}` : null,
    ...s.warnings.map((w) => `  ! ${w}`),
    '',
    `→ ${s.reminder}`,
    '→ Start Claude Code in this folder and type /stella-build <JIRA key>.',
  ];
  return lines.filter((l) => l !== null).join('\n');
}

module.exports = { install, uninstall, formatSummary, CONNECTOR_REMINDER };
