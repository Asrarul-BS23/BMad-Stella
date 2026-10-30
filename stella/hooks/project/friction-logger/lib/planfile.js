'use strict';

const fs = require('node:fs');

// Spec-file readers for the friction logger (BMad v6 `spec-*.md`).
// plan_id resolution order: JIRA key leading the spec slug -> whole slug.
// stella-build (copy of bmad-build) names specs `spec-{slug}.md` and leads the slug with the ticket id
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

// One frontmatter scalar (`key: value`), quotes optional, trailing comment ignored.
function readFrontmatterValue(planFileAbsPath, key) {
  let text;
  try {
    text = fs.readFileSync(planFileAbsPath, 'utf8');
  } catch {
    return '';
  }
  const normalized = text.replaceAll('\r\n', '\n');
  if (!normalized.startsWith('---\n')) return '';
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) return '';
  const frontmatter = normalized.slice(4, end);
  const line = new RegExp(String.raw`^${key}:[ \t]*(.*)$`, 'm').exec(frontmatter);
  if (!line) return '';
  let value = line[1].trim();
  const quoted = /^(['"])(.*)\1/.exec(value);
  if (quoted) value = quoted[2];
  else value = value.replace(/\s+#.*$/, '');
  return value.trim();
}

// How people see a plan: the Jira key in upper case (from the spec's `jira_key`, else from the
// plan id when it is a key), or the plan id itself for a spec written from raw text; and the
// spec's `title` without that key repeated at its start. plan_id itself is never changed.
function describePlan(planFileAbsPath, planId) {
  const fromFrontmatter = readFrontmatterValue(planFileAbsPath, 'jira_key');
  let displayId = planId;
  if (fromFrontmatter && JIRA_KEY_RE.test(fromFrontmatter))
    displayId = fromFrontmatter.toUpperCase();
  else if (new RegExp(`${JIRA_KEY_RE.source}$`).test(planId)) displayId = planId.toUpperCase();

  let title = readFrontmatterValue(planFileAbsPath, 'title');
  const escaped = displayId.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  title = title.replace(new RegExp(String.raw`^${escaped}(?![A-Za-z0-9])[\s:\-–—]*`, 'i'), '');
  return { displayId, title: title.trim() };
}

// plan_id becomes the tracker key AND the output folder name — keep it fs-safe.
function sanitizeId(id) {
  return id.replaceAll(/[^A-Za-z0-9._-]+/g, '-').replaceAll(/^-+|-+$/g, '') || 'unknown-plan';
}

module.exports = { resolvePlanId, readStatus, describePlan };
