'use strict';

// Guard state — "which guarded skill is active in this session?"
// Two skills are guarded: stella-pr-review and stella-investigate. At most one is
// active at a time. Derived from the session transcript, never from a sentinel the
// agent could forget. Incremental: a per-session cache stores how many transcript
// lines were already scanned and the state they produced, so each tool call only
// reads the new tail.

const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths');

const REVIEW_SKILL = 'stella-pr-review';
const INVESTIGATE_SKILL = 'stella-investigate';

// START markers — exactly two per skill (user decision, v6 migration):
//   1. the user typed the skill command (Claude Code records it as
//      <command-name>/stella-pr-review</command-name>, or as raw text)
//   2. Claude Code launched the skill (a `Skill` tool call naming it)
// A Read of the skill file, or the name in prose, is NOT a start.
const COMMAND_TAG_RE = /<command-name>\/?stella-pr-review<\/command-name>/i;
const COMMAND_TEXT_RE = /^\s*\/stella-pr-review(?:\s|$)/i;
// stella-investigate also ships in the plugin, where the command carries the
// plugin name in front: /bmad-stella:stella-investigate
const INVESTIGATE_TAG_RE = /<command-name>\/?(?:[a-z0-9-]+:)?stella-investigate<\/command-name>/i;
const INVESTIGATE_TEXT_RE = /^\s*\/(?:[a-z0-9-]+:)?stella-investigate(?:\s|$)/i;
const INVESTIGATE_SKILL_RE = /^(?:[a-z0-9-]+:)?stella-investigate$/i;

// END markers
const EXIT_RE = /(^|\n)\s*\*exit\b/i;
// any other BMad / Stella skill command
const OTHER_COMMAND_TAG_RE =
  /<command-name>\/?(?:bmad|stella)-(?!pr-review<)[^<]+<\/command-name>/i;
const OTHER_COMMAND_TEXT_RE = /^\s*\/(?:bmad|stella)-(?!pr-review(?:\s|$))\S+/i;
const OTHER_SKILL_RE = /^(?:bmad|stella)-(?!pr-review$)/i;
// a PR review ends when the report is written: <reviewer>/<review-folder>/review.md
const FINDINGS_FILE_RE = new RegExp(
  `(^|${paths.SEP})${paths.REVIEWER_RE_PART}${paths.SEP}(?!\\.scratch${paths.SEP})[^\\\\/]+${paths.SEP}review\\.md$`,
);
// stella-investigate only: the user lets test and repro commands run (dev)
const ALLOW_RUN_RE = /(^|\n)\s*\*allow-run\b/i;

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

/**
 * What one transcript line means for the guard.
 * @returns {null | {kind: 'start', skill: string} | {kind: 'end'} | {kind: 'review-written'} | {kind: 'allow-run'}}
 */
function classify(line) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (obj.type === 'user') {
    if (obj.isMeta) return null; // injected skill bodies, not the human
    const c = userText(obj.message && obj.message.content);
    if (!c) return null;
    if (COMMAND_TAG_RE.test(c) || COMMAND_TEXT_RE.test(c)) {
      return { kind: 'start', skill: REVIEW_SKILL };
    }
    if (INVESTIGATE_TAG_RE.test(c) || INVESTIGATE_TEXT_RE.test(c)) {
      return { kind: 'start', skill: INVESTIGATE_SKILL };
    }
    if (OTHER_COMMAND_TAG_RE.test(c) || OTHER_COMMAND_TEXT_RE.test(c)) return { kind: 'end' };
    if (EXIT_RE.test(c)) return { kind: 'end' };
    if (ALLOW_RUN_RE.test(c)) return { kind: 'allow-run' };
    return null;
  }
  if (obj.type === 'assistant') {
    const content = obj.message && obj.message.content;
    if (!Array.isArray(content)) return null;
    for (const block of content) {
      if (!block || block.type !== 'tool_use' || !block.input) continue;
      if (block.name === 'Skill') {
        const skill = String(block.input.skill || '').trim();
        if (skill.toLowerCase() === REVIEW_SKILL) return { kind: 'start', skill: REVIEW_SKILL };
        if (INVESTIGATE_SKILL_RE.test(skill)) return { kind: 'start', skill: INVESTIGATE_SKILL };
        if (OTHER_SKILL_RE.test(skill)) return { kind: 'end' };
        continue;
      }
      const fp = String(block.input.file_path || '').replaceAll('\\', '/');
      if (block.name === 'Write' && FINDINGS_FILE_RE.test(fp)) return { kind: 'review-written' };
    }
  }
  return null;
}

