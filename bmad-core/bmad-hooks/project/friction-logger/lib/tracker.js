'use strict';

const fs = require('node:fs');
const path = require('node:path');

// plan-tracker.json — bookkeeping for the friction logger.
// Shape (locked, no version field):
// { "plans": { "<plan_id>": {
//     planFile, analyzed, generationCount, analysisAttempts,
//     sessions: [ { sessionId, agents[], transcript, endedAt, endLine } ] } } }
// analysisAttempts = consecutive failed LLM analyses for the CURRENT content.
// Reset to 0 whenever analyzed flips to false (new content = fresh chances).

const GROWTH_USER_THRESHOLD = 2; // toggle analyzed only when growth has MORE than this many user-type lines

function trackerPath(cwd) {
  return path.join(cwd, 'bmad-docs', 'bmad-logs', 'plan-tracker.json');
}

function readTracker(cwd) {
  try {
    const parsed = JSON.parse(fs.readFileSync(trackerPath(cwd), 'utf8'));
    if (parsed && typeof parsed.plans === 'object' && parsed.plans !== null) return parsed;
  } catch {
    // missing or corrupt -> fresh
  }
  return { plans: {} };
}

// Atomic write: tmp + rename so concurrent readers never see a torn file.
// The tmp name carries the pid so a concurrent SessionEnd hook and the worker
// never collide on the same tmp file. On Windows, rename over a file another
// process is momentarily reading fails with EPERM/EBUSY — retry with backoff
// (10 tries, 20ms doubling, capped at 200ms: ~1.5s worst case).
const RENAME_RETRIES = 10;
const RENAME_BACKOFF_MS = 20;
const RENAME_BACKOFF_CAP_MS = 200;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeTracker(cwd, tracker) {
  const target = trackerPath(cwd);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(tracker, null, 2));
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, target);
      return;
    } catch (error) {
      const transient = error.code === 'EPERM' || error.code === 'EBUSY';
      if (!transient || attempt >= RENAME_RETRIES) {
        try {
          fs.unlinkSync(tmp); // never leave stray tmp files behind
        } catch {
          /* ignore */
        }
        throw error;
      }
      sleepSync(Math.min(RENAME_BACKOFF_MS * 2 ** attempt, RENAME_BACKOFF_CAP_MS));
    }
  }
}

// Upsert one (plan, session) observation. Returns a short outcome string for debug logging.
//
// Locked rules:
// - new session            -> push + analyzed=false
// - resumed, endLine grew  -> inspect ONLY the growth region; count "type":"user"
//                             lines; analyzed=false iff userCount > 2;
//                             always advance endLine + endedAt
// - resumed, no growth     -> refresh endedAt only
// - agents merged by set-union on every observation
function upsertSession(tracker, planId, planFileRel, session, growthUserCount) {
  let entry = tracker.plans[planId];
  if (!entry) {
    entry = { planFile: planFileRel, analyzed: false, generationCount: 0, sessions: [] };
    tracker.plans[planId] = entry;
  }
  entry.planFile = planFileRel;
  if (typeof entry.generationCount !== 'number') entry.generationCount = 0;

  const now = new Date().toISOString();
  const existing = entry.sessions.find((s) => s.sessionId === session.sessionId);

  if (!existing) {
    entry.sessions.push({
      sessionId: session.sessionId,
      agents: [...session.agents],
      transcript: session.transcript,
      endedAt: now,
      endLine: session.endLine,
    });
    entry.analyzed = false;
    entry.analysisAttempts = 0;
    return 'new-session -> analyzed=false';
  }

  existing.agents = [...new Set([...existing.agents, ...session.agents])];
  existing.transcript = session.transcript || existing.transcript;

  if (session.endLine > existing.endLine) {
    existing.endLine = session.endLine;
    existing.endedAt = now;
    if (growthUserCount > GROWTH_USER_THRESHOLD) {
      entry.analyzed = false;
      entry.analysisAttempts = 0;
      return `growth userCount=${growthUserCount} > ${GROWTH_USER_THRESHOLD} -> analyzed=false`;
    }
    return `growth userCount=${growthUserCount} <= ${GROWTH_USER_THRESHOLD} -> no toggle`;
  }

  existing.endedAt = now;
  return 'no growth -> endedAt refreshed only';
}

module.exports = { readTracker, writeTracker, upsertSession, trackerPath, GROWTH_USER_THRESHOLD };
