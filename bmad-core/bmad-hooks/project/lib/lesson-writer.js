'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { log } = require('./state');

function slugify(title) {
  return title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 60);
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

function writeLesson(lessonsDir, lesson, planId, stateDir) {
  if (!lesson?.title || !lesson?.rule) {
    log('lesson-writer: skipping lesson with missing required fields', { lesson });
    return;
  }
  try {
    fs.mkdirSync(lessonsDir, { recursive: true });
    const slug = slugify(lesson.title);
    const filePath = path.join(lessonsDir, `${slug}.md`);
    const today = new Date().toISOString().slice(0, 10);

    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      const freqMatch = content.match(/frequency:\s*(\d+)/);
      if (freqMatch) {
        const newFreq = Number.parseInt(freqMatch[1], 10) + 1;
        content = content.replace(/frequency:\s*\d+/, `frequency: ${newFreq}`);
        fs.writeFileSync(filePath, content, 'utf8');
        log('lesson-writer: frequency incremented', { slug, frequency: newFreq });
        if (newFreq >= 3) flagForConstraintPromotion(stateDir, slug, filePath);
      }
      return;
    }

    const fileContent = `---
type: lesson
source-plan: "${planId}"
source-agent: claude-extracted
date: "${today}"
frequency: 1
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
    fs.writeFileSync(filePath, fileContent, 'utf8');
    log('lesson-writer: lesson written', { slug });
  } catch (error) {
    log('lesson-writer: write failed', { error: error.message });
  }
}

module.exports = { writeLesson };