// The PR review's view of one line: 'start' | 'end' | null. Another guarded skill
// starting ends the review, like any other skill command does.
function classifyLine(line) {
  const mark = classify(line);
  if (!mark) return null;
  if (mark.kind === 'start') return mark.skill === REVIEW_SKILL ? 'start' : 'end';
  if (mark.kind === 'end' || mark.kind === 'review-written') return 'end';
  return null;
}

function cachePath(root, sessionId) {
  const safe = String(sessionId).replaceAll(/[^A-Za-z0-9_-]/g, '_');
  return path.join(paths.stateDir(root), `${safe}.json`);
}

function readCache(file) {
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof c.scannedLines === 'number' && typeof c.active === 'boolean') {
      // caches written before stella-investigate existed carry no skill name
      const skill = c.active ? c.skill || REVIEW_SKILL : null;
      return {
        scannedLines: c.scannedLines,
        active: c.active,
        skill,
        allowRun: c.allowRun === true,
      };
    }
  } catch {
    /* missing or corrupt */
  }
  return { scannedLines: 0, active: false, skill: null, allowRun: false };
}

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const TMP_RE = /\.json\.tmp\.\d+$/;

function writeCache(file, cache) {
  const tmp = `${file}.tmp.${process.pid}`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(cache));
    fs.renameSync(tmp, file);
  } catch {
    // Parallel tool calls run parallel hooks; on Windows the rename can lose the
    // race. The cache is an optimisation only, but the temp file must not stay.
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* already gone */
    }
  }
  pruneCaches(path.dirname(file), file);
}

/**
 * Housekeeping for reviewer/.state: session caches older than 7 days and temp
 * files left by other hook processes are removed. The current session's file,
 * this process's temp file and anything else (guard-debug.log) are kept.
 */
function pruneCaches(dir, keep, now = Date.now()) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  const ownTmp = `.tmp.${process.pid}`;
  for (const name of names) {
    const full = path.join(dir, name);
    if (full === keep) continue;
    try {
      if (TMP_RE.test(name)) {
        if (!name.endsWith(ownTmp)) fs.unlinkSync(full);
      } else if (name.endsWith('.json') && now - fs.statSync(full).mtimeMs > CACHE_MAX_AGE_MS) {
        fs.unlinkSync(full);
      }
    } catch {
      /* best effort */
    }
  }
}

function scratchDir(root) {
  return paths.scratchDir(root);
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
 * @returns {{active: boolean, justStarted: boolean, justEnded: boolean, skill: string|null, allowRun: boolean}}
 *   `active`, `justStarted` and `justEnded` describe the PR review only (its scratch
 *   sandbox depends on them). `skill` names whichever guarded skill is active.
 */
function reviewState(root, sessionId, transcriptPath) {
  const none = {
    active: false,
    justStarted: false,
    justEnded: false,
    skill: null,
    allowRun: false,
  };
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return none;

  const file = cachePath(root, sessionId);
  const cache = readCache(file);

  const lines = fs.readFileSync(transcriptPath, 'utf8').split(/\r?\n/);
  // A transcript that ends with a line break gives one empty last element. It is
  // not a line: counting it would make the next scan skip the first new line.
  if (lines.at(-1) === '') lines.pop();
  // Transcript was replaced/truncated (new session file reused id) -> rescan from 0
  const from = lines.length >= cache.scannedLines ? cache.scannedLines : 0;
  const beforeSkill = from === 0 ? null : cache.skill;
  let skill = beforeSkill;
  let allowRun = from === 0 ? false : cache.allowRun;

  for (let i = from; i < lines.length; i++) {
    if (!lines[i]) continue;
    const mark = classify(lines[i]);
    if (!mark) continue;
    if (mark.kind === 'start') {
      skill = mark.skill;
      allowRun = false;
    } else if (mark.kind === 'end' || (mark.kind === 'review-written' && skill === REVIEW_SKILL)) {
      skill = null;
      allowRun = false;
    } else if (mark.kind === 'allow-run' && skill === INVESTIGATE_SKILL) {
      allowRun = true;
    }
  }

  writeCache(file, { scannedLines: lines.length, active: skill !== null, skill, allowRun });
  const before = beforeSkill === REVIEW_SKILL;
  const active = skill === REVIEW_SKILL;
  return { active, justStarted: active && !before, justEnded: before && !active, skill, allowRun };
}

/** @deprecated kept for callers that only need the boolean */
function isReviewActive(root, sessionId, transcriptPath) {
  return reviewState(root, sessionId, transcriptPath).active;
}

module.exports = {
  reviewState,
  isReviewActive,
  classify,
  classifyLine,
  scratchDir,
  cleanupScratch,
  cachePath,
  pruneCaches,
  CACHE_MAX_AGE_MS,
  REVIEW_SKILL,
  INVESTIGATE_SKILL,
};
