'use strict';

const fs = require('node:fs');
const path = require('node:path');

// plan-tracker.json — bookkeeping for the friction logger.
// Shape (locked, no version field):
// { "plans": { "<plan_id>": {
//     planFile, analyzed, generationCount,
//     sessions: [ { sessionId, agents[], transcript, endedAt, endLine } ] } } }

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
function writeTracker(cwd, tracker) {
  const target = trackerPath(cwd);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(tracker, null, 2));
  fs.renameSync(tmp, target);
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
    return 'new-session -> analyzed=false';
  }

  existing.agents = [...new Set([...existing.agents, ...session.agents])];
  existing.transcript = session.transcript || existing.transcript;

  if (session.endLine > existing.endLine) {
    existing.endLine = session.endLine;
    existing.endedAt = now;
    if (growthUserCount > GROWTH_USER_THRESHOLD) {
      entry.analyzed = false;
      return `growth userCount=${growthUserCount} > ${GROWTH_USER_THRESHOLD} -> analyzed=false`;
    }
    return `growth userCount=${growthUserCount} <= ${GROWTH_USER_THRESHOLD} -> no toggle`;
  }

  existing.endedAt = now;
  return 'no growth -> endedAt refreshed only';
}

module.exports = { readTracker, writeTracker, upsertSession, trackerPath, GROWTH_USER_THRESHOLD };
