'use strict';

// Migration Task 5 — Claude permission rules for the BMad v6 layout.
// Every helper has its allow rules in both shells, every Bash allow/deny has a
// PowerShell twin, no v4 path or old MCP server name survives in the active lists,
// and the retired rules are pruned from an existing settings.local.json.

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const FILE = path.join(REPO, 'tools', 'installer', 'lib', 'claude-permissions-manager.js');
const pm = require(FILE);

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

const allow = pm.getAllPermissions();
const deny = pm.getAllDenyPermissions();
const deprecated = pm.deprecatedPermissions;

// ---- helpers ----
for (const helper of ['jira-attachments', 'pr-comments']) {
  ok(allow.includes(`Bash(node _bmad/custom/stella/utils/${helper} *)`), `allow: Bash ${helper} *`);
  ok(
    allow.includes(`Bash(node _bmad/custom/stella/utils/${helper}/index.js *)`),
    `allow: Bash ${helper}/index.js *`,
  );
  ok(
    allow.includes(`PowerShell(node _bmad/custom/stella/utils/${helper} *)`),
    `allow: PowerShell ${helper} *`,
  );
}
ok(
  allow.includes('Bash(node _bmad/custom/stella/utils/jira-attachments)') &&
    allow.includes('PowerShell(node _bmad/custom/stella/utils/jira-attachments)'),
  'allow: bare jira-attachments (no args) in both shells',
);

// ---- v6 folders, uv, connector ----
ok(
  allow.includes('Read(_bmad/**)') &&
    allow.includes('Read(_bmad-output/**)') &&
    allow.includes('Read(AGENTS.md)'),
  'allow: Read _bmad, _bmad-output, AGENTS.md',
);
ok(allow.includes('Edit(_bmad-output/**)'), 'allow: Edit under _bmad-output');
ok(
  allow.includes('Bash(uv run *)') && allow.includes('PowerShell(uv run *)'),
  'allow: uv run in both shells (BMad render/config scripts)',
);
const CHECK = 'node .claude/skills/stella-project-context/scripts/check-context.js';
ok(
  allow.includes(`Bash(${CHECK})`) &&
    allow.includes(`Bash(${CHECK} *)`) &&
    allow.includes(`PowerShell(${CHECK})`) &&
    allow.includes(`PowerShell(${CHECK} *)`),
  'allow: project-context check script in both shells',
);
ok(
  allow.includes('mcp__claude_ai_Atlassian__getJiraIssue') &&
    allow.includes('mcp__claude_ai_Atlassian__addCommentToJiraIssue') &&
    allow.includes('mcp__claude_ai_Atlassian__getConfluencePage'),
  'allow: claude.ai Atlassian connector tools',
);
ok(
  allow.includes('mcp__atlassian__getJiraIssue') &&
    allow.includes('mcp__atlassian__addCommentToJiraIssue') &&
    allow.filter((r) => r.startsWith('mcp__atlassian__')).length === 6,
  'allow: per-project Atlassian MCP names (registered by the installer) allowed too',
);

// ---- twins ----
const bashAllow = allow.filter((r) => /^Bash\((gh|git|node _bmad|uv run|cd )/.test(r));
const missingTwins = bashAllow.filter((r) => !allow.includes(r.replace(/^Bash/, 'PowerShell')));
ok(
  missingTwins.length === 0,
  `twins: every Bash gh/git/helper/uv/cd allow has a PowerShell twin (${missingTwins.join(', ')})`,
);
const missingDenyTwins = deny
  .filter((r) => r.startsWith('Bash('))
  .filter((r) => !deny.includes(r.replace(/^Bash/, 'PowerShell')));
ok(missingDenyTwins.length === 0, 'twins: every Bash deny has a PowerShell twin');

// ---- deny list unchanged ----
for (const d of [
  'Bash(gh api)',
  'Bash(gh api *)',
  'Bash(gh pr comment *)',
  'Bash(gh pr review *)',
  'Bash(gh pr merge *)',
  'Bash(gh pr checkout *)',
]) {
  ok(deny.includes(d), `deny: ${d}`);
}
ok(
  !deny.some((r) => /git (commit|push|checkout)/.test(r)),
  'deny: git write commands deliberately not denied',
);

// ---- no v4 strings in the active lists ----
const stale = [...allow, ...deny].filter((r) => /bmad-docs|\.bmad-core|bmad-core/.test(r));
ok(
  stale.length === 0,
  `v4: no bmad-docs / .bmad-core rule in allow or deny (${stale.slice(0, 3).join(', ')})`,
);

// ---- retired rules are deprecated (pruned on re-install) ----
for (const old of [
  'Bash(node .bmad-core/utils/pr-comments *)',
  'Read(bmad-docs/**)',
  'Edit(bmad-docs/**)',
  'mcp__atlassian__getJiraIssue',
  'PowerShell(node .bmad-core/utils/jira-attachments *)',
]) {
  ok(deprecated.includes(old), `deprecated: ${old}`);
}
const { kept, removed } = pm.pruneDeprecatedPermissions([
  'Bash(gh pr view *)',
  'Read(bmad-docs/**)',
  'mcp__atlassian__fetch',
  'Bash(ls)',
]);
ok(kept.length === 2 && removed.length === 2, 'prune: v4 rules removed, current rules kept');

// ---- source hygiene (comments may explain history; rule strings may not carry v4 paths) ----
const ruleStrings = [...fs.readFileSync(FILE, 'utf8').matchAll(/^\s*'([^']+)',/gm)].map(
  (m) => m[1],
);
const activeV4 = ruleStrings
  .filter((r) => /bmad-docs|\.bmad-core|mcp__atlassian__/.test(r))
  .filter((r) => !deprecated.includes(r));
ok(
  activeV4.length === 0,
  `source: every v4 rule string is in the deprecated list only (${activeV4.slice(0, 3).join(', ')})`,
);

console.log(
  `utils permissions: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
