'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { log } = require('./state');
const { callClaude } = require('./llm');
const { buildCompressEpisodePrompt } = require('../prompts/compress-episode');

const WORD_CAP = 800;
const TEMPLATE_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '.bmad-core',
  'templates',
  'memories',
  'episodes',
  '_template.md',
);

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function loadTemplate(area) {
  try {
    if (fs.existsSync(TEMPLATE_PATH)) {
      return fs
        .readFileSync(TEMPLATE_PATH, 'utf8')
        .replace('feature-area-slug', area || 'untagged');
    }
  } catch {
    // fall through to inline template
  }
  return `---\ntype: episodic\narea: "${area || 'untagged'}"\nlast-updated: ${new Date().toISOString().slice(0, 10)}\ncycle-count: 0\n---\n\n# ${area || 'Untagged'} Episode History\n\n<!-- Format: Plan-ID | date | what-built | key-decision | notable-deviation | QA/security-finding -->\n`;
}

async function compressEpisodeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const prompt = buildCompressEpisodePrompt({ content });

    const compressed = await callClaude(prompt);
    if (!compressed) {
      log('episodic-writer: compression LLM call returned null, skipping', { file: filePath });
      return false;
    }

    const tmp = filePath + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, compressed, 'utf8');
    fs.renameSync(tmp, filePath);
    log('episodic-writer: compressed', { file: filePath });
    return true;
  } catch (error) {
    log('episodic-writer: compression failed', { file: filePath, error: error.message });
    return false;
  }
}

async function writeEpisodic(episodesDir, moduleTag, entry) {
  const tag = moduleTag || '_untagged';
  const filePath = path.join(episodesDir, `${tag}.md`);

  try {
    if (!fs.existsSync(episodesDir)) fs.mkdirSync(episodesDir, { recursive: true });

    let content;
    content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : loadTemplate(tag);

    // Append new entry
    const today = new Date().toISOString().slice(0, 10);
    content = content + `\n---\n**${today}**\n${entry}\n`;

    // Update frontmatter last-updated and cycle-count
    content = content.replace(/last-updated:\s*[^\n]+/, `last-updated: ${today}`);
    const cycleMatch = content.match(/cycle-count:\s*(\d+)/);
    if (cycleMatch) {
      const newCount = Number.parseInt(cycleMatch[1], 10) + 1;
      content = content.replace(/cycle-count:\s*\d+/, `cycle-count: ${newCount}`);
    }

    const tmp = filePath + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, filePath);

    // Check if compression needed
    if (countWords(content) > WORD_CAP) {
      log('episodic-writer: word cap exceeded, compressing', {
        file: filePath,
        words: countWords(content),
      });
      const compressed = await compressEpisodeFile(filePath);
      return { compressed };
    }

    return { compressed: false };
  } catch (error) {
    log('episodic-writer: write failed', { file: filePath, error: error.message });
    return { compressed: false };
  }
}

module.exports = { writeEpisodic };
