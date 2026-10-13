'use strict';

const fs = require('node:fs');

// Spec-file readers for the friction logger (BMad v6 `spec-*.md`).
// plan_id resolution order: JIRA key leading the spec slug -> whole slug.
// bmad-build names specs `spec-{slug}.md` and leads the slug with the ticket id
// when the intent carried one (e.g. spec-LEADRSC-4699-digest-delivery.md).

const JIRA_KEY_RE = /^([A-Za-z][A-Za-z0-9]*-\d+)/;

function resolvePlanId(planFileAbsPath, fileName) {
  const stem = fileName.replace(/\.md$/i, '').replace(/^spec-/i, '');
  const jira = stem.match(JIRA_KEY_RE);
  return sanitizeId(jira ? jira[1] : stem);
}

// Frontmatter `status:` — draft | ready-for-dev | in-progress | in-review | done.
// Reads only the leading YAML block; quotes are optional.
function readStatus(planFileAbsPath) {
  let text;
  try {
    text = fs.readFileSync(planFileAbsPath, 'utf8');
  } catch {
    return null;
  }
  const normalized = text.replaceAll('\r\n', '\n');
  if (!normalized.startsWith('---\n')) return null;
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) return null;
  const frontmatter = normalized.slice(4, end);
  const m = frontmatter.match(/^status:[ \t]*['"]?([^'"\n#]+?)['"]?[ \t]*(?:#.*)?$/m);
  return m ? m[1].trim() : null;
}

// plan_id becomes the tracker key AND the output folder name — keep it fs-safe.
function sanitizeId(id) {
  return id.replaceAll(/[^A-Za-z0-9._-]+/g, '-').replaceAll(/^-+|-+$/g, '') || 'unknown-plan';
}

module.exports = { resolvePlanId, readStatus };
