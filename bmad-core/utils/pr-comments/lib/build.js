'use strict';

// pr-comments — pure functions: validate the findings JSON, map findings onto
// the PR diff, and build the single review payload. No I/O here.

const MARKER_RE = /<!--\s*bmad:(\d+)\s*-->/g;
const MAX_COMMENT_CHARS = 220;
const MAX_COMMENT_SENTENCES = 2;

const PR_URL_RE = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)\/?$/;

function parsePrUrl(url) {
  const m = PR_URL_RE.exec(String(url || '').trim());
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

/**
 * Validate the findings JSON written by review-pr. Throws with a plain message.
 */
function validateFindings(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('findings JSON is not an object');
  const pr = parsePrUrl(doc.pr);
  if (!pr) throw new Error(`"pr" is not a GitHub PR URL: ${doc.pr}`);
  if (doc.owner !== pr.owner || doc.repo !== pr.repo || Number(doc.number) !== pr.number) {
    throw new Error('"owner"/"repo"/"number" do not match "pr"');
  }
  if (!/^[0-9a-f]{7,40}$/i.test(String(doc.headSha || ''))) {
    throw new Error('"headSha" must be a 7–40 char hex SHA');
  }
  if (!Array.isArray(doc.findings)) throw new Error('"findings" must be an array');
  for (const f of doc.findings) {
    if (!Number.isInteger(f.id) || f.id < 1)
      throw new Error(`finding without a positive integer "id": ${JSON.stringify(f).slice(0, 80)}`);
    if (typeof f.what !== 'string' || !f.what.trim())
      throw new Error(`finding ${f.id}: "what" is required`);
    if (typeof f.why !== 'string' || !f.why.trim())
      throw new Error(`finding ${f.id}: "why" is required`);
    if (f.path !== null && f.path !== undefined && typeof f.path !== 'string')
      throw new Error(`finding ${f.id}: "path" must be a string or null`);
    if (f.line !== null && f.line !== undefined && !Number.isInteger(f.line))
      throw new Error(`finding ${f.id}: "line" must be an integer or null`);
    if (f.startLine !== null && f.startLine !== undefined && !Number.isInteger(f.startLine))
      throw new Error(`finding ${f.id}: "startLine" must be an integer or null`);
  }
  return { ...doc, ...pr };
}

/**
 * Parse a unified diff into { path -> [ [newStart, newEnd], ... ] } for the
 * RIGHT side. Only lines inside these ranges can carry a review comment.
 */
function parseDiffRanges(diffText) {
  const ranges = new Map();
  let current = null;
  for (const line of String(diffText || '').split(/\r?\n/)) {
    const file = /^\+\+\+ b\/(.+)$/.exec(line);
    if (file) {
      current = file[1];
      if (!ranges.has(current)) ranges.set(current, []);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (count > 0) ranges.get(current).push([start, start + count - 1]);
    }
  }
  return ranges;
}

function lineInDiff(ranges, filePath, line) {
  const list = ranges.get(String(filePath || '').replaceAll('\\', '/'));
  if (!list) return false;
  return list.some(([a, b]) => line >= a && line <= b);
}

// Plain, short, human: "what — why". No markdown blocks, no labels, no fix.
function stripMarkdown(text) {
  return String(text || '')
    .replaceAll(/\*\*(.*?)\*\*/g, '$1')
    .replaceAll(/^\s*[-*]\s+/gm, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function sentenceCount(text) {
  return (text.match(/[.!?](\s|$)/g) || []).length || 1;
}

function buildCommentText(finding) {
  const whatRaw = stripMarkdown(finding.what);
  const whyRaw = stripMarkdown(finding.why);
  const what = whatRaw.replace(/[.\s]+$/, '');
  const why = whyRaw.replace(/[.\s]+$/, '');
  const text = `${what} — ${why}.`;
  // "what" and "why" are one sentence each; count them before joining so
  // "One. Two." + "Three." reads as three, not two.
  const sentences = sentenceCount(whatRaw) + sentenceCount(whyRaw);
  return {
    text,
    tooLong: text.length > MAX_COMMENT_CHARS || sentences > MAX_COMMENT_SENTENCES,
  };
}

function marker(id) {
  return `<!-- bmad:${id} -->`;
}

function extractMarkers(bodies) {
  const ids = new Set();
  for (const body of bodies) {
    for (const m of String(body || '').matchAll(MARKER_RE)) ids.add(Number(m[1]));
  }
  return ids;
}

/**
 * Build the review payload and a preview.
 * @param {object} doc          validated findings
 * @param {Map} diffRanges      from parseDiffRanges
 * @param {Set<number>} posted  finding ids already on the PR
 * @param {{submit?: boolean}} opts
 */
function buildReview(doc, diffRanges, posted, opts = {}) {
  const comments = [];
  const unattached = [];
  const skipped = [];
  const preview = [];

  for (const f of doc.findings) {
    const { text, tooLong } = buildCommentText(f);
    if (posted.has(f.id)) {
      skipped.push(f.id);
      preview.push({
        id: f.id,
        where: f.path ? `${f.path}:${f.line}` : '(summary)',
        text,
        status: 'already posted',
      });
      continue;
    }
    const path = f.path ? String(f.path).replaceAll('\\', '/') : null;
    const attachable = path && Number.isInteger(f.line) && lineInDiff(diffRanges, path, f.line);
    if (attachable) {
      const c = { path, line: f.line, side: 'RIGHT', body: `${text}\n${marker(f.id)}` };
      if (
        Number.isInteger(f.startLine) &&
        f.startLine < f.line &&
        lineInDiff(diffRanges, path, f.startLine)
      ) {
        c.start_line = f.startLine;
        c.start_side = 'RIGHT';
      }
      comments.push(c);
      preview.push({
        id: f.id,
        where: `${path}:${c.start_line ? `${c.start_line}-` : ''}${f.line}`,
        text,
        status: tooLong ? 'LONG' : 'ok',
      });
    } else {
      unattached.push({ f, text });
      preview.push({
        id: f.id,
        where: '(summary)',
        text,
        status: tooLong ? 'LONG' : path ? 'line not in diff → summary' : 'no line → summary',
      });
    }
  }

  const bodyLines = [`PR review (BMad) — ${stripMarkdown(doc.summary || '')}`.trim()];
  if (unattached.length > 0) {
    bodyLines.push('', 'Not tied to a single line:');
    for (const { f, text } of unattached) {
      const where = f.path ? `${f.path}: ` : '';
      bodyLines.push(`- ${where}${text} ${marker(f.id)}`);
    }
  }

  const payload = {
    commit_id: doc.headSha,
    body: bodyLines.join('\n'),
    comments,
  };
  if (opts.submit) payload.event = 'COMMENT'; // never APPROVE / REQUEST_CHANGES

  return {
    payload,
    preview,
    counts: {
      lineComments: comments.length,
      inSummary: unattached.length,
      skipped: skipped.length,
    },
    hasLong: preview.some((p) => p.status === 'LONG'),
    nothingToPost: comments.length === 0 && unattached.length === 0,
  };
}

module.exports = {
  parsePrUrl,
  validateFindings,
  parseDiffRanges,
  lineInDiff,
  buildCommentText,
  buildReview,
  extractMarkers,
  marker,
  MAX_COMMENT_CHARS,
  MAX_COMMENT_SENTENCES,
};
