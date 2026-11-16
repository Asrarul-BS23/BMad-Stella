'use strict';

// Migration Task 7 — plain Claude Code skills (caveman) and the security checklists:
// valid frontmatter, name = folder, no v4 strings, the paths and rules the skills
// rely on, and the v4 drafts gone. stella-security is retired (2026-11-10): its
// checklists run in stella-build's security review layer.

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const SKILLS = path.join(REPO, 'stella', 'skills');
const CHECKLISTS = path.join(REPO, 'stella', 'checklists');

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

// ---- frontmatter ----
const frontmatter = (text) => {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const name = m[1].match(/^name:\s*(\S+)\s*$/m);
  const desc = m[1].match(/^description:\s*(>?)\s*$/m) || m[1].match(/^description:\s*(\S.*)$/m);
  return { name: name && name[1], hasDescription: Boolean(desc) };
};

const V4 =
  /bmad-docs|\.bmad-core|bmad-core|BMad:agents|BMad:tasks|BMad:caveman|Dev Agent Record|core-config\.yaml/;

for (const skill of ['caveman']) {
  const file = path.join(SKILLS, skill, 'SKILL.md');
  ok(fs.existsSync(file), `${skill}: SKILL.md exists`);
  if (!fs.existsSync(file)) continue;
  const text = read(file);
  const fm = frontmatter(text);
  ok(fm !== null, `${skill}: frontmatter block present`);
  ok(fm && fm.name === skill, `${skill}: frontmatter name equals folder name`);
  ok(fm && fm.hasDescription, `${skill}: description present`);
  ok(!V4.test(text), `${skill}: no v4 strings`);
  ok(!text.includes('\r\n'), `${skill}: LF line endings`);
  const others = fs.readdirSync(path.join(SKILLS, skill)).filter((f) => f !== 'SKILL.md');
  ok(others.length === 0, `${skill}: folder holds SKILL.md only (${others.join(', ')})`);
}

// ---- caveman ----
const caveman = read(SKILLS, 'caveman', 'SKILL.md');
ok(/\/caveman stop/.test(caveman), 'caveman: /caveman stop rule');
ok(/stop caveman/.test(caveman) && /normal mode/.test(caveman), 'caveman: off phrases');
for (const level of ['lite', 'full', 'ultra']) {
  ok(new RegExp(`\\*\\*${level}\\*\\*`).test(caveman), `caveman: level ${level} in the table`);
}
ok(!/wenyan|文言/.test(caveman), 'caveman: wenyan levels dropped');
ok(
  /## Auto-Clarity/.test(caveman) && /Security warnings/.test(caveman),
  'caveman: auto-clarity kept',
);
ok(/Code blocks unchanged/.test(caveman), 'caveman: code blocks untouched rule');

// ---- stella-security: retired ----
ok(!fs.existsSync(path.join(SKILLS, 'stella-security')), 'stella-security: skill folder removed');

// ---- checklists ----
for (const name of ['backend-security.md', 'frontend-security.md']) {
  const file = path.join(CHECKLISTS, name);
  ok(fs.existsSync(file), `checklists: ${name} at stella/checklists`);
  if (fs.existsSync(file)) {
    const text = read(file);
    ok(!V4.test(text), `checklists: ${name} has no v4 strings`);
    ok(
      /\[\[LLM:/.test(text) && /- \[ \]/.test(text),
      `checklists: ${name} keeps its LLM blocks and items`,
    );
  }
}
ok(!fs.existsSync(path.join(REPO, 'stella', 'overrides')), 'checklists: stella/overrides removed');

// ---- drafts gone ----
for (const draft of ['caveman/caveman.draft.md', 'caveman/caveman-compress.draft.md']) {
  ok(!fs.existsSync(path.join(SKILLS, draft)), `drafts: ${draft} deleted`);
}
ok(!fs.existsSync(path.join(SKILLS, 'caveman-compress')), 'drafts: no caveman-compress skill');

console.log(`skills: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`);
process.exit(fails ? 1 : 0);
