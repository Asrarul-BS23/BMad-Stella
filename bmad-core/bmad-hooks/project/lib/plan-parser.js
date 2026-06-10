'use strict';

const fs = require('node:fs');
const yaml = require('js-yaml');
const { log } = require('./state');

function parseStatus(content) {
  const match = content.match(/##\s+Status\s*\n+([^\n]+)/i);
  return match ? match[1].trim() : '';
}

function parseMemorySignals(content) {
  // Find the Memory Signals section then the first yaml code block inside it
  const sectionMatch = content.match(/##\s+Memory Signals\s*\n([\s\S]*?)(?=\n##\s+|\s*$)/i);
  if (!sectionMatch) return null;

  const yamlBlockMatch = sectionMatch[1].match(/```yaml\s*([\s\S]*?)```/i);
  if (!yamlBlockMatch) return null;

  try {
    const parsed = yaml.load(yamlBlockMatch[1]);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      name: parsed.name || null,
      description: parsed.description || null,
      moduleTag: parsed.metadata?.['module-tag'] || null,
      type: parsed.metadata?.type || 'project',
    };
  } catch {
    return null;
  }
}

function parseFrontmatter(content) {
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return null;
  const fm = content.slice(0, end + 4);
  // Regex extraction — avoids yaml parse errors from unquoted colons in description values
  const moduleTag = (fm.match(/module-tag:\s*([^\n]+)/) || [])[1]?.trim() || null;
  const type = (fm.match(/\btype:\s*([^\n]+)/) || [])[1]?.trim() || 'project';
  const name = (fm.match(/^name:\s*([^\n]+)/m) || [])[1]?.trim() || null;
  const description = (fm.match(/^description:\s*([^\n]+)/m) || [])[1]?.trim() || null;
  if (!moduleTag && !name) return null;
  return { name, description, moduleTag, type };
}

function parsePlanFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    // Memory Signals section takes precedence; frontmatter is fallback
    const signals = parseMemorySignals(content) || parseFrontmatter(content);

    return {
      filePath,
      content, // full text — passed to haiku for lesson/pattern extraction
      status: parseStatus(content),
      name: signals?.name || null,
      description: signals?.description || null,
      moduleTag: signals?.moduleTag || null,
      type: signals?.type || 'project',
    };
  } catch (error) {
    log('plan-parser: failed to parse', { file: filePath, error: error.message });
    return null;
  }
}

module.exports = { parsePlanFile, parseMemorySignals };
