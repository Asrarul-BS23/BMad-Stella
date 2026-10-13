'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { log } = require('./state');

// Rule text shown back to the extractor for dedup matching — long enough to
// recognise the same rule reworded, short enough that 30 lessons stay cheap.
const RULE_PREVIEW_CHARS = 160;

function slugify(title) {
  return title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 60);
}

function lessonFiles(lessonsDir) {
  if (!fs.existsSync(lessonsDir)) return [];
  return fs.readdirSync(lessonsDir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
}

// Slug + rule for every stored lesson, fed into the extraction prompt so the
// model can point at an existing lesson instead of inventing a new title for it.
function readExistingLessons(lessonsDir) {
  try {
    return lessonFiles(lessonsDir).map((file) => {
      const slug = file.slice(0, -3);
      let rule = '';
      try {
        const content = fs.readFileSync(path.join(lessonsDir, file), 'utf8');
        const match = content.match(/##\s+Rule Going Forward\s*\n([\s\S]*?)(?=\n##\s|\s*$)/);
        if (match) rule = match[1].trim().replaceAll(/\s+/g, ' ').slice(0, RULE_PREVIEW_CHARS);
      } catch {
        // unreadable lesson still counts as a taken slug
      }
      return { slug, rule };
    });
  } catch (error) {
    log('lesson-writer: failed to read existing lessons', { error: error.message });
    return [];
  }
}

function flagForConstraintPromotion(stateDir, slug, filePath) {
  try {
    const flagFile = path.join(stateDir, 'constraint-promotion-flags.md');
    const today = new Date().toISOString().slice(0, 10);
    const entry = `\n- **${today}** — Lesson \`${slug}\` hit frequency ≥ 3. Consider promoting to Active Constraint: \`${filePath}\`\n`;
    fs.appendFileSync(flagFile, entry, 'utf8');
    log('lesson-writer: constraint promotion flagged', { slug });
  } catch (error) {
    log('lesson-writer: flagging failed', { error: error.message });
  }
}

// Bump frequency on an already-stored lesson and record which plan hit it again.
// Returns true if the lesson existed and was updated.
function recordRecurrence(lessonsDir, slug, planId, stateDir) {
  const filePath = path.join(lessonsDir, `${slug}.md`);
  if (!fs.existsSync(filePath)) return false;
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const freqMatch = content.match(/frequency:\s*(\d+)/);
    if (!freqMatch) {
      log('lesson-writer: existing lesson has no frequency field', { slug });
      return true;
    }
    const newFreq = Number.parseInt(freqMatch[1], 10) + 1;
    content = content.replace(/frequency:\s*\d+/, `frequency: ${newFreq}`);

    // Keep the trail of which plans hit this lesson — frequency alone loses it.
    const seenMatch = content.match(/^also-seen-in:\s*"([^"]*)"$/m);
    if (seenMatch) {
      const seen = seenMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!seen.includes(planId)) {
        seen.push(planId);
        content = content.replace(
          /^also-seen-in:\s*"[^"]*"$/m,
          `also-seen-in: "${seen.join(', ')}"`,
        );
      }
    } else {
      content = content.replace(
        /^frequency:\s*\d+$/m,
        (line) => `${line}\nalso-seen-in: "${planId}"`,
      );
    }

    fs.writeFileSync(filePath, content, 'utf8');
    log('lesson-writer: frequency incremented', { slug, frequency: newFreq, planId });
    if (newFreq >= 3) flagForConstraintPromotion(stateDir, slug, filePath);
    return true;
  } catch (error) {
    log('lesson-writer: recurrence update failed', { slug, error: error.message });
    return true;
  }
}

function writeLesson(lessonsDir, lesson, planId, stateDir) {
  if (!lesson?.title || !lesson?.rule) {
    log('lesson-writer: skipping lesson with missing required fields', { lesson });
    return;
  }
  try {
    fs.mkdirSync(lessonsDir, { recursive: true });

    // The extractor was shown the stored lessons and pointed at one of them —
    // this is a recurrence of a known mistake, not a new lesson.
    const matched =
      typeof lesson.matchesExistingSlug === 'string' ? lesson.matchesExistingSlug.trim() : '';
    if (matched && recordRecurrence(lessonsDir, matched, planId, stateDir)) return;
    if (matched) log('lesson-writer: claimed match not found, writing as new', { matched });

    const slug = slugify(lesson.title);

    // Same title generated twice — still a recurrence.
    if (recordRecurrence(lessonsDir, slug, planId, stateDir)) return;

    const today = new Date().toISOString().slice(0, 10);
    const fileContent = `---
type: lesson
source-plan: "${planId}"
source-agent: dev-agent
date: "${today}"
frequency: 1
recurrence-reason: "${(lesson.recurrenceReason || '').replaceAll(/\s+/g, ' ').replaceAll('"', "'").trim()}"
tags: []
---

# ${lesson.title}

## What Went Wrong
${lesson.whatWentWrong}

## Root Cause
${lesson.rootCause}

## Rule Going Forward
${lesson.rule}

## How to Apply
${lesson.howToApply}
`;
    fs.writeFileSync(path.join(lessonsDir, `${slug}.md`), fileContent, 'utf8');
    log('lesson-writer: lesson written', { slug, planId });
  } catch (error) {
    log('lesson-writer: write failed', { error: error.message });
  }
}

module.exports = { writeLesson, readExistingLessons };
