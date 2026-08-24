'use strict';

// Maintains bmad-docs/memory/MEMORY.md — live index of all files in the memory system.
// Called after any write to episodes/, lessons/, semantic/, constraints/, or patterns.md.
// Planner reads this index at plan start to discover which module files exist.

const path = require('node:path');
const fs = require('node:fs');
const { log } = require('./state');

const MEMORY_MD = 'MEMORY.md';

function listFiles(dir, ext = '.md') {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(ext) && !f.startsWith('_template'))
      .sort()
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function relPath(cwd, absPath) {
  return absPath.replace(cwd + path.sep, '').replaceAll(path.sep, '/');
}

function updateMemoryIndex(memoryDir, cwd) {
  try {
    const lines = [];
    lines.push(
      '# Project Memory Index',
      '',
      '> Auto-managed by BMad memory system. Do not edit manually.',
      '',
      '## Always Injected at Agent Activation',
    );
    const domainMap = path.join(memoryDir, 'domain-map.md');
    if (fs.existsSync(domainMap)) {
      lines.push(`- \`${relPath(cwd, domainMap)}\` — business context, core entities, invariants`);
    }
    const patterns = path.join(memoryDir, 'patterns.md');
    if (fs.existsSync(patterns)) {
      lines.push(
        `- \`${relPath(cwd, patterns)}\` — reusable code index (shared folders and file trees)`,
      );
    }
    lines.push('');

    // Constraints — always read, listed individually
    const constraintFiles = listFiles(path.join(memoryDir, 'constraints'));
    lines.push('## Active Constraints');
    if (constraintFiles.length > 0) {
      for (const f of constraintFiles) {
        lines.push(`- \`${relPath(cwd, f)}\``);
      }
    } else {
      lines.push('- (none)');
    }
    lines.push('');

    // Episodes
    const episodeFiles = listFiles(path.join(memoryDir, 'episodes'));
    lines.push('## Episodes', '_Read by Planner for the relevant module area._');
    if (episodeFiles.length > 0) {
      for (const f of episodeFiles) {
        lines.push(`- \`${relPath(cwd, f)}\``);
      }
    } else {
      lines.push('- (none yet)');
    }
    lines.push('');

    // Semantic — `-prev.md` files are superseded snapshots kept for reference
    // only; indexing them invites agents to read stale current-state knowledge.
    const semanticFiles = listFiles(path.join(memoryDir, 'semantic')).filter(
      (f) => !f.endsWith('-prev.md'),
    );
    lines.push(
      '## Semantic',
      '_Distilled current-state knowledge. Read by Planner for the relevant domain._',
    );
    if (semanticFiles.length > 0) {
      for (const f of semanticFiles) {
        lines.push(`- \`${relPath(cwd, f)}\``);
      }
    } else {
      lines.push('- (none yet)');
    }
    lines.push('');

    // Lessons
    const lessonFiles = listFiles(path.join(memoryDir, 'lessons'));
    lines.push(
      '## Lessons',
      '_Agent failure rules per module. Read by Planner for the relevant module._',
    );
    if (lessonFiles.length > 0) {
      for (const f of lessonFiles) {
        lines.push(`- \`${relPath(cwd, f)}\``);
      }
    } else {
      lines.push('- (none yet)');
    }
    lines.push(
      '',
      '## Notes',
      '- `bmad-docs/memory/` is gitignored — each developer has independent local memory.',
      '- PC migration: copy `~/.claude/personalization.md` + `bmad-docs/memory/` to same paths on new machine.',
      '',
    );

    const content = lines.join('\n');
    const indexPath = path.join(memoryDir, MEMORY_MD);
    fs.writeFileSync(indexPath, content, 'utf8');
    log('memory-index: MEMORY.md updated', { memoryDir });
  } catch (error) {
    log('memory-index: update failed', { error: error.message });
  }
}

module.exports = { updateMemoryIndex };
