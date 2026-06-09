'use strict';

/**
 * Prompt for domain-map distillation — condenses Confluence domain-knowledge pages into a
 * concise reference card. Edit this file to tune output structure without touching distiller logic.
 */
function buildDistillDomainMapPrompt({ sourceContent, today }) {
  return `You are distilling Confluence domain-knowledge documentation into a concise project domain map.

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
}

module.exports = { buildDistillDomainMapPrompt };
