'use strict';

// Friction logger — HOOK 1 (SessionEnd): bookkeeping only. No LLM, no analysis.
// Records which plan(s) this session worked on into bmad-docs/bmad-logs/plan-tracker.json.
// Generation happens later in session-start.js (hook 2).
//
// Self-contained by design: no imports from the memory feature's hook files.

const fs = require('node:fs');
const path = require('node:path');
const { makeLogger, findBmadRoot } = require('./lib/state');
const { resolvePlanId } = require('./lib/planfile');
const { readTracker, writeTracker, upsertSession } = require('./lib/tracker');

// Keep in sync with bmad-core/agents/{planner,dev,quick-dev}.md.
// The injected agent definition arrives as ONE transcript line, so both
// markers co-occur on the same line — the pair-match kills false positives.
const AGENT_MARKERS = [
  { agent: 'planner', id: 'id: planner', name: 'name: Alex' },
  { agent: 'dev', id: 'id: dev', name: 'name: Bob' },
  { agent: 'quick-dev', id: 'id: quick-dev', name: 'name: Alice' },
];

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const PLAN_PATH_RE = /impl-plan[\\/]([^\\/]+?\.md)$/;

function main(rawStdin) {
  // Recursion guard (shared convention with the memory feature, see commit a6831d7):
  // a claude --print subprocess fires hooks itself — bail out immediately.
  if (process.env.BMAD_HOOK_SUBPROCESS === '1') return;

  let payload = {};
  try {
    payload = JSON.parse(rawStdin || '{}');
  } catch {
    return;
  }

  // Resolve the install root — payload.cwd may have drifted into a subfolder
  // (Bash cwd persists across `cd`). Outside a BMad project: exit, create nothing.
  const cwd = findBmadRoot(payload.cwd || process.cwd());
  if (!cwd) return;
  const sessionId = payload.session_id;
  const transcriptPath = payload.transcript_path;
  const log = makeLogger(cwd);

  if (!sessionId || !transcriptPath) {
    log('session-end: missing session_id or transcript_path');
    return;
  }

  let text;
  try {
    text = fs.readFileSync(transcriptPath, 'utf8');
  } catch (error) {
    log('session-end: cannot read transcript', { error: error.message });
    return;
  }

  // ---- single pass over the transcript ----
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const endLine = lines.length;

  const agents = new Set();
  const planFiles = new Set(); // file names written/edited under impl-plan/

  for (const line of lines) {
    for (const m of AGENT_MARKERS) {
      if (line.includes(m.id) && line.includes(m.name)) agents.add(m.agent);
    }
    // tool_use Write/Edit/MultiEdit on impl-plan/*.md
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.type !== 'assistant') continue;
    const content = obj.message && obj.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || block.type !== 'tool_use' || !WRITE_TOOLS.has(block.name)) continue;
      const fp = block.input && block.input.file_path;
      if (typeof fp !== 'string') continue;
      const match = fp.replaceAll('\\', '/').match(/impl-plan\/([^/]+?\.md)$/);
      if (match) planFiles.add(match[1]);
    }
  }

  // Gate: planner / dev / quick-dev sessions only.
  if (agents.size === 0) {
    log('session-end: no tracked agent in session — skip', { sessionId });
    return;
  }

  if (planFiles.size === 0) {
    log('session-end: no impl-plan file written/edited — skip', { sessionId, agents: [...agents] });
    return;
  }

  // ---- resolve plans (placeholder guard + must exist on disk) ----
  const plans = [];
  for (const fileName of planFiles) {
    if (fileName.includes('{{') || fileName.includes('}}')) continue; // template placeholder leaked as text
    const planFileRel = path.join('bmad-docs', 'impl-plan', fileName).replaceAll('\\', '/');
    const planFileAbs = path.join(cwd, 'bmad-docs', 'impl-plan', fileName);
    if (!fs.existsSync(planFileAbs)) continue; // a real plan must be a real file
    const planId = resolvePlanId(planFileAbs, fileName);
    plans.push({ planId, planFileRel });
  }

  if (plans.length === 0) {
    log('session-end: plan candidates all filtered out', { sessionId, candidates: [...planFiles] });
    return;
  }

  // ---- upsert tracker ----
  const tracker = readTracker(cwd);

  for (const { planId, planFileRel } of plans) {
    // Growth-region user count (only meaningful for a resumed session).
    const existing =
      tracker.plans[planId] &&
      tracker.plans[planId].sessions.find((s) => s.sessionId === sessionId);
    let growthUserCount = 0;
    if (existing && endLine > existing.endLine) {
      const growth = lines.slice(existing.endLine, endLine);
      for (const gline of growth) {
        try {
          if (JSON.parse(gline).type === 'user') growthUserCount++;
        } catch {
          // unparseable line — ignore
        }
      }
    }

    const outcome = upsertSession(
      tracker,
      planId,
      planFileRel,
      { sessionId, agents, transcript: transcriptPath, endLine },
      growthUserCount,
    );
    log(`session-end: ${planId} — ${outcome}`, { sessionId, agents: [...agents], endLine });
  }

  try {
    writeTracker(cwd, tracker);
  } catch (error) {
    log('session-end: tracker write failed', { error: error.message });
  }
}

let buffer = '';
process.stdin.on('data', (chunk) => (buffer += chunk));
process.stdin.on('end', () => {
  try {
    main(buffer);
  } catch {
    // hooks never throw
  }
});
