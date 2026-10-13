'use strict';

// Friction logger — detached analysis WORKER.
// Spawned by session-start.js AFTER the cheap gates pass, so session startup is
// never delayed. Processes ALL fireable plans sequentially, then releases the
// fire-lock. Usage: node worker.js <projectCwd>

const fs = require('node:fs');
const path = require('node:path');

const cwd = process.argv[2];
if (!cwd) process.exit(0);

function lockPath(dir) {
  return path.join(dir, 'bmad-docs', 'bmad-logs', '.fire-lock');
}

// Last-resort logger that depends on nothing but node:fs. Used when a lib
// fails to load or the main body throws before/outside the normal logger —
// otherwise such a crash would leave a stuck lock and zero trace.
function emergencyLog(message) {
  try {
    const logsDir = path.join(cwd, 'bmad-docs', 'bmad-logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(
      path.join(logsDir, '.hook-debug.log'),
      `${new Date().toISOString()} [friction] worker: FATAL ${message}\n`,
    );
  } catch {
    /* even this must never throw */
  }
}

function releaseLock() {
  try {
    fs.unlinkSync(lockPath(cwd));
  } catch {
    /* already gone */
  }
}

// Guarded requires: a broken install (missing/invalid lib) must log + release
// the lock instead of dying silently before the try/finally below exists.
let makeLogger, readTracker, writeTracker, readStatus, buildScreenplays, callClaude;
let renderMarkdown, readLoggingConfig, publishReport, buildExtractionPrompt;
try {
  ({ makeLogger } = require('./lib/state'));
  ({ readTracker, writeTracker } = require('./lib/tracker'));
  ({ readStatus } = require('./lib/planfile'));
  ({ buildScreenplays } = require('./lib/reducer'));
  ({ callClaude } = require('./lib/llm'));
  ({ renderMarkdown } = require('./lib/render'));
  ({ readLoggingConfig } = require('./lib/config'));
  ({ publishReport } = require('./lib/confluence-publisher'));
  ({ buildExtractionPrompt } = require('./prompts/extract-friction'));
} catch (error) {
  emergencyLog(`require failed: ${error.message}`);
  releaseLock();
  process.exit(1);
}

const GENERATION_CAP = 2;
const PUBLISH_ATTEMPT_CAP = 3;
// Consecutive failed LLM analyses allowed for the same plan content. Without
// this, a persistently failing analysis (bad JSON, timeout) re-fired on every
// session start forever. Reset by tracker.js when new content arrives.
const ANALYSIS_ATTEMPT_CAP = 3;

// Heartbeat: refresh the lock's startedAt so session-start's 30-min stale
// check measures time since last progress, not since the worker began. A
// worker legitimately busy for >30 min (many plans × slow LLM) must not be
// mistaken for a dead one — that spawned a second concurrent worker.
function touchLock() {
  try {
    fs.writeFileSync(
      lockPath(cwd),
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    );
  } catch {
    /* lock may have been reclaimed — nothing useful to do */
  }
}

// Fire gates, cheap-first. LLM is called only after ALL pass. Per-plan isolation.
function evaluateGates(planId, entry, triggerStatuses) {
  if (entry.analyzed) return 'analyzed';
  if (entry.generationCount >= GENERATION_CAP) return 'generation-cap';
  if ((entry.analysisAttempts || 0) >= ANALYSIS_ATTEMPT_CAP) return 'analysis-cap';

  // agent completeness: ({planner, dev} ⊆ union) OR quick-dev
  const all = new Set();
  for (const s of entry.sessions) for (const a of s.agents || []) all.add(a);
  const complete = (all.has('planner') && all.has('dev')) || all.has('quick-dev');
  if (!complete) return `agents-incomplete [${[...all].join(',')}]`;

  const planFileAbs = path.join(cwd, entry.planFile);
  if (!fs.existsSync(planFileAbs)) return 'plan-file-missing';

  for (const s of entry.sessions) {
    if (!s.transcript || !fs.existsSync(s.transcript))
      return `transcript-missing (${s.sessionId.slice(0, 8)})`;
  }

  const status = readStatus(planFileAbs);
  if (!status || !triggerStatuses.has(status)) return `status="${status}"`;

  return null; // all gates pass
}

