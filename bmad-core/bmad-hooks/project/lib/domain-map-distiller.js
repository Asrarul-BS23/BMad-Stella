'use strict';

// Distills bmad-docs/domain-knowledge/*.md files into bmad-docs/memory/domain-map.md.
// Called by daily-job.js (weekly) and by memory-setup.js at install time (via spawnSync).
// Usage as standalone: node domain-map-distiller.js <cwd>

const path = require('node:path');
const fs = require('node:fs');
const yaml = require('js-yaml');
const { log } = require('./state');
const { callClaude } = require('./llm');
const {
  buildDistillDomainMapPrompt,
  buildDistillDomainMapFromCodePrompt,
} = require('../prompts/distill-domain-map');

const SOURCE_DIR_NAME = 'domain-knowledge';
const TARGET_FILE = path.join('bmad-docs', 'memory', 'domain-map.md');
const PLACEHOLDER_MARKER = '{{domain_map_placeholder}}';

function getSourceDir(cwd) {
  return path.join(cwd, 'bmad-docs', SOURCE_DIR_NAME);
}

function getTargetPath(cwd) {
  return path.join(cwd, TARGET_FILE);
}

function getConfiguredPatterns(cwd) {
  try {
    const configPath = path.join(cwd, '.bmad-core', 'core-config.yaml');
    if (!fs.existsSync(configPath)) return null;
    const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
    const patterns = config?.domainKnowledge?.domainMapSourceFiles;
    if (Array.isArray(patterns) && patterns.length > 0) return patterns;
    return null;
  } catch {
    return null;
  }
}

// Converts a glob pattern (only * wildcard) to a case-insensitive RegExp.
function patternToRegex(pattern) {
  const escaped = pattern.replaceAll(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function matchesAnyPattern(filename, patterns) {
  return patterns.some((p) => patternToRegex(p).test(filename));
}

function readSourceFiles(sourceDir, cwd) {
  try {
    if (!fs.existsSync(sourceDir)) return null;

    const allMd = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md'));
    const patterns = getConfiguredPatterns(cwd);
    const files = patterns ? allMd.filter((f) => matchesAnyPattern(f, patterns)) : allMd;

    if (files.length === 0) {
      log('domain-map-distiller: no source files matched patterns', { patterns });
      return null;
    }

    let combined = '';
    for (const file of files) {
      const content = fs.readFileSync(path.join(sourceDir, file), 'utf8');
      combined += `\n\n### ${file}\n${content}`;
    }
    return combined || null;
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
    const match = content.match(/last-updated:\s*(.*)/);
    if (!match) return null;
    // Strip surrounding YAML quotes (single or double) before checking
    const val = match[1]
      .trim()
      .replaceAll(/^['"]|['"]$/g, '')
      .trim();
    if (!val || val === PLACEHOLDER_MARKER) return null;
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

  const sourceContent = readSourceFiles(sourceDir, cwd);
  if (!sourceContent) {
    log('domain-map-distiller: no source files in domain-knowledge/, skipping', { cwd });
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);

  const prompt = buildDistillDomainMapPrompt({ sourceContent, today });

  const result = await callClaude(prompt);
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

const CODE_SCAN_IGNORE = new Set([
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
  '.bmad-core',
  'bmad-docs',
  '.claude',
]);

function buildShallowTree(dir, prefix = '', depth = 0) {
  if (depth > 2) return '';
  try {
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && !CODE_SCAN_IGNORE.has(e.name))
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
        const sub = buildShallowTree(
          path.join(dir, e.name),
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

async function distillFromCode(cwd) {
  const targetPath = getTargetPath(cwd);
  const today = new Date().toISOString().slice(0, 10);
  const projectTree = buildShallowTree(cwd);

  if (!projectTree) {
    log('domain-map-distiller: empty project tree, skipping from-code distill', { cwd });
    return false;
  }

  const prompt = buildDistillDomainMapFromCodePrompt({ projectTree, today });
  const result = await callClaude(prompt);
  if (!result) {
    log('domain-map-distiller: haiku returned null for from-code distill', { cwd });
    return false;
  }

  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const tmp = targetPath + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, result.trim() + '\n', 'utf8');
    fs.renameSync(tmp, targetPath);
    log('domain-map-distiller: domain-map.md written from codebase scan', {
      cwd,
      chars: result.length,
    });
    return true;
  } catch (error) {
    log('domain-map-distiller: failed to write domain-map.md from code', { error: error.message });
    return false;
  }
}

module.exports = { distill, distillIfStale, isDomainMapStale, distillFromCode };

// Standalone entry point
// Usage: node domain-map-distiller.js <cwd> [--force]
if (require.main === module) {
  const args = process.argv.slice(2);
  const cwd = args.find((a) => !a.startsWith('-'));
  const force = args.includes('--force');
  const fromCode = args.includes('--from-code');
  if (!cwd) {
    process.stderr.write('Usage: node domain-map-distiller.js <cwd> [--force] [--from-code]\n');
    process.exit(1);
  }
  const run = fromCode ? distillFromCode(cwd) : force ? distill(cwd) : distillIfStale(cwd);
  run
    .then((updated) => {
      if (updated) process.stdout.write('domain-map.md updated\n');
      else process.stdout.write('domain-map.md unchanged\n');
    })
    .catch((error) => {
      process.stderr.write(`Error: ${error.message}\n`);
      process.exit(1);
    });
}
