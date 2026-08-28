'use strict';

const fs = require('node:fs');
const yaml = require('js-yaml');
const { log } = require('./state');
const { normalizeModuleTag } = require('./slug');

function parseStatus(content) {
  const match = content.match(/##\s+Status\s*\n+([^\n]+)/i);
  return match ? match[1].trim() : '';
}

function readMetadataTag(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  return metadata['module-tag'] || metadata['module_tag'] || metadata.moduleTag || null;
}

// Heading-agnostic: the planner doesn't reliably render the "## Memory Signals"
// heading before the yaml block, so search the region before "## Status" (the
// next section in the template, always present) for the first yaml fence that
// looks like the metadata block, rather than requiring an exact heading string.
// Bounding on "## Status" specifically (not "any ## heading") matters because
// "## Memory Signals" itself, when present, is a heading that would otherwise
// wrongly truncate the region before the yaml fence it precedes.
function parseMemorySignals(content) {
  const statusHeadingMatch = content.match(/\n##\s+Status\s*\n/i);
  const searchRegion = statusHeadingMatch ? content.slice(0, statusHeadingMatch.index) : content;

  const yamlBlockMatch = searchRegion.match(/```yaml\s*([\s\S]*?)```/i);
  if (!yamlBlockMatch) return null;

  try {
    const parsed = yaml.load(yamlBlockMatch[1]);
    if (!parsed || typeof parsed !== 'object') return null;
    // Guard against matching an unrelated yaml fence — require it to look like
    // the memory-signals metadata block.
    if (!parsed.name && !readMetadataTag(parsed.metadata)) return null;
    return {
      name: parsed.name || null,
      description: parsed.description || null,
      moduleTag: readMetadataTag(parsed.metadata),
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
    // Memory Signals yaml block takes precedence; frontmatter is fallback
    const signals = parseMemorySignals(content) || parseFrontmatter(content);
    const moduleTag = normalizeModuleTag(signals?.moduleTag);

    if (!moduleTag) {
      log('plan-parser: no module-tag resolved, defaulting to untagged', { file: filePath });
    }

    return {
      filePath,
      content, // full text — passed to claude for lesson/pattern extraction
      status: parseStatus(content),
      name: signals?.name || null,
      description: signals?.description || null,
      moduleTag,
      type: signals?.type || 'project',
    };
  } catch (error) {
    log('plan-parser: failed to parse', { file: filePath, error: error.message });
    return null;
  }
}

module.exports = { parsePlanFile, parseMemorySignals };
