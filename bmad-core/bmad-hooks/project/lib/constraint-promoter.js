'use strict';

const path = require('node:path');
const fs = require('node:fs');
const yaml = require('js-yaml');
const { log } = require('./state');
const { callClaude } = require('./llm');
const { buildPromoteConstraintPrompt } = require('../prompts/promote-constraint');

const PROMOTION_THRESHOLD = 3;

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    return yaml.load(match[1]) || {};
  } catch {
    return {};
  }
}

async function promoteConstraintCandidates(memoryDir) {
  const lessonsDir = path.join(memoryDir, 'lessons');
  const constraintsDir = path.join(memoryDir, 'constraints');

  if (!fs.existsSync(lessonsDir)) return;

  fs.mkdirSync(constraintsDir, { recursive: true });

  const lessonFiles = fs
    .readdirSync(lessonsDir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'));

  const today = new Date().toISOString().slice(0, 10);
  let promoted = 0;

  for (const file of lessonFiles) {
    const lessonPath = path.join(lessonsDir, file);
    const constraintPath = path.join(constraintsDir, file);

    // Skip if already promoted to a constraint
    if (fs.existsSync(constraintPath)) continue;

    let content;
    try {
      content = fs.readFileSync(lessonPath, 'utf8');
    } catch {
      continue;
    }

    const fm = parseFrontmatter(content);
    const frequency = typeof fm.frequency === 'number' ? fm.frequency : 0;

    if (frequency < PROMOTION_THRESHOLD) continue;

    log('constraint-promoter: promoting lesson to constraint', { file, frequency });

    const result = await callClaude(
      buildPromoteConstraintPrompt({ lessonContent: content, today }),
    );
    if (!result) {
      log('constraint-promoter: LLM returned null, skipping', { file });
      continue;
    }

    try {
      const tmp = constraintPath + '.tmp.' + process.pid;
      fs.writeFileSync(tmp, result.trim() + '\n', 'utf8');
      fs.renameSync(tmp, constraintPath);
      log('constraint-promoter: constraint written', { file: constraintPath });
      promoted++;
    } catch (error) {
      log('constraint-promoter: write failed', { file, error: error.message });
    }
  }

  if (promoted > 0) log('constraint-promoter: promotion complete', { promoted });
}

module.exports = { promoteConstraintCandidates };
