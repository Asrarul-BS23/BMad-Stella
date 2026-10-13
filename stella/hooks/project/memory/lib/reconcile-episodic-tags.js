'use strict';

// One-time manual cleanup — NOT run by the daily cron.
// Re-parses every impl-plan file with the fixed plan-parser and moves entries
// that are sitting in episodes/_untagged.md under the wrong tag into the
// correct per-module episode file. Moves text as-is — no re-extraction, no
// Claude calls, .processed-files.json is left untouched.
//
// Usage: node reconcile-episodic-tags.js <cwd>

const path = require('node:path');
const fs = require('node:fs');

const { parsePlanFile } = require('./plan-parser');
const { loadTemplate } = require('./episodic-writer');
const { log } = require('./state');

const ENTRY_SPLIT_RE =
  /\n---\n\*\*(\d{4}-\d{2}-\d{2})\*\*\n([\s\S]*?)(?=\n---\n\*\*\d{4}-\d{2}-\d{2}\*\*\n|$)/g;

// Episodic entries reference the short ticket id (e.g. "AIL-837"), not the
// full plan filename (e.g. "AIL-837-sqs-idempotency-layer") — extract it from
// the leading "<PREFIX>-<number>" of the filename.
function shortPlanId(filenameBase) {
  return (filenameBase.match(/^[A-Za-z]+-\d+/) || [])[0] || filenameBase;
}

function loadPlanTagsById(implPlanDir) {
  const tagsById = new Map();
  if (!fs.existsSync(implPlanDir)) return tagsById;

  for (const file of fs.readdirSync(implPlanDir)) {
    if (!file.endsWith('.md')) continue;
    const planId = shortPlanId(path.basename(file, '.md'));
    const info = parsePlanFile(path.join(implPlanDir, file));
    if (info?.moduleTag) tagsById.set(planId, info.moduleTag);
  }
  return tagsById;
}

function splitEntries(content) {
  const entries = [];
  let match = ENTRY_SPLIT_RE.exec(content);
  while (match !== null) {
    entries.push({ date: match[1], body: match[2], raw: match[0] });
    match = ENTRY_SPLIT_RE.exec(content);
  }
  return entries;
}

function findPlanIdInEntry(entryBody, knownPlanIds) {
  for (const planId of knownPlanIds) {
    if (new RegExp(`\\b${planId}\\b`).test(entryBody)) return planId;
  }
  return null;
}

function appendEntry(episodesDir, tag, date, body) {
  const filePath = path.join(episodesDir, `${tag}.md`);
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : loadTemplate(tag);
  content = content + `\n---\n**${date}**\n${body}\n`;

  content = content.replace(/last-updated:\s*[^\n]+/, `last-updated: ${date}`);
  const cycleMatch = content.match(/cycle-count:\s*(\d+)/);
  if (cycleMatch) {
    const newCount = Number.parseInt(cycleMatch[1], 10) + 1;
    content = content.replace(/cycle-count:\s*\d+/, `cycle-count: ${newCount}`);
  }

  const tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

function run() {
  const cwd = process.argv[2];
  if (!cwd) {
    console.error('Usage: node reconcile-episodic-tags.js <cwd>');
    process.exitCode = 1;
    return;
  }

  const implPlanDir = path.join(cwd, 'bmad-docs', 'impl-plan');
  const episodesDir = path.join(cwd, 'bmad-docs', 'memory', 'episodes');
  const untaggedFile = path.join(episodesDir, '_untagged.md');

  if (!fs.existsSync(untaggedFile)) {
    console.log('No episodes/_untagged.md found — nothing to reconcile.');
    return;
  }

  const tagsById = loadPlanTagsById(implPlanDir);
  const knownPlanIds = [...tagsById.keys()];

  const untaggedContent = fs.readFileSync(untaggedFile, 'utf8');
  const entries = splitEntries(untaggedContent);

  let movedCount = 0;
  const remainingRaw = [];

  for (const entry of entries) {
    const planId = findPlanIdInEntry(entry.body, knownPlanIds);
    const correctedTag = planId ? tagsById.get(planId) : null;

    if (correctedTag && correctedTag !== '_untagged') {
      appendEntry(episodesDir, correctedTag, entry.date, entry.body.trim());
      console.log(`Moved ${planId} -> episodes/${correctedTag}.md`);
      movedCount++;
    } else {
      remainingRaw.push(entry.raw);
    }
  }

  if (movedCount > 0) {
    const preamble = untaggedContent.slice(0, untaggedContent.indexOf(entries[0]?.raw ?? ''));
    const rebuilt = preamble + remainingRaw.join('');
    const tmp = untaggedFile + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, rebuilt, 'utf8');
    fs.renameSync(tmp, untaggedFile);
  }

  console.log(
    `Done. ${movedCount} entr${movedCount === 1 ? 'y' : 'ies'} moved out of _untagged.md, ${remainingRaw.length} remaining.`,
  );
  log('reconcile-episodic-tags: complete', { moved: movedCount, remaining: remainingRaw.length });
}

run();

module.exports = { loadPlanTagsById, splitEntries, findPlanIdInEntry };
