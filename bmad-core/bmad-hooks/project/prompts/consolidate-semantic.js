'use strict';

/**
 * Prompt for semantic consolidation — synthesises episodic sources into current-state knowledge.
 * Edit this file to tune prompt behavior without touching semantic-consolidator.js logic.
 */
function buildConsolidateSemanticPrompt({ currentContent, episodeContents, today }) {
  return `You are consolidating episodic memory into semantic (current-state) knowledge for a software project.

CURRENT SEMANTIC FILE:
${currentContent}

EPISODE SOURCES:
${episodeContents}

TASK: Produce an updated semantic file that reflects the CURRENT STATE of this domain.
- No chronology, no history — current state only
- Preserve the YAML frontmatter exactly — keep all existing fields including episode-sources list unchanged. Set last-updated to exactly: "${today}"
- episode-sources must not be removed or renamed — the memory system uses it for staleness detection
- Populate: Current State, Established Patterns, Known Gotchas, Invariants, Reference Implementation
- Keep it concise — this is reference knowledge, not a history log
- Output ONLY the complete updated file content (frontmatter + body)`;
}

module.exports = { buildConsolidateSemanticPrompt };
