'use strict';

const fs = require('node:fs');

// Plan-file readers for the friction logger.
// plan_id resolution order (locked): Plan ID field inside the file (canonical,
// handles slug plans) -> filename JIRA-key prefix -> whole filename stem.

const JIRA_KEY_RE = /^([A-Za-z][A-Za-z0-9]*-\d+)/;

function resolvePlanId(planFileAbsPath, fileName) {
  const fromFile = readPlanIdField(planFileAbsPath);
  if (fromFile) return sanitizeId(fromFile);

  const stem = fileName.replace(/\.md$/i, '');
  const jira = stem.match(JIRA_KEY_RE);
  return sanitizeId(jira ? jira[1] : stem);
}

function readPlanIdField(planFileAbsPath) {
  let text;
  try {
    text = fs.readFileSync(planFileAbsPath, 'utf8');
  } catch {
    return null;
  }
  // Template writes: "- **Plan ID:** AIL-518" under Task Information
  const m = text.match(/\*\*Plan ID:?\*\*:?\s*([^\n*]+)/i);
  if (!m) return null;
  const value = m[1].trim();
  return value.length > 0 && value.length <= 100 ? value : null;
}

// Status choices (5, post ca87424): Draft - Awaiting Review | Approved |
// Ready for Review | Ready for Done | Blocked — Security
function readStatus(planFileAbsPath) {
  let text;
  try {
    text = fs.readFileSync(planFileAbsPath, 'utf8');
  } catch {
    return null;
  }
  const m = text.match(/^##\s*Status\s*\r?\n+([^\n#]+)/m);
  return m ? m[1].trim() : null;
}

// plan_id becomes the tracker key AND the output folder name — keep it fs-safe.
function sanitizeId(id) {
  return id.replaceAll(/[^A-Za-z0-9._-]+/g, '-').replaceAll(/^-+|-+$/g, '') || 'unknown-plan';
}

module.exports = { resolvePlanId, readStatus };
