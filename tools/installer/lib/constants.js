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
// Atlassian credentials: one file per machine, under the home directory (user decision
// 2026-10-26). Parts are joined onto os.homedir() at run time.
const CREDENTIALS_FILE_PARTS = ['.claude', 'stella', 'credentials.env'];
const CREDENTIALS_FILE_LABEL = '~/.claude/stella/credentials.env';
// Pre-2026-10-26 project file: read once on install, then the folder is removed.
const PROJECT_TOKEN_DIR = `${STELLA_OUTPUT_DIR}/.bmad-tokens`;
const PROJECT_TOKEN_ENV_FILE = `${PROJECT_TOKEN_DIR}/.env`;
// v4 kept the same keys here; read once on upgrade, then removed with bmad-docs/.
const LEGACY_TOKEN_ENV_FILE = 'bmad-docs/.bmad-tokens/.env';
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
// BMad's render scripts declare `requires-python >= 3.11`. When no such Python is
// on PATH the installer adds a uv-managed one (system Python untouched).
const MIN_PYTHON = { major: 3, minor: 11 };
const PYTHON_INSTALL_VERSION = '3.12';
const UV_INSTALL_URL = 'https://docs.astral.sh/uv/getting-started/installation/';

// Atlassian's official remote MCP server, registered per project in Claude Code's
// local scope (as v4 did). The dev logs in once via /mcp in Claude Code.
const ATLASSIAN_MCP = {
  name: 'atlassian',
  transport: 'http',
  url: 'https://mcp.atlassian.com/v1/mcp',
};
const STALE_ATLASSIAN_MCP_URLS = ['https://mcp.atlassian.com/v1/sse']; // retired 2026-06-30

// ---- Stella layer (Task 11) ----
const STELLA_CUSTOM_DIR = `${BMAD_DIR}/custom/stella`; // checklists, utils, friction.json, guard.json
const CLAUDE_DIR = '.claude';
const CLAUDE_SKILLS_DIR = `${CLAUDE_DIR}/skills`;
const STELLA_CLAUDE_DIR = `${CLAUDE_DIR}/stella`; // project hooks live in .claude/stella/hooks/
const STELLA_HOOKS_DIR = `${STELLA_CLAUDE_DIR}/hooks`;
// Pre-v6 project-hook location. No longer written, but a prior install may still have
// registered commands under it in settings.local.json — cleaned up on re-install.
const LEGACY_BMAD_HOOKS_DIR = `${CLAUDE_DIR}/bmad-hooks`;
const SETTINGS_LOCAL = `${CLAUDE_DIR}/settings.local.json`;

const STELLA_SKILLS = [
  'stella-build',
  'caveman',
  'stella-security',
  'stella-pr-review',
  'stella-domain-expert',
  'stella-project-context',
];

// Official skills removed after the BMad install because a Stella version replaces
// them (bmad-build-auto only loops bmad-build). Re-runs reinstall BMad, so this
// runs every time. No official file is edited; the folders are simply not kept.
const BMAD_SKILLS_REMOVED = ['bmad-build', 'bmad-build-auto', 'bmad-project-context'];

// Project-level hooks copied to .claude/stella/hooks/<name>/ and registered in
// settings.local.json.
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
    name: 'memory',
    events: {
      // Checks for a new calendar day and spawns daily-job.js detached when so.
      UserPromptSubmit: { file: 'user-prompt-submit.js' },
      // Injects MEMORY.md + domain-map.md (verbatim, if present) once per session,
      // on stella-build kickoff only. Replaces personalization-inject, which is no
      // longer registered (source kept at stella/hooks/project/personalization-inject/,
      // unused).
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
  LEGACY_BMAD_HOOKS_DIR,
  SETTINGS_LOCAL,
  STELLA_SKILLS,
  BMAD_SKILLS_REMOVED,
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
  CREDENTIALS_FILE_PARTS,
  CREDENTIALS_FILE_LABEL,
  PROJECT_TOKEN_DIR,
  PROJECT_TOKEN_ENV_FILE,
  LEGACY_TOKEN_ENV_FILE,
  PROJECT_JSON_FILE,
  GITIGNORE_LINES,
  GITIGNORE_HEADER,
  V4_LEFTOVERS,
  BMAD_INSTALL_FLAGS,
  USER_NAME_FALLBACK,
  MIN_NODE,
  MIN_PYTHON,
  PYTHON_INSTALL_VERSION,
  UV_INSTALL_URL,
  ATLASSIAN_MCP,
  STALE_ATLASSIAN_MCP_URLS,
  COMMONJS_PACKAGE_JSON,
};
