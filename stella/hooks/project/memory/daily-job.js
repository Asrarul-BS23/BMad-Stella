'use strict';

// Daily job — spawned as a detached background process by user-prompt-submit.js.
// Usage: node daily-job.js <cwd>
// Scans plan files created/modified since last run and updates episodic memory, lessons, patterns.

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { readState, writeState, log } = require('./lib/state');
const { splitFrontmatter } = require('./lib/semantic-body');
const { parsePlanFile } = require('./lib/plan-parser');
const { writeEpisodic } = require('./lib/episodic-writer');
const { writeLesson, readExistingLessons } = require('./lib/lesson-writer');
const { distillPatternsFromCode } = require('./lib/pattern-distiller');
const { consolidateAll } = require('./lib/semantic-consolidator');
const { distillIfStale } = require('./lib/domain-map-distiller');
const { promoteConstraintCandidates } = require('./lib/constraint-promoter');
const { updateMemoryIndex } = require('./lib/memory-index');
const { callClaude, callClaudeAgent } = require('./lib/llm');
const { normalizeModuleTag } = require('./lib/slug');
const { rootMarker, memoryDir: memoryDirPath, specsDir } = require('./lib/paths');
const { buildAnalyzePlanPrompt } = require('./prompts/analyze-plan');

const PERSONALIZATION_FILE = path.join(os.homedir(), '.claude', 'personalization.md');

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function getFileDate(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const epoch = new Date(0);
    const birthtime = stat.birthtime;
    if (birthtime > epoch) return birthtime;
    return stat.mtime;
  } catch {
    return new Date(0);
  }
}

function isAfterLastRun(filePath, lastRun) {
  if (!lastRun) return true;
  const fileDate = getFileDate(filePath);
  // lastRun may be a legacy date string "YYYY-MM-DD" or a full ISO timestamp.
  // Pad legacy strings to start-of-day UTC so comparison is always timestamp vs timestamp.
  const lastRunTs = new Date(lastRun.length === 10 ? lastRun + 'T00:00:00.000Z' : lastRun);
  return fileDate > lastRunTs;
}