async function analyzePlan(planId, entry, log) {
  const planFileAbs = path.join(cwd, entry.planFile);
  const planText = fs.readFileSync(planFileAbs, 'utf8');
  const screenplays = buildScreenplays(entry.sessions);
  const prompt = buildExtractionPrompt(planId, screenplays, planText);

  log(`worker: analyzing ${planId}`, {
    promptChars: prompt.length,
    sessions: entry.sessions.length,
    attempt: (entry.analysisAttempts || 0) + 1,
  });
  const text = await callClaude(prompt, log);
  if (text === null) return false;

  // parse friction JSON (strip accidental fences)
  const cleaned = String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let result;
  try {
    result = JSON.parse(cleaned);
  } catch (error) {
    log(`worker: friction JSON parse failed for ${planId}`, { error: error.message });
    return false;
  }
  if (!Array.isArray(result.entries)) {
    log(`worker: invalid result shape for ${planId} (no entries array)`);
    return false;
  }

  // envelope metadata + recomputed stats (don't trust model arithmetic)
  // "# Implementation Plan: AIL-518 - Chat Sidebar" -> "Chat Sidebar"
  // (\S+ eats the JIRA key so hyphens inside it, e.g. AIL-518, don't split the title)
  const titleMatch = planText.match(/^#\s*Implementation Plan:\s*\S+\s*-\s*(.+)$/m);
  const friction = {
    plan_id: planId,
    plan_title: titleMatch ? titleMatch[1].trim() : '',
    generated_at: new Date().toISOString(),
    generation: (entry.generationCount || 0) + 1,
    sessions_analyzed: entry.sessions.map((s) => ({ sessionId: s.sessionId, agents: s.agents })),
    summary: result.summary || '',
    stats: recomputeStats(result.entries),
    entries: result.entries,
  };

  // write outputs (idempotent overwrite)
  const outDir = path.join(cwd, 'bmad-docs', 'bmad-logs', planId);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'friction.json'), JSON.stringify(friction, null, 2));
  fs.writeFileSync(path.join(outDir, 'friction.md'), renderMarkdown(friction));

  log(`worker: ${planId} done`, {
    entries: result.entries.length,
    generation: friction.generation,
  });
  return true;
}

function recomputeStats(entries) {
  const stats = {
    total: entries.length,
    by_failure_mode: {},
    by_attribution: {},
    by_detection: {},
  };
  for (const e of entries) {
    if (e.failure_mode)
      stats.by_failure_mode[e.failure_mode] = (stats.by_failure_mode[e.failure_mode] || 0) + 1;
    if (e.attribution)
      stats.by_attribution[e.attribution] = (stats.by_attribution[e.attribution] || 0) + 1;
    if (e.detection) stats.by_detection[e.detection] = (stats.by_detection[e.detection] || 0) + 1;
  }
  return stats;
}

// Record the analysis outcome on a FRESH tracker read (narrows the lost-update
// window vs concurrent SessionEnd writes). Success → analyzed, new generation,
// publish cycle reset. Failure → bump analysisAttempts toward the cap.
function recordAnalysisOutcome(planId, ok, log) {
  const fresh = readTracker(cwd);
  const entry = fresh.plans[planId];
  if (!entry) return;
  if (ok) {
    entry.analyzed = true;
    entry.generationCount = (entry.generationCount || 0) + 1;
    entry.analysisAttempts = 0;
    // new generation = fresh report -> reset the publish cycle (3 fresh attempts)
    entry.published = false;
    entry.publishAttempts = 0;
  } else {
    entry.analysisAttempts = (entry.analysisAttempts || 0) + 1;
    if (entry.analysisAttempts >= ANALYSIS_ATTEMPT_CAP) {
      log(
        `worker: giving up on ${planId} after ${ANALYSIS_ATTEMPT_CAP} failed analyses — will retry only when new session content arrives`,
      );
    } else {
      log(
        `worker: ${planId} analysis failed — attempt ${entry.analysisAttempts}/${ANALYSIS_ATTEMPT_CAP}, will retry next fire`,
      );
    }
  }
  writeTracker(cwd, fresh);
}

