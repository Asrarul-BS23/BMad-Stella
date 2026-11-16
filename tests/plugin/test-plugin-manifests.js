'use strict';

// Plugin packaging guard — stella/ as a Claude Code plugin.
// Asserts the marketplace and plugin manifests stay consistent with each
// other, with package.json (version), with constants.js (hooks), and with
// the Agent Skills spec (claude.ai-safe frontmatter).

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

let failures = 0;
function check(label, ok, detail) {
  if (ok) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---- marketplace.json ----
const marketplace = readJson('.claude-plugin/marketplace.json');
check(
  'marketplace has name/owner/plugins',
  Boolean(marketplace.name && marketplace.owner && Array.isArray(marketplace.plugins)),
);

const entry = (marketplace.plugins || []).find((p) => p.name === 'bmad-stella');
check('marketplace lists plugin bmad-stella', Boolean(entry));
check('plugin source is ./stella', entry && entry.source === './stella');

// ---- plugin.json ----
const plugin = readJson('stella/.claude-plugin/plugin.json');
check('plugin.json name matches marketplace entry', entry && plugin.name === entry.name);
check(
  'plugin name is spec-valid (lowercase, digits, hyphens)',
  /^[a-z0-9]+(-[a-z0-9]+)*$/.test(plugin.name) && plugin.name.length <= 64,
);

const pkg = readJson('package.json');
check(
  'plugin version equals package.json version',
  plugin.version === pkg.version,
  `plugin ${plugin.version} vs package ${pkg.version}`,
);

// ---- hooks.json ----
const hooksFile = readJson('stella/hooks/hooks.json');
check(
  'hooks.json wraps events in top-level "hooks" key',
  Boolean(hooksFile.hooks) && typeof hooksFile.hooks === 'object',
);

const VAR = '${CLAUDE_PLUGIN_ROOT}';
for (const [event, entries] of Object.entries(hooksFile.hooks || {})) {
  for (const e of entries) {
    for (const h of e.hooks || []) {
      check(`${event} command is type "command"`, h.type === 'command');
      check(
        `${event} command is anchored to CLAUDE_PLUGIN_ROOT`,
        typeof h.command === 'string' && h.command.includes(VAR),
      );
      const m =
        typeof h.command === 'string' && h.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)/);
      const scriptRel = m && `stella/${m[1]}`;
      check(
        `${event} script exists (${scriptRel || 'unparsed command'})`,
        Boolean(scriptRel) && fs.existsSync(path.join(ROOT, scriptRel)),
      );
    }
  }
}

// Every hook the installer registers (constants.js PROJECT_HOOKS) must also be
// registered by the plugin, with the same matcher where one is set.
const { PROJECT_HOOKS } = require(path.join(ROOT, 'tools', 'installer', 'lib', 'constants.js'));
for (const hook of PROJECT_HOOKS) {
  for (const [event, spec] of Object.entries(hook.events)) {
    const entries = (hooksFile.hooks || {})[event] || [];
    const match = entries.find((e) =>
      (e.hooks || []).some((h) => h.command.includes(`/${hook.name}/${spec.file}`)),
    );
    check(`plugin registers ${hook.name} ${event} (${spec.file})`, Boolean(match));
    if (spec.matcher) {
      check(
        `plugin ${hook.name} ${event} keeps matcher`,
        match && match.matcher === spec.matcher,
        match && `got ${match.matcher}`,
      );
    }
  }
}

// ---- hooks run as CommonJS ----
const hooksPkg = readJson('stella/hooks/package.json');
check('stella/hooks/package.json forces commonjs', hooksPkg.type === 'commonjs');

// ---- skills: claude.ai-safe frontmatter ----
// Upload to claude.ai rejects unknown frontmatter fields; keep skills spec-only.
const SPEC_FIELDS = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
]);
// Claude Code-only fields a skill deliberately uses. Such a skill works in the
// plugin but cannot be uploaded to claude.ai as-is (phase 2 would strip these).
const KNOWN_CC_ONLY = { 'stella-project-context': ['disable-model-invocation'] };
const skillsDir = path.join(ROOT, 'stella', 'skills');
for (const dir of fs.readdirSync(skillsDir)) {
  const skillPath = path.join(skillsDir, dir, 'SKILL.md');
  if (!fs.existsSync(skillPath)) continue;
  const text = fs.readFileSync(skillPath, 'utf8');
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  check(`${dir}/SKILL.md has frontmatter`, Boolean(fm));
  if (!fm) continue;
  const keys = fm[1]
    .split(/\r?\n/)
    .filter((line) => /^[A-Za-z][\w-]*\s*:/.test(line))
    .map((line) => line.split(':')[0].trim());
  check(
    `${dir} frontmatter has name + description`,
    keys.includes('name') && keys.includes('description'),
  );
  const allowed = new Set(KNOWN_CC_ONLY[dir] || []);
  const unknown = keys.filter((k) => !SPEC_FIELDS.has(k) && !allowed.has(k));
  check(
    `${dir} frontmatter is claude.ai-safe`,
    unknown.length === 0,
    `unknown fields: ${unknown.join(', ')}`,
  );
  const nameLine = fm[1].split(/\r?\n/).find((l) => l.startsWith('name:'));
  const name =
    nameLine &&
    nameLine
      .slice(5)
      .trim()
      .replaceAll(/^['"]|['"]$/g, '');
  check(`${dir} frontmatter name matches folder`, name === dir, `name: ${name}`);
}

console.log(
  failures === 0 ? '\nAll plugin manifest checks passed.' : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
