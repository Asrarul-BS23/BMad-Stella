'use strict';

// pr-review guard — "is a PR review active in this session?"
// Derived from the session transcript, never from a sentinel the agent could
// forget. Incremental: a per-session cache stores how many transcript lines
// were already scanned and the state they produced, so each tool call only
// reads the new tail.

const fs = require('node:fs');
const path = require('node:path');

// Review START markers — several, because the agent can load the task in
// different ways (seen in the wild: `cd … && cat .bmad-core/tasks/review-pr.md`
// via Bash instead of the Read tool).
const DIRECT_COMMAND_RE = /<command-name>\/?bmad:tasks:review-pr<\/command-name>/i;
const USER_PR_REVIEW_RE = /(^|\n)\s*\*pr-review\b/i;
const TASK_FILE_RE = /[\\/]tasks[\\/]review-pr\.md$/i;
const TASK_FILE_IN_CMD_RE = /[\\/]tasks[\\/]review-pr\.md(\s|$|["'])/i;
// Review END markers
const EXIT_RE = /(^|\n)\s*\*exit\b/i;
const OTHER_COMMAND_RE =
  /<command-name>\/?bmad:(agents|tasks):(?!review-pr<)[^<]+<\/command-name>/i;
// review ends when the report is written: bmad-docs/reviewer/<review-folder>/review.md
const FINDINGS_FILE_RE =
  /(^|[\\/])bmad-docs[\\/]reviewer[\\/](?!\.scratch[\\/])[^\\/]+[\\/]review\.md$/;
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

// User message text, whether content is a plain string or an array of blocks.
function userText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n');
  }
  return '';
}

// Returns 'start' | 'end' | null for one transcript line.
function classifyLine(line) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (obj.type === 'user') {
    if (obj.isMeta) return null; // injected agent/skill bodies, not the human
    const c = userText(obj.message && obj.message.content);
    if (!c) return null;
    if (DIRECT_COMMAND_RE.test(c)) return 'start';
    if (OTHER_COMMAND_RE.test(c)) return 'end';
    if (EXIT_RE.test(c)) return 'end';
    if (USER_PR_REVIEW_RE.test(c)) return 'start';
    return null;
  }
  if (obj.type === 'assistant') {
    const content = obj.message && obj.message.content;
    if (!Array.isArray(content)) return null;
    for (const block of content) {
      if (!block || block.type !== 'tool_use' || !block.input) continue;
      const fp = String(block.input.file_path || '').replaceAll('\\', '/');
      if (block.name === 'Read' && TASK_FILE_RE.test(fp)) return 'start';
      if (
        SHELL_TOOLS.has(block.name) &&
        TASK_FILE_IN_CMD_RE.test(String(block.input.command || ''))
      )
        return 'start';
      if (block.name === 'Write' && FINDINGS_FILE_RE.test(fp)) return 'end';
    }
  }
  return null;
}

function cachePath(root, sessionId) {
  const safe = String(sessionId).replaceAll(/[^A-Za-z0-9_-]/g, '_');
  return path.join(root, 'bmad-docs', 'bmad-logs', '.pr-review-guard', `${safe}.json`);
}

function readCache(file) {
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof c.scannedLines === 'number' && typeof c.active === 'boolean') return c;
  } catch {
    /* missing or corrupt */
  }
  return { scannedLines: 0, active: false };
}

function writeCache(file, cache) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(cache));
    fs.renameSync(tmp, file);
  } catch {
    /* cache is an optimisation only */
  }
}

function scratchDir(root) {
  return path.join(root, 'bmad-docs', 'reviewer', '.scratch');
}

// Wipe the scratch sandbox. Called when a review starts (clean slate) and when
// it ends (nothing left behind). Never throws.
function cleanupScratch(root) {
  try {
    fs.rmSync(scratchDir(root), { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

/**
 * @param {string} root        BMad project root
 * @param {string} sessionId
 * @param {string} transcriptPath
 * @returns {{active: boolean, justStarted: boolean, justEnded: boolean}}
 */
function reviewState(root, sessionId, transcriptPath) {
  const none = { active: false, justStarted: false, justEnded: false };
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return none;

  const file = cachePath(root, sessionId);
  const cache = readCache(file);

  const lines = fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/);
  // Transcript was replaced/truncated (new session file reused id) -> rescan from 0
  const from = lines.length >= cache.scannedLines ? cache.scannedLines : 0;
  const before = from === 0 ? false : cache.active;
  let active = before;

  for (let i = from; i < lines.length; i++) {
    if (!lines[i]) continue;
    const mark = classifyLine(lines[i]);
    if (mark === 'start') active = true;
    else if (mark === 'end') active = false;
  }

  writeCache(file, { scannedLines: lines.length, active });
  return { active, justStarted: active && !before, justEnded: before && !active };
}

/** @deprecated kept for callers that only need the boolean */
function isReviewActive(root, sessionId, transcriptPath) {
  return reviewState(root, sessionId, transcriptPath).active;
}

module.exports = { reviewState, isReviewActive, classifyLine, scratchDir, cleanupScratch };
