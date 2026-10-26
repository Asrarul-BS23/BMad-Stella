'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { log } = require('./state');

// Reads a stella-build spec-*.md file. There is no "## Status" body heading and
// no "## Memory Signals" yaml block in the new spec format (spec-template.md) —
// status, title and jira_key all live in the frontmatter only, and the module
// tag that used to come from a planner-filled field is derived separately by
// daily-job.js from the spec's own `## Intent` content.

function readFrontmatterField(frontmatter, field) {
  const match = frontmatter.match(
    new RegExp(`^${field}:[ \\t]*['"]?([^'"\\n#]+?)['"]?[ \\t]*(?:#.*)?$`, 'm'),
  );
  return match ? match[1].trim() : null;
}

// Frontmatter only, CRLF-tolerant. `status:` choices (spec-template.md): draft |
// ready-for-dev | in-progress | in-review | done.
function readFrontmatter(content) {
  const normalized = content.replaceAll('\r\n', '\n');
  if (!normalized.startsWith('---\n')) return {};
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) return {};
  const frontmatter = normalized.slice(4, end);
  return {
    title: readFrontmatterField(frontmatter, 'title'),
    status: readFrontmatterField(frontmatter, 'status') || '',
    jiraKey: readFrontmatterField(frontmatter, 'jira_key'),
  };
}

const JIRA_KEY_RE = /^([A-Za-z][A-Za-z0-9]*-\d+)/;

function sanitizeId(id) {
  return id.replaceAll(/[^A-Za-z0-9._-]+/g, '-').replaceAll(/^-+|-+$/g, '') || 'unknown-spec';
}

// Plan identity: the frontmatter's own `jira_key` when present (canonical,
// exact case — e.g. "AIL-552") takes priority over deriving one from the
// filename, since `spec-ail-552-...md` lowercases it and can disagree with the
// frontmatter. Falls back to a Jira key fronting the filename slug, else the
// whole slug — same order friction-logger/lib/planfile.js uses for the same file.
function resolvePlanId(filePath, frontmatter) {
  if (frontmatter.jiraKey) return sanitizeId(frontmatter.jiraKey);
  const stem = path.basename(filePath, '.md').replace(/^spec-/i, '');
  const jira = stem.match(JIRA_KEY_RE);
  return sanitizeId(jira ? jira[1] : stem);
}

// The `## Intent` section inside <frozen-after-approval> — the one part every
// spec always has (oneshot route keeps only this + frontmatter + Implementation
// Notes), and the source the module tag is derived from now that no spec
// carries a module-tag field.
function parseIntent(content) {
  const match = content.match(
    /##\s+Intent\s*\n([\s\S]*?)(?=\n##\s+|\n<\/frozen-after-approval>|\s*$)/i,
  );
  return match ? match[1].trim() : '';
}

function parsePlanFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    const frontmatter = readFrontmatter(content);
    const planId = resolvePlanId(filePath, frontmatter);

    return {
      filePath,
      planId,
      content, // full text — passed to claude for lesson/module-tag extraction
      status: frontmatter.status,
      title: frontmatter.title,
      intent: parseIntent(content),
    };
  } catch (error) {
    log('plan-parser: failed to parse', { file: filePath, error: error.message });
    return null;
  }
}

module.exports = { parsePlanFile };