// Publish pass: upload every analyzed-but-unpublished report to Confluence.
// Covers reports generated this run AND leftovers from earlier failed uploads.
// Hard cap: PUBLISH_ATTEMPT_CAP tries per generation, then local-only forever.
async function publishPending(confluenceConfig, log) {
  const tracker = readTracker(cwd);
  let changed = false;

  for (const [planId, entry] of Object.entries(tracker.plans)) {
    if (!entry.analyzed || entry.published) continue;
    if ((entry.publishAttempts || 0) >= PUBLISH_ATTEMPT_CAP) continue;

    const frictionPath = path.join(cwd, 'bmad-docs', 'bmad-logs', planId, 'friction.json');
    let friction;
    try {
      friction = JSON.parse(fs.readFileSync(frictionPath, 'utf8'));
    } catch {
      // no local report to upload — exhaust attempts so we stop trying
      entry.publishAttempts = PUBLISH_ATTEMPT_CAP;
      changed = true;
      log(`publish: ${planId} has no local friction.json — giving up`);
      continue;
    }

    const res = await publishReport(cwd, confluenceConfig, friction, log);
    touchLock();
    entry.publishAttempts = (entry.publishAttempts || 0) + 1;
    changed = true;
    if (res.ok) {
      entry.published = true;
      entry.publishedAt = new Date().toISOString();
      log(`publish: ${planId} -> Confluence page ${res.pageId}`);
    } else if (entry.publishAttempts >= PUBLISH_ATTEMPT_CAP) {
      log(
        `publish: giving up on ${planId} after ${PUBLISH_ATTEMPT_CAP} attempts (${res.reason}) — report kept locally at bmad-docs/bmad-logs/${planId}/`,
      );
    } else {
      log(
        `publish: ${planId} failed (${res.reason}) — attempt ${entry.publishAttempts}/${PUBLISH_ATTEMPT_CAP}, will retry next fire`,
      );
    }
  }

  if (changed) writeTracker(cwd, tracker);
}

// 30-day prune: generationCount >= 2 OR latest endedAt > 30 days (OR rule, locked).
// Exception: a generation-capped entry stays while its final report still has
// publish retries left — otherwise the retry state would vanish with the entry.
function prune(tracker, log, publishEnabled) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const [planId, entry] of Object.entries(tracker.plans)) {
    const latest = entry.sessions.reduce((m, s) => Math.max(m, Date.parse(s.endedAt) || 0), 0);
    const stale = latest > 0 && latest < cutoff;
    const awaitingPublish =
      publishEnabled &&
      entry.analyzed &&
      !entry.published &&
      (entry.publishAttempts || 0) < PUBLISH_ATTEMPT_CAP;
    if (stale || (entry.generationCount >= GENERATION_CAP && !awaitingPublish)) {
      delete tracker.plans[planId];
      log(`worker: pruned ${planId}`, { generationCount: entry.generationCount });
    }
  }
}

(async () => {
  const log = makeLogger(cwd);

  try {
    const tracker = readTracker(cwd);
    const config = readLoggingConfig(cwd);
    const triggerStatuses = new Set(config.triggerStatuses);

    for (const [planId, entry] of Object.entries(tracker.plans)) {
      const blocked = evaluateGates(planId, entry, triggerStatuses);
      if (blocked) {
        log(`worker: skip ${planId} — ${blocked}`);
        continue;
      }
      const ok = await analyzePlan(planId, entry, log);
      touchLock(); // progress heartbeat — one LLM call can take minutes
      recordAnalysisOutcome(planId, ok, log);
    }

    // Publish everything analyzed-but-unpublished (fresh + earlier failures).
    const publishEnabled = Boolean(
      config.confluence && config.confluence.enabled && config.confluence.logsPageUrl,
    );
    if (publishEnabled) {
      await publishPending(config.confluence, log);
    }

    const finalTracker = readTracker(cwd);
    prune(finalTracker, log, publishEnabled);
    writeTracker(cwd, finalTracker);
  } catch (error) {
    log('worker: unexpected error', { error: error.message, stack: error.stack });
    emergencyLog(`unexpected error: ${error.stack || error.message}`);
  } finally {
    releaseLock();
  }
})();