function readProcessed(stateDir) {
  const filePath = path.join(stateDir, '.processed-files.json');
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function markProcessed(stateDir, filename) {
  const filePath = path.join(stateDir, '.processed-files.json');
  const processed = readProcessed(stateDir);
  processed[filename] = new Date().toISOString();
  const tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(processed, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function scanPlanFiles(implPlanDir, lastDailyRun, stateDir) {
  try {
    if (!fs.existsSync(implPlanDir)) return [];
    const processed = readProcessed(stateDir);
    return (
      fs
        .readdirSync(implPlanDir)
        // stella-build names specs `spec-*.md`; the same folder also holds
        // `deferred-work.md` and `sprint-status.yaml`, neither of which is a spec.
        .filter((f) => f.endsWith('.md') && f.toLowerCase().startsWith('spec-'))
        .filter((f) => !processed[f])
        .map((f) => path.join(implPlanDir, f))
        .filter((fp) => isAfterLastRun(fp, lastDailyRun))
    );
  } catch {
    return [];
  }
}

const AREA_EXCERPT_CHARS = 200;

// Episodic areas currently on disk — the classifier's reuse candidates, each
// with a short real-content excerpt. A bare slug list gave the model nothing
// to judge fit against, so with few areas it defaulted to reusing the only
// one available even for an unrelated spec — the excerpt is what lets it
// actually compare the new Intent against what an area already covers.
// `_untagged.md` is a holding bin, not a real area (see lib/semantic-consolidator.js).
function readExistingAreas(episodesDir) {
  try {
    if (!fs.existsSync(episodesDir)) return [];
    return fs
      .readdirSync(episodesDir)
      .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
      .map((f) => {
        const area = path.basename(f, '.md');
        let excerpt = '';
        try {
          const { body } = splitFrontmatter(fs.readFileSync(path.join(episodesDir, f), 'utf8'));
          // Every real entry is `PlanID | what-built | outcome` — the first
          // such line skips the heading and the format comment with no extra
          // parsing needed.
          const entryLine = body.split('\n').find((l) => l.includes('|'));
          excerpt = entryLine ? entryLine.trim().slice(0, AREA_EXCERPT_CHARS) : '';
        } catch {
          // excerpt stays empty; the slug alone is still usable
        }
        return { area, excerpt };
      });
  } catch {
    return [];
  }
}

// Extract the sections Claude reads for analysis — caps at 3000 chars
function extractPlanSections(content) {
  const SECTION_NAMES = ['Implementation Notes', 'Review Triage Log', 'Spec Change Log'];
  const parts = [];
  for (const name of SECTION_NAMES) {
    const match = content.match(
      new RegExp(`##\\s+${name}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|\\s*$)`, 'i'),
    );
    if (match && match[1].trim()) {
      parts.push(`### ${name}\n${match[1].trim()}`);
    }
  }
  if (parts.length === 0) return null;
  return parts.join('\n\n').slice(0, 3000);
}

// Single batched call — returns { moduleTag, episodic, lessons } or null.
// moduleTag is derived here (from the spec's own Intent, classified against
// existingAreas) rather than read off the plan file — the new spec format
// (spec-template.md) carries no module-tag field at all.
//
// Cold start: when existingAreas is empty (first spec this project has ever
// processed), there is nothing yet to classify against, so this one call runs
// as an EXPLORING agent (Glob/Read/Grep) instead of a plain text call — it can
// look at how the codebase is actually laid out to help ground the very first
// area name, the same way distillFromCode() explores for domain-map.md. Purely
// optional help: the prompt tells it the structure may not clarify anything,
// in which case it falls back to naming from Intent alone like every later
// call does. Every call after this one classifies against a real area instead,
// so the agent path only ever runs once per project.
async function analyzePlan(planInfo, existingAreas, existingLessons, cwd) {
  const today = todayUTC();
  const planId = planInfo.planId;
  const sections = extractPlanSections(planInfo.content);
  const coldStart = existingAreas.length === 0;

  const sectionsBlock = sections
    ? `PLAN SECTIONS (agent work records):\n${sections}`
    : 'PLAN SECTIONS: none available';

  const prompt = buildAnalyzePlanPrompt({
    planId,
    today,
    status: planInfo.status || 'unknown',
    title: planInfo.title,
    intent: planInfo.intent,
    existingAreas,
    coldStart,
    cwd,
    sectionsBlock,
    existingLessons,
  });

  const result = coldStart ? await callClaudeAgent(prompt) : await callClaude(prompt);
  if (!result) return null;

  try {
    const trimmed = result
      .trim()
      .replace(/^```json\s*/, '')
      .replace(/```\s*$/, '');
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      moduleTag: normalizeModuleTag(parsed.moduleTag),
      episodic: typeof parsed.episodic === 'string' ? parsed.episodic.trim() : null,
      // Hard cap: the prompt asks for 0 or 1, but a model that returns two
      // near-identical lessons must not be able to create two files.
      lessons: Array.isArray(parsed.lessons) ? parsed.lessons.filter(Boolean).slice(0, 1) : [],
    };
  } catch {
    log('daily-job: plan analysis JSON parse failed', { planId });
    return null;
  }
}

function appendPersonalizationCorrections(stateDir) {
  const stagingFile = path.join(stateDir, '.personalization-staging.json');
  if (!fs.existsSync(stagingFile)) return;

  try {
    const staged = JSON.parse(fs.readFileSync(stagingFile, 'utf8'));
    if (staged.length === 0) return;

    if (!fs.existsSync(PERSONALIZATION_FILE)) {
      log('daily-job: personalization.md not found, skipping correction write', {});
      return;
    }

    let content = fs.readFileSync(PERSONALIZATION_FILE, 'utf8');
    const layer2Marker = '## Layer 2 — Explicit Behavioral Corrections';
    const markerIndex = content.indexOf(layer2Marker);

    if (markerIndex === -1) {
      log('daily-job: Layer 2 marker not found in personalization.md', {});
      return;
    }

    const afterMarker = content.indexOf('\n## ', markerIndex + layer2Marker.length);
    const insertAt = afterMarker === -1 ? content.length : afterMarker;

    const entries = staged
      .map((s) => `\n- Rule: ${s.rule} | Agent context: ${s.agent_context} | Date: ${s.date}`)
      .join('');

    content = content.slice(0, insertAt) + entries + content.slice(insertAt);
    fs.writeFileSync(PERSONALIZATION_FILE, content, 'utf8');

    fs.writeFileSync(stagingFile, '[]', 'utf8');
    log('daily-job: personalization corrections written', { count: staged.length });
  } catch (error) {
    log('daily-job: failed to write personalization corrections', { error: error.message });
  }
}

async function checkConstraintExpiry(constraintsDir, stateDir) {
  if (!fs.existsSync(constraintsDir)) return;
  const files = fs
    .readdirSync(constraintsDir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  const today = todayUTC();
  const flagFile = path.join(stateDir, 'constraint-retirement-flags.md');
  let flagged = 0;

  for (const file of files) {
    const filePath = path.join(constraintsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const expiryMatch = content.match(/expiry-condition:\s*"([^"]+)"/);
    if (!expiryMatch) continue;
    const expiry = expiryMatch[1].toLowerCase();
    if (expiry.includes('when') || expiry.includes('after') || expiry.includes('once')) {
      const entry = `\n- **${today}** — Constraint \`${file}\` has expiry condition: "${expiryMatch[1]}". Review if this condition has been met: \`${filePath}\`\n`;
      fs.appendFileSync(flagFile, entry, 'utf8');
      flagged++;
    }
  }
  if (flagged > 0) log('daily-job: constraint expiry candidates flagged', { count: flagged });
}

async function run() {
  const cwd = process.argv[2];
  if (!cwd) {
    log('daily-job: no cwd argument, exiting', {});
    return;
  }

  log('daily-job: starting', { cwd });

  if (!fs.existsSync(rootMarker(cwd))) {
    log('daily-job: not a BMad v6 project (_bmad/config.toml not found), exiting', { cwd });
    return;
  }

  const memoryDir = memoryDirPath(cwd);
  const stateDir = path.join(memoryDir, '.state');
  const implPlanDir = specsDir(cwd);
  const episodesDir = path.join(memoryDir, 'episodes');
  const lessonsDir = path.join(memoryDir, 'lessons');
  const constraintsDir = path.join(memoryDir, 'constraints');

  const dailyStateFile = path.join(stateDir, '.daily-state.json');
  const dailyState = readState(dailyStateFile, { last_daily_run: null, last_weekly_run: null });
  const today = todayUTC();

  const planFiles = scanPlanFiles(implPlanDir, dailyState.last_daily_run, stateDir);
  log('daily-job: plan files to process', {
    count: planFiles.length,
    lastRun: dailyState.last_daily_run,
  });

  let anyCompressed = false;

  for (const planFile of planFiles) {
    const planInfo = parsePlanFile(planFile);
    if (!planInfo) continue;

    const planId = planInfo.planId;
    log('daily-job: processing plan', { file: planId });

    // Re-read per plan: a module tag or lesson written for an earlier plan in
    // this same run must be matchable by later plans, otherwise a backfill
    // mints a near-duplicate area or duplicates a lesson.
    const existingAreas = readExistingAreas(episodesDir);
    const existingLessons = readExistingLessons(lessonsDir);

    // Single batched Claude call per plan — module tag + episodic + lessons
    const analysis = await analyzePlan(planInfo, existingAreas, existingLessons, cwd);
    const moduleTag = analysis?.moduleTag || null;

    const episodicEntry =
      analysis?.episodic ||
      `${planId} | ${today} | status: ${planInfo.status || 'unknown'} | module: ${moduleTag || 'untagged'}`;

    const result = await writeEpisodic(episodesDir, moduleTag, episodicEntry);
    if (result.compressed) anyCompressed = true;

    if (analysis) {
      for (const lesson of analysis.lessons) {
        writeLesson(lessonsDir, lesson, planId, stateDir);
      }
      if (analysis.lessons.length > 0) {
        log('daily-job: lessons extracted', { planId, count: analysis.lessons.length });
      }
    }

    markProcessed(stateDir, path.basename(planFile));
    log('daily-job: plan marked processed', { file: planId, module: moduleTag });
  }

  if (anyCompressed) {
    log('daily-job: running semantic consolidation (triggered by compression)', {});
    await consolidateAll(memoryDir, cwd);
  }

  await checkConstraintExpiry(constraintsDir, stateDir);

  appendPersonalizationCorrections(stateDir);

  const lastWeekly = dailyState.last_weekly_run;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const weeklyDue = !lastWeekly || lastWeekly < sevenDaysAgo.toISOString().slice(0, 10);

  if (weeklyDue) {
    log('daily-job: running weekly jobs', {});
    const domainMapUpdated = await distillIfStale(cwd);
    if (domainMapUpdated) log('daily-job: domain-map.md refreshed', { cwd });
    const patternsUpdated = await distillPatternsFromCode(cwd);
    if (patternsUpdated) log('daily-job: patterns.md refreshed', { cwd });
    await promoteConstraintCandidates(memoryDir);
    log('daily-job: constraint promotion check complete', {});
    await consolidateAll(memoryDir, cwd);
    dailyState.last_weekly_run = today;
  }

  // Rebuild MEMORY.md index after all writes complete
  updateMemoryIndex(memoryDir, cwd);

  dailyState.last_daily_run = new Date().toISOString();
  writeState(dailyStateFile, dailyState);

  log('daily-job: complete', { processed: planFiles.length, today });
}

run().catch((error) => {
  log('daily-job: unhandled error', { error: error.message, stack: error.stack });
});
