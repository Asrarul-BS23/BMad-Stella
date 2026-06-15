'use strict';

function buildCompressEpisodePrompt({ content }) {
  return `You are compressing an episodic memory file that has grown too large.

TASK:
1. Identify the 2 most recent entries — keep them exactly as-is.
2. Take ALL older entries and synthesize them into a single consolidated summary block.
   The summary must capture: what was built, key decisions made, recurring patterns, and notable deviations.
   Do NOT list entries individually — write a cohesive paragraph.
3. Preserve the YAML frontmatter unchanged.

OUTPUT STRUCTURE:
---
<frontmatter fields unchanged>
---

<H1 heading — preserve exactly as in original file>

## Historical Summary
<synthesized summary of all older entries>

---
**YYYY-MM-DD**
<2nd most recent entry — unchanged>

---
**YYYY-MM-DD**
<most recent entry — unchanged>

FILE CONTENT:
${content}`;
}

module.exports = { buildCompressEpisodePrompt };
