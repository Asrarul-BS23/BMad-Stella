'use strict';

const path = require('node:path');
const fs = require('node:fs');
const yaml = require('js-yaml');
const { log } = require('./state');
const { callClaude } = require('./llm');
const { buildConsolidateSemanticPrompt } = require('../prompts/consolidate-semantic');

const TEMPLATE_PATH = path.join(
  __dirname,
  '..',
  '..',
  'templates',
  'memories',
  'semantic',
  '_template.md',
);

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    return yaml.load(match[1]) || {};
  } catch {
    return {};
  }
}

function readEpisodeLastUpdated(memoryDir, episodePath) {
  try {
    const fullPath = path.join(memoryDir, episodePath);
    if (!fs.existsSync(fullPath)) return null;
    const content = fs.readFileSync(fullPath, 'utf8');
    const fm = parseFrontmatter(content);
    return fm['last-updated'] || null;
  } catch {
    return null;
  }
}

function isEpisodeNewerThanSemantic(memoryDir, episodeSources, semanticLastUpdated) {
  if (!semanticLastUpdated) return true;
  for (const source of episodeSources) {
    const episodeDate = readEpisodeLastUpdated(memoryDir, source);
    if (episodeDate && episodeDate > semanticLastUpdated) return true;
  }
  return false;
}

async function consolidateSemantic(memoryDir, semanticFilePath) {
  try {
    const content = fs.readFileSync(semanticFilePath, 'utf8');
    const fm = parseFrontmatter(content);
    const episodeSources = fm['episode-sources'] || [];
    const lastUpdated = fm['last-updated'] || null;

    if (!isEpisodeNewerThanSemantic(memoryDir, episodeSources, lastUpdated)) {
      log('semantic-consolidator: semantic is up-to-date, skipping', { file: semanticFilePath });
      return;
    }

    // Gather episode content for consolidation
    const episodeContents = [];
    for (const source of episodeSources) {
      const fullPath = path.join(memoryDir, source);
      if (fs.existsSync(fullPath)) {
        episodeContents.push(`### ${source}\n${fs.readFileSync(fullPath, 'utf8')}`);
      }
    }

    if (episodeContents.length === 0) {
      log('semantic-consolidator: no episode sources found', { file: semanticFilePath });
      return;
    }

    const prompt = buildConsolidateSemanticPrompt({
      currentContent: content,
      episodeContents: episodeContents.join('\n\n---\n\n').slice(0, 6000),
      today: new Date().toISOString().slice(0, 10),
    });

    const newContent = await callClaude(prompt);
    if (!newContent) {
      log('semantic-consolidator: LLM returned null, skipping', { file: semanticFilePath });
      return;
    }

    // Rename old semantic file with superseded-by marker
    const dir = path.dirname(semanticFilePath);
    const base = path.basename(semanticFilePath, '.md');
    const prevPath = path.join(dir, `${base}-prev.md`);

    const today = new Date().toISOString().slice(0, 10);
    const supersededContent = `<!-- superseded-by: ${base}.md on ${today} -->\n\n` + content;
    fs.writeFileSync(prevPath, supersededContent, 'utf8');

    // Write new semantic file
    const tmp = semanticFilePath + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, newContent, 'utf8');
    fs.renameSync(tmp, semanticFilePath);

    log('semantic-consolidator: consolidated', { file: semanticFilePath, prev: prevPath });
  } catch (error) {
    log('semantic-consolidator: failed', { file: semanticFilePath, error: error.message });
  }
}

async function consolidateAll(memoryDir) {
  const semanticDir = path.join(memoryDir, 'semantic');
  if (!fs.existsSync(semanticDir)) return;

  const files = fs
    .readdirSync(semanticDir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_') && !f.endsWith('-prev.md'));

  for (const file of files) {
    await consolidateSemantic(memoryDir, path.join(semanticDir, file));
  }
}

module.exports = { consolidateSemantic, consolidateAll };
