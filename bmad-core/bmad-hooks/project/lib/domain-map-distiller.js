'use strict';

// Distills bmad-docs/domain-knowledge/*.md files into bmad-docs/memory/domain-map.md.
// Called by daily-job.js (weekly) and by memory-setup.js at install time (via spawnSync).
// Usage as standalone: node domain-map-distiller.js <cwd>

const path = require('node:path');
const fs = require('node:fs');
const { log } = require('./state');
const { callHaiku } = require('./llm');

const SOURCE_DIR_NAME = 'domain-knowledge';
const TARGET_FILE = path.join('bmad-docs', 'memory', 'domain-map.md');
const MAX_SOURCE_CHARS = 8000;
const PLACEHOLDER_MARKER = '{{domain_map_placeholder}}';

function getSourceDir(cwd) {
  return path.join(cwd, 'bmad-docs', SOURCE_DIR_NAME);
}

function getTargetPath(cwd) {
  return path.join(cwd, TARGET_FILE);
}

function readSourceFiles(sourceDir) {
  try {
    if (!fs.existsSync(sourceDir)) return null;
    const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md'));
    if (files.length === 0) return null;

    let combined = '';
    for (const file of files) {
      const content = fs.readFileSync(path.join(sourceDir, file), 'utf8');
      combined += `\n\n### ${file}\n${content}`;
      if (combined.length > MAX_SOURCE_CHARS) break;
    }
    return combined.slice(0, MAX_SOURCE_CHARS);
  } catch (error) {
    log('domain-map-distiller: failed to read source files', { error: error.message });
    return null;
  }
}

function getSourceMtime(sourceDir) {
  try {
    if (!fs.existsSync(sourceDir)) return null;
    const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md'));
    if (files.length === 0) return null;
    let latest = new Date(0);
    for (const file of files) {
      const mtime = fs.statSync(path.join(sourceDir, file)).mtime;
      if (mtime > latest) latest = mtime;
    }
    return latest;
  } catch {
    return null;
  }
}

function getDomainMapLastUpdated(targetPath) {
  try {
    if (!fs.existsSync(targetPath)) return null;
    const content = fs.readFileSync(targetPath, 'utf8');
    const match = content.match(/last-updated:\s*"?([^"\n]+)"?/);
    if (!match) return null;
    const val = match[1].trim();
    if (val === PLACEHOLDER_MARKER || val === '') return null;
    return new Date(val);
  } catch {
    return null;
  }
}

function isDomainMapStale(cwd) {
  const sourceDir = getSourceDir(cwd);
  const targetPath = getTargetPath(cwd);

  // If target doesn't exist or is still placeholder, always distill
  if (!fs.existsSync(targetPath)) return true;
  const content = fs.readFileSync(targetPath, 'utf8');
  if (content.includes(PLACEHOLDER_MARKER)) return true;

  const sourceMtime = getSourceMtime(sourceDir);
  if (!sourceMtime) return false; // no source files, nothing to do

  const domainMapDate = getDomainMapLastUpdated(targetPath);
  if (!domainMapDate) return true; // no last-updated, assume stale

  return sourceMtime > domainMapDate;
}

async function distill(cwd) {
  const sourceDir = getSourceDir(cwd);
  const targetPath = getTargetPath(cwd);

  const sourceContent = readSourceFiles(sourceDir);
  if (!sourceContent) {
    log('domain-map-distiller: no source files in domain-knowledge/, skipping', { cwd });
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);

  const prompt = `You are distilling Confluence domain-knowledge documentation into a concise project domain map.

SOURCE DOCUMENTS:
${sourceContent}

TASK: Produce a distilled domain-map.md with this exact structure:

---
type: domain-map
project: "[infer project name from content]"
last-updated: "${today}"
confluence-source: "[infer page title from content]"
---

# Project Domain Map

## Business Purpose
[1-2 sentences: what the system does and why it exists]

## Core Domain Entities
[Bullet list of key business objects and their relationships — be specific]

## Business Rules
[Bullet list of non-negotiable invariants no code should ever violate]

Keep it concise — this is a quick-reference card, not a full document. Output ONLY the file content.`;

  const result = await callHaiku(prompt, 1500);
  if (!result) {
    log('domain-map-distiller: haiku returned null, skipping', { cwd });
    return false;
  }

  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const tmp = targetPath + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, result.trim() + '\n', 'utf8');
    fs.renameSync(tmp, targetPath);
    log('domain-map-distiller: domain-map.md updated', { cwd, chars: result.length });
    return true;
  } catch (error) {
    log('domain-map-distiller: failed to write domain-map.md', { error: error.message });
    return false;
  }
}

async function distillIfStale(cwd) {
  if (!isDomainMapStale(cwd)) {
    log('domain-map-distiller: domain-map.md is up-to-date, skipping', { cwd });
    return false;
  }
  return distill(cwd);
}

module.exports = { distill, distillIfStale, isDomainMapStale };

// Standalone entry point
if (require.main === module) {
  const cwd = process.argv[2];
  if (!cwd) {
    process.stderr.write('Usage: node domain-map-distiller.js <cwd>\n');
    process.exit(1);
  }
  distillIfStale(cwd)
    .then((updated) => {
      if (updated) process.stdout.write('domain-map.md updated\n');
      else process.stdout.write('domain-map.md unchanged\n');
    })
    .catch((error) => {
      process.stderr.write(`Error: ${error.message}\n`);
      process.exit(1);
    });
}
