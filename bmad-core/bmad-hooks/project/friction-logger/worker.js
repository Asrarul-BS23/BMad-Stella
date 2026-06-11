'use strict';

// Friction logger — detached analysis WORKER.
// Spawned by session-start.js AFTER the cheap gates pass, so session startup is
// never delayed. Processes ALL fireable plans sequentially, then releases the
// fire-lock. Usage: node worker.js <projectCwd>

const fs = require('node:fs');
const path = require('node:path');
const { makeLogger } = require('./lib/state');
const { readTracker, writeTracker } = require('./lib/tracker');
const { readStatus } = require('./lib/planfile');
const { buildScreenplays } = require('./lib/reducer');
const { callClaude } = require('./lib/llm');
const { renderMarkdown } = require('./lib/render');
const { readLoggingConfig } = require('./lib/config');
const { buildExtractionPrompt } = require('./prompts/extract-friction');

const GENERATION_CAP = 2;

function lockPath(cwd) {
  return path.join(cwd, 'bmad-docs', 'bmad-logs', '.fire-lock');
}

// Fire gates, cheap-first. LLM is called only after ALL pass. Per-plan isolation.
function evaluateGates(cwd, planId, entry, triggerStatuses, log) {
  if (entry.analyzed) return 'analyzed';
  if (entry.generationCount >= GENERATION_CAP) return 'generation-cap';

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

async function analyzePlan(cwd, planId, entry, log) {
  const planFileAbs = path.join(cwd, entry.planFile);
  const planText = fs.readFileSync(planFileAbs, 'utf8');
  const screenplays = buildScreenplays(entry.sessions);
  const prompt = buildExtractionPrompt(planId, screenplays, planText);

  log(`worker: analyzing ${planId}`, {
    promptChars: prompt.length,
    sessions: entry.sessions.length,
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
  const titleMatch = planText.match(/^#\s*Implementation Plan:\s*[^\n-]*-\s*(.+)$/m);
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

// 30-day prune: generationCount >= 2 OR latest endedAt > 30 days (OR rule, locked).
function prune(tracker, log) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const [planId, entry] of Object.entries(tracker.plans)) {
    const latest = entry.sessions.reduce((m, s) => Math.max(m, Date.parse(s.endedAt) || 0), 0);
    if (entry.generationCount >= GENERATION_CAP || (latest > 0 && latest < cutoff)) {
      delete tracker.plans[planId];
      log(`worker: pruned ${planId}`, { generationCount: entry.generationCount });
    }
  }
}

(async () => {
  const cwd = process.argv[2];
  if (!cwd) process.exit(0);
  const log = makeLogger(cwd);

  try {
    const tracker = readTracker(cwd);
    const config = readLoggingConfig(cwd);
    const triggerStatuses = new Set(config.triggerStatuses);

    for (const [planId, entry] of Object.entries(tracker.plans)) {
      const blocked = evaluateGates(cwd, planId, entry, triggerStatuses, log);
      if (blocked) {
        log(`worker: skip ${planId} — ${blocked}`);
        continue;
      }
      const ok = await analyzePlan(cwd, planId, entry, log);
      if (ok) {
        // re-read fresh to narrow the lost-update window vs concurrent SessionEnd writes
        const fresh = readTracker(cwd);
        const freshEntry = fresh.plans[planId];
        if (freshEntry) {
          freshEntry.analyzed = true;
          freshEntry.generationCount = (freshEntry.generationCount || 0) + 1;
          writeTracker(cwd, fresh);
        }
      }
    }

    const finalTracker = readTracker(cwd);
    prune(finalTracker, log);
    writeTracker(cwd, finalTracker);
  } catch (error) {
    log('worker: unexpected error', { error: error.message });
  } finally {
    try {
      fs.unlinkSync(lockPath(cwd)); // release the fire-lock
    } catch {
      /* already gone */
    }
  }
})();
