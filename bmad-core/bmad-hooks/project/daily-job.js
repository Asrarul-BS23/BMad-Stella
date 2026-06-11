'use strict';

// Daily job — spawned as a detached background process by user-prompt-submit.js.
// Usage: node daily-job.js <cwd>
// Scans plan files created/modified since last run and updates episodic memory, lessons, patterns.

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { readState, writeState, log } = require('./lib/state');
const { parsePlanFile } = require('./lib/plan-parser');
const { writeEpisodic } = require('./lib/episodic-writer');
const { writeLesson } = require('./lib/lesson-writer');
const { writePatternCandidate } = require('./lib/pattern-writer');
const { consolidateAll } = require('./lib/semantic-consolidator');
const { distillIfStale } = require('./lib/domain-map-distiller');
const { callClaude } = require('./lib/llm');
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
  return fileDate.toISOString().slice(0, 10) > lastRun;
}

function scanPlanFiles(implPlanDir, lastDailyRun) {
  try {
    if (!fs.existsSync(implPlanDir)) return [];
    return fs
      .readdirSync(implPlanDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(implPlanDir, f))
      .filter((fp) => isAfterLastRun(fp, lastDailyRun));
  } catch {
    return [];
  }
}

// Extract the sections Claude reads for analysis — caps at 3000 chars
function extractPlanSections(content) {
  const SECTION_NAMES = [
    'Dev Agent Record',
    'QA Feedback',
    'Security Review',
    'Security Violations',
    'Deviation Record',
  ];
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

// Single batched call — returns { episodic, lessons, patterns } or null
async function analyzePlan(planInfo) {
  const today = todayUTC();
  const planId = path.basename(planInfo.filePath, '.md');
  const sections = extractPlanSections(planInfo.content);

  const sectionsBlock = sections
    ? `PLAN SECTIONS (agent work records):\n${sections}`
    : 'PLAN SECTIONS: none available';

  const prompt = buildAnalyzePlanPrompt({
    planId,
    today,
    status: planInfo.status || 'unknown',
    moduleTag: planInfo.moduleTag || 'untagged',
    description: planInfo.description || 'not provided',
    sectionsBlock,
  });

  const result = await callClaude(prompt);
  if (!result) return null;

  try {
    const trimmed = result
      .trim()
      .replace(/^```json\s*/, '')
      .replace(/```\s*$/, '');
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      episodic: typeof parsed.episodic === 'string' ? parsed.episodic.trim() : null,
      lessons: Array.isArray(parsed.lessons) ? parsed.lessons.filter(Boolean) : [],
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns.filter(Boolean) : [],
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

  const memoryDir = path.join(cwd, 'bmad-docs', 'memory');
  const stateDir = path.join(memoryDir, '.state');
  const implPlanDir = path.join(cwd, 'bmad-docs', 'impl-plan');
  const episodesDir = path.join(memoryDir, 'episodes');
  const lessonsDir = path.join(memoryDir, 'lessons');
  const patternsDir = path.join(memoryDir, 'patterns');
  const constraintsDir = path.join(memoryDir, 'constraints');

  if (!fs.existsSync(memoryDir)) {
    log('daily-job: bmad-docs/memory not found, exiting', { cwd });
    return;
  }

  const dailyStateFile = path.join(stateDir, '.daily-state.json');
  const dailyState = readState(dailyStateFile, { last_daily_run: null, last_weekly_run: null });
  const today = todayUTC();

  const planFiles = scanPlanFiles(implPlanDir, dailyState.last_daily_run);
  log('daily-job: plan files to process', {
    count: planFiles.length,
    lastRun: dailyState.last_daily_run,
  });

  let anyCompressed = false;

  for (const planFile of planFiles) {
    const planInfo = parsePlanFile(planFile);
    if (!planInfo) continue;

    const planId = path.basename(planFile, '.md');
    log('daily-job: processing plan', { file: planId, module: planInfo.moduleTag });

    // Single batched Claude call per plan — episodic + lessons + patterns
    const analysis = await analyzePlan(planInfo);

    const episodicEntry =
      analysis?.episodic ||
      `${planId} | ${today} | status: ${planInfo.status || 'unknown'} | module: ${planInfo.moduleTag || 'untagged'}`;

    const result = await writeEpisodic(episodesDir, planInfo.moduleTag, episodicEntry);
    if (result.compressed) anyCompressed = true;

    if (analysis) {
      for (const lesson of analysis.lessons) {
        writeLesson(lessonsDir, lesson, planId, stateDir);
      }
      if (analysis.lessons.length > 0) {
        log('daily-job: lessons extracted', { planId, count: analysis.lessons.length });
      }

      for (const pattern of analysis.patterns) {
        writePatternCandidate(patternsDir, pattern, planId);
      }
      if (analysis.patterns.length > 0) {
        log('daily-job: pattern candidates written', { planId, count: analysis.patterns.length });
      }
    }
  }

  if (anyCompressed) {
    log('daily-job: running semantic consolidation (triggered by compression)', {});
    await consolidateAll(memoryDir);
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
    if (domainMapUpdated) log('daily-job: domain-map.md refreshed from domain-knowledge/', { cwd });
    await consolidateAll(memoryDir);
    dailyState.last_weekly_run = today;
  }

  dailyState.last_daily_run = today;
  writeState(dailyStateFile, dailyState);

  log('daily-job: complete', { processed: planFiles.length, today });
}

run().catch((error) => {
  log('daily-job: unhandled error', { error: error.message, stack: error.stack });
});
