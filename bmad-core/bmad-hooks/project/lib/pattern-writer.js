'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { log } = require('./state');

function slugify(name) {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 60);
}

function writePatternCandidate(patternsDir, pattern, planId) {
  try {
    fs.mkdirSync(patternsDir, { recursive: true });
    const slug = slugify(pattern.name);
    const filePath = path.join(patternsDir, `${slug}.md`);

    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      const reuseMatch = content.match(/reuse-count:\s*(\d+)/);
      if (reuseMatch) {
        const newCount = Number.parseInt(reuseMatch[1], 10) + 1;
        content = content.replace(/reuse-count:\s*\d+/, `reuse-count: ${newCount}`);
        if (newCount >= 3) {
          content = content.replace(/status:\s*candidate/, 'status: validated');
          log('pattern-writer: pattern promoted to validated', { slug, reuseCount: newCount });
        }
        fs.writeFileSync(filePath, content, 'utf8');
        log('pattern-writer: reuse count updated', { slug, reuseCount: newCount });
      }
      return;
    }

    const fileContent = `---
type: pattern
name: "${pattern.name}"
tags: []
status: candidate
introduced-in: "${planId}"
reuse-count: 1
---

# ${pattern.name}

## When to Use
${pattern.whenToUse}

## Reference Implementation
- File: \`${pattern.referenceFile || 'see plan: ' + planId}\`

## What NOT to Do
${pattern.whatNotToDo}
`;
    fs.writeFileSync(filePath, fileContent, 'utf8');
    log('pattern-writer: pattern candidate written', { slug });
  } catch (error) {
    log('pattern-writer: write failed', { error: error.message });
  }
}

module.exports = { writePatternCandidate };
