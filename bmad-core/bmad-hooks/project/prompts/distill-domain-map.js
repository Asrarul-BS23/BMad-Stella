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

function buildDistillDomainMapFromCodePrompt({ projectTree, today }) {
  return `You are inferring the business domain of a software project from its code structure.

No Confluence documentation exists. Infer domain and business purpose from folder names, file names, and project structure.

PROJECT STRUCTURE:
${projectTree}

TASK: Produce a distilled domain-map.md with this exact structure:

---
type: domain-map
project: "[infer project name from structure]"
last-updated: "${today}"
confluence-source: "inferred from codebase"
---

# Project Domain Map

## Business Purpose
[4-5 sentences: what the system likely does and why it exists — infer from folder/file names]

## Core Domain Entities
[Bullet list of key business objects inferred from folder/file names — be specific]

## Business Rules
[Bullet list of likely invariants inferred from structure — prefix uncertain items with "(inferred)"]

Keep concise. Output ONLY the file content.`;
}

module.exports = { buildDistillDomainMapPrompt, buildDistillDomainMapFromCodePrompt };
