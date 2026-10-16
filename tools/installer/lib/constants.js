'use strict';

// Fixed values for the BMad-Stella v6 installer. Nothing here is asked from the
// developer at install time (user decisions, migration plan 2026-10-13/14).

const BMAD_VERSION = '6.12.2';
const BMAD_PACKAGE = `bmad-method@${BMAD_VERSION}`;

const JIRA_BASE_URL = 'https://stellaint.atlassian.net';
const TOKEN_HELP_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';

// Confluence page whose child pages are the project pages (titled `P-<PROJECT>`).
const CONFLUENCE_PROJECTS_PAGE = {
  url: 'https://stellaint.atlassian.net/wiki/spaces/AIL/pages/1626701832/BMAD-DOMAIN-KNOWLEDGE',
  id: '1626701832',
};
const PROJECT_PAGE_PREFIX = 'P-';
const OTHER_PROJECT = 'Other';

// Installed-project layout (relative to the project root).
const BMAD_DIR = '_bmad';
const OUTPUT_DIR = '_bmad-output';
const STELLA_OUTPUT_DIR = `${OUTPUT_DIR}/stella`;
const TOKEN_ENV_FILE = `${STELLA_OUTPUT_DIR}/.bmad-tokens/.env`;
const PROJECT_JSON_FILE = `${STELLA_OUTPUT_DIR}/project.json`;

// Lines the installer guarantees in .gitignore (each on its own line, added once).
const GITIGNORE_LINES = ['_bmad/', '_bmad-output/', '.claude/', '.env'];
const GITIGNORE_HEADER = '# BMad-Stella (added by the installer)';

// v4 leftovers removed on every install; `_bmad/` is removed on a re-run only.
const V4_LEFTOVERS = ['.bmad-core', 'bmad-docs', '.claude/commands/BMad'];

// BMad install flags (user decisions). Project name and user name are filled at run time.
const BMAD_INSTALL_FLAGS = {
  tools: 'claude-code',
  modules: 'bmm',
  communicationLanguage: 'English',
  documentOutputLanguage: 'English',
  outputFolder: OUTPUT_DIR,
  userSkillLevel: 'intermediate',
  projectKnowledge: 'docs',
};
const USER_NAME_FALLBACK = 'stella-dev';

const MIN_NODE = { major: 20, minor: 10 };

// ---- Stella layer (Task 11) ----
const STELLA_CUSTOM_DIR = `${BMAD_DIR}/custom/stella`; // checklists, utils, friction.json, guard.json
const CLAUDE_DIR = '.claude';
const CLAUDE_SKILLS_DIR = `${CLAUDE_DIR}/skills`;
const STELLA_CLAUDE_DIR = `${CLAUDE_DIR}/stella`; // project hooks live in .claude/stella/hooks/
const STELLA_HOOKS_DIR = `${STELLA_CLAUDE_DIR}/hooks`;
const SETTINGS_LOCAL = `${CLAUDE_DIR}/settings.local.json`;

const STELLA_SKILLS = [
  'stella-build',
  'caveman',
  'stella-security',
  'stella-pr-review',
  'stella-domain-expert',
  'stella-project-context',
];

// Project-level hooks copied to .claude/stella/hooks/<name>/ and registered in
// settings.local.json. The memory hook is deliberately absent (out of scope).
const PROJECT_HOOKS = [
  {
    name: 'friction-logger',
    events: {
      SessionStart: { file: 'session-start.js' },
      SessionEnd: { file: 'session-end.js' },
    },
  },
  {
    name: 'pr-review-guard',
    events: {
      PreToolUse: { file: 'pre-tool-use.js', matcher: 'Edit|MultiEdit|Write|Bash|PowerShell' },
    },
  },
  {
    name: 'personalization-inject',
    events: {
      UserPromptExpansion: { file: 'user-prompt-expansion.js' },
    },
  },
];

// Folders under _bmad-output/stella/ created when missing (never emptied).
const OUTPUT_FOLDERS = ['domain-knowledge', 'reviewer', 'bmad-logs', 'cache/jira', 'memory/.state'];

const FRICTION_DEFAULTS = { triggerStatuses: ['done'] };
const GUARD_DEFAULTS = { enabled: true };

// Written next to our hooks and helpers so Node runs them as CommonJS even when
// the host project's package.json declares "type": "module" (nearest package.json wins).
const COMMONJS_PACKAGE_JSON = '{\n  "type": "commonjs"\n}\n';

module.exports = {
  STELLA_CUSTOM_DIR,
  CLAUDE_DIR,
  CLAUDE_SKILLS_DIR,
  STELLA_CLAUDE_DIR,
  STELLA_HOOKS_DIR,
  SETTINGS_LOCAL,
  STELLA_SKILLS,
  PROJECT_HOOKS,
  OUTPUT_FOLDERS,
  FRICTION_DEFAULTS,
  GUARD_DEFAULTS,
  BMAD_VERSION,
  BMAD_PACKAGE,
  JIRA_BASE_URL,
  TOKEN_HELP_URL,
  CONFLUENCE_PROJECTS_PAGE,
  PROJECT_PAGE_PREFIX,
  OTHER_PROJECT,
  BMAD_DIR,
  OUTPUT_DIR,
  STELLA_OUTPUT_DIR,
  TOKEN_ENV_FILE,
  PROJECT_JSON_FILE,
  GITIGNORE_LINES,
  GITIGNORE_HEADER,
  V4_LEFTOVERS,
  BMAD_INSTALL_FLAGS,
  USER_NAME_FALLBACK,
  MIN_NODE,
  COMMONJS_PACKAGE_JSON,
};
