'use strict';

// Friction logger — HOOK 1 (SessionEnd): bookkeeping only. No LLM, no analysis.
// Records which spec(s) this session worked on into the plan tracker under the Stella logs folder.
// Generation happens later in session-start.js (hook 2).
//
// Self-contained by design: no imports from the memory feature's hook files.

const fs = require('node:fs');
const path = require('node:path');
const { makeLogger, findBmadRoot } = require('./lib/state');
const { resolvePlanId } = require('./lib/planfile');
const { readTracker, writeTracker, upsertSession } = require('./lib/tracker');
const paths = require('./lib/paths');

// Only stella-build sessions are tracked (user decision, v6 migration). The
// official bmad-build is installed too but is not Stella's workflow, so it is not tracked.
// A session counts when the user typed the skill command, or when Claude Code
// recorded a `Skill` tool call for it — the same two signals the PR review
// guard uses. A mere mention of the name in prose never matches.
const TRACKED_SKILL = 'stella-build';
const SKILL_COMMAND_RE = /^\s*\/stella-build(?:\s|$)/i;

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
// Dedicated file tools carry the path in input.file_path (must END with the spec path).
const PLAN_PATH_RE = /implementation-artifacts\/(spec-[^/]+?\.md)$/i;
// Bash/PowerShell writes (heredoc, `cat >`, sed -i, …) carry the path somewhere inside
// input.command — any mention counts; the on-disk existence check below filters
// out greps/reads that only name a file.
const BASH_PLAN_RE = /implementation-artifacts[\\/](spec-[^\\/\s'"`)]+?\.md)/gi;

// Text of a user message — Claude Code stores either a string or an array of blocks.
function userText(message) {
  const content = message && message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

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
  const planFiles = new Set(); // spec file names written/edited under implementation-artifacts/

  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    // Session gate signal 1: the user typed /stella-build
    if (obj.type === 'user' && !obj.isMeta && SKILL_COMMAND_RE.test(userText(obj.message))) {
      agents.add(TRACKED_SKILL);
      continue;
    }
    if (obj.type !== 'assistant') continue;
    const content = obj.message && obj.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || block.type !== 'tool_use' || !block.input) continue;
      // Session gate signal 2: Claude Code launched the skill
      if (block.name === 'Skill' && block.input.skill === TRACKED_SKILL) {
        agents.add(TRACKED_SKILL);
        continue;
      }
      // tool_use Write/Edit/MultiEdit (file_path) or Bash/PowerShell (command) on spec-*.md
      if (WRITE_TOOLS.has(block.name)) {
        const fp = block.input.file_path;
        if (typeof fp !== 'string') continue;
        const match = fp.replaceAll('\\', '/').match(PLAN_PATH_RE);
        if (match) planFiles.add(match[1]);
      } else if (
        (block.name === 'Bash' || block.name === 'PowerShell') &&
        typeof block.input.command === 'string'
      ) {
        for (const m of block.input.command.matchAll(BASH_PLAN_RE)) planFiles.add(m[1]);
      }
    }
  }

  // Gate: stella-build sessions only.
  if (agents.size === 0) {
    log('session-end: no stella-build activation in session — skip', { sessionId });
    return;
  }

  if (planFiles.size === 0) {
    log('session-end: no spec file written/edited — skip', { sessionId, agents: [...agents] });
    return;
  }

  // ---- resolve plans (placeholder guard + must exist on disk) ----
  const plans = [];
  for (const fileName of planFiles) {
    if (fileName.includes('{{') || fileName.includes('}}')) continue; // template placeholder leaked as text
    const planFileRel = paths.specRel(fileName);
    const planFileAbs = path.join(paths.specsDir(cwd), fileName);
    if (!fs.existsSync(planFileAbs)) continue; // a real spec must be a real file
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
