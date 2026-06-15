'use strict';

// Manages bmad-docs/memory/patterns.md — index of reusable code locations.
// One entry per tracked path: folder paths get an ASCII tree, individual file paths get a single-line entry.
// No reuse-count, no candidates/validated — just live structure for Planner to navigate.

const path = require('node:path');
const fs = require('node:fs');
const { log } = require('./state');

const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  'out',
  'bin',
  'obj',
  '.vs',
  '__pycache__',
  '.cache',
]);

function buildTree(folderAbs, prefix = '', depth = 0) {
  if (depth > 4) return '';
  try {
    const entries = fs
      .readdirSync(folderAbs, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && !IGNORE_DIRS.has(e.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    const lines = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const isLast = i === entries.length - 1;
      lines.push(`${prefix}${isLast ? '└── ' : '├── '}${e.name}`);
      if (e.isDirectory()) {
        const sub = buildTree(
          path.join(folderAbs, e.name),
          prefix + (isLast ? '    ' : '│   '),
          depth + 1,
        );
        if (sub) lines.push(sub);
      }
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

function parseKnownPaths(patternsFile) {
  if (!fs.existsSync(patternsFile)) return [];
  const content = fs.readFileSync(patternsFile, 'utf8');
  return [...content.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
}

function isFile(entryRel, cwd) {
  try {
    return fs.statSync(path.join(cwd, entryRel)).isFile();
  } catch {
    return path.extname(entryRel) !== '';
  }
}

function buildEntry(entryRel, cwd) {
  if (isFile(entryRel, cwd)) {
    return `## ${entryRel}\n\`${path.basename(entryRel)}\` — reusable file`;
  }
  const folderAbs = path.join(cwd, entryRel);
  const tree = buildTree(folderAbs);
  return `## ${entryRel}\n\`\`\`\n${entryRel}/\n${tree || '(empty)'}\n\`\`\``;
}

function updateEntry(patternsFile, entryRel, cwd) {
  const newEntry = buildEntry(entryRel, cwd);
  let content = fs.existsSync(patternsFile) ? fs.readFileSync(patternsFile, 'utf8') : '';

  const sections = content.split(/(?=^## )/m);
  const idx = sections.findIndex((s) => s.startsWith(`## ${entryRel}\n`));

  if (idx === -1) {
    const trimmed = content.trimEnd();
    content = (trimmed ? trimmed + '\n\n' : '') + newEntry + '\n';
  } else {
    sections[idx] = newEntry + '\n\n';
    content = sections.join('');
  }

  fs.writeFileSync(patternsFile, content, 'utf8');
}

// Rescan all tracked paths — rebuild folder trees, verify single files still exist (weekly)
function refreshPatternTrees(memoryDir, cwd) {
  try {
    const patternsFile = path.join(memoryDir, 'patterns.md');
    const known = parseKnownPaths(patternsFile);
    if (known.length === 0) return;
    for (const entryRel of known) {
      updateEntry(patternsFile, entryRel, cwd);
    }
    log('pattern-writer: patterns refreshed', { count: known.length });
  } catch (error) {
    log('pattern-writer: refreshPatternTrees failed', { error: error.message });
  }
}

// Write patterns.md from scratch with a list of folder/file paths (install time)
function writeInitialPatterns(memoryDir, entries, cwd) {
  try {
    const patternsFile = path.join(memoryDir, 'patterns.md');
    fs.writeFileSync(patternsFile, '', 'utf8');
    for (const entryRel of entries) {
      updateEntry(patternsFile, entryRel, cwd);
    }
    log('pattern-writer: initial patterns.md written', { count: entries.length });
  } catch (error) {
    log('pattern-writer: writeInitialPatterns failed', { error: error.message });
  }
}

module.exports = { refreshPatternTrees, writeInitialPatterns };
