'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { log } = require('./state');

const CHAR_CAP = 10_000;

function readFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function isDomainMapMeaningful(content) {
  if (!content) return false;
  // Blank stub has empty sections — skip injection if none of the three sections have content
  const sections = ['## Business Purpose', '## Core Domain Entities', '## Business Rules'];
  for (const section of sections) {
    const idx = content.indexOf(section);
    if (idx === -1) continue;
    const after = content.slice(idx + section.length).trim();
    if (after && !after.startsWith('#')) return true;
  }
  return false;
}

function loadActiveConstraints(memoryDir) {
  const constraintsDir = path.join(memoryDir, 'constraints');
  if (!fs.existsSync(constraintsDir)) return '';
  const files = fs
    .readdirSync(constraintsDir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  const parts = [];
  for (const file of files) {
    const content = readFile(path.join(constraintsDir, file));
    if (content) parts.push(content);
  }
  return parts.join('\n\n---\n\n');
}

function loadEpisode(memoryDir, moduleTag) {
  if (!moduleTag) return readFile(path.join(memoryDir, 'episodes', '_untagged.md')) || '';
  const filePath = path.join(memoryDir, 'episodes', `${moduleTag}.md`);
  return readFile(filePath) || '';
}

function semanticCoversModule(content, moduleTag) {
  // Direct filename match is handled by caller; this checks episode-sources frontmatter.
  // Frontmatter is between the first two --- delimiters.
  const fmEnd = content.indexOf('\n---', 3);
  const frontmatter = fmEnd === -1 ? content.slice(0, 400) : content.slice(0, fmEnd);
  // Match "- <moduleTag>" as a list entry under episode-sources
  return new RegExp(`-\\s+${moduleTag}\\b`, 'i').test(frontmatter);
}

function loadSemantic(memoryDir, moduleTag) {
  if (!moduleTag) return '';
  const semanticDir = path.join(memoryDir, 'semantic');
  if (!fs.existsSync(semanticDir)) return '';

  const files = fs.readdirSync(semanticDir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  const parts = [];
  for (const file of files) {
    const content = readFile(path.join(semanticDir, file));
    if (!content) continue;
    // Include if filename matches OR episode-sources frontmatter lists this module-tag
    if (file === `${moduleTag}.md` || semanticCoversModule(content, moduleTag)) {
      parts.push(content);
    }
  }
  return parts.join('\n\n---\n\n');
}

function loadMatchedLessons(memoryDir, moduleTag) {
  const lessonsDir = path.join(memoryDir, 'lessons');
  if (!fs.existsSync(lessonsDir)) return '';
  const files = fs.readdirSync(lessonsDir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  const parts = [];
  for (const file of files) {
    const content = readFile(path.join(lessonsDir, file));
    if (!content) continue;
    // Include lesson if it has matching tags or if moduleTag matches area
    if (!moduleTag || content.includes(moduleTag)) {
      parts.push(content);
    }
  }
  return parts.join('\n\n---\n\n');
}

function assembleContext(memoryDir, moduleTag) {
  const memoryIndex = readFile(path.join(memoryDir, 'MEMORY.md')) || '';
  const rawDomainMap = readFile(path.join(memoryDir, 'domain-map.md'));
  const domainMap = isDomainMapMeaningful(rawDomainMap) ? rawDomainMap : '';
  const constraints = loadActiveConstraints(memoryDir);
  const episode = loadEpisode(memoryDir, moduleTag);
  const semantic = loadSemantic(memoryDir, moduleTag);
  const lessons = loadMatchedLessons(memoryDir, moduleTag);

  const sections = [
    { label: '## Memory Index\n', content: memoryIndex },
    { label: '## Domain Map\n', content: domainMap },
    { label: '## Active Constraints\n', content: constraints },
    { label: '## Episode Memory\n', content: episode },
    { label: '## Semantic Knowledge\n', content: semantic },
    { label: '## Lessons Learned\n', content: lessons },
  ];

  let assembled = '';
  for (const section of sections) {
    if (!section.content.trim()) continue;
    const candidate = assembled + '\n\n' + section.label + section.content;
    if (candidate.length > CHAR_CAP) {
      // Truncate this section to fit within cap
      const remaining = CHAR_CAP - assembled.length - section.label.length - 10;
      if (remaining > 100) {
        assembled +=
          '\n\n' + section.label + section.content.slice(0, remaining) + '\n[...truncated]';
      }
      break;
    }
    assembled = candidate;
  }

  return assembled.trim();
}

module.exports = { assembleContext };
