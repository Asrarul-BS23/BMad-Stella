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
[4-5 sentences: what the system does and why it exists]

## Core Domain Entities
[Bullet list of key business objects and their relationships — be specific]

## Business Rules
[Bullet list of non-negotiable invariants no code should ever violate]

Keep it concise — this is a quick-reference card, not a full document. Output ONLY the file content.`;
}

function buildDistillDomainMapFromCodePrompt({ cwd, today }) {
  return `You are building a business domain map by exploring a software project's source code.

PROJECT ROOT: ${cwd}

Use your file exploration tools (Glob, Read, Grep) to discover what this system actually does.
Explore intelligently — do not guess from paths alone. Read the actual content of relevant files.

WHAT TO LOOK FOR (framework-agnostic — adapt to whatever stack you find):
- README, CHANGELOG, or docs at the project root
- Schema / model / entity definitions (Prisma, SQL migrations, Django models, ActiveRecord, Go structs, JPA entities, etc.)
- Service, use-case, or domain logic layer
- API route or controller definitions
- Enums, constants, or value objects with business meaning
- Test descriptions (describe/it blocks, docstrings) — they document expected behaviour in plain language

EXPLORATION STRATEGY:
1. Start with Glob to get a broad picture of the project structure
2. Identify which areas are worth reading based on folder/file names
3. Read the most signal-rich files first (schemas, models, services)
4. Use Grep to find domain-specific terms if the structure is unclear
5. Stop when you have enough to write a confident, grounded domain map

TASK: Produce a distilled domain-map.md with this exact structure:

---
type: domain-map
project: "[project name from code or root folder]"
last-updated: "${today}"
confluence-source: "inferred from codebase"
---

# Project Domain Map

## Business Purpose
[4-5 sentences: what the system does and why it exists — grounded in what you actually read]

## Core Domain Entities
[Bullet list of key business objects with their relationships — sourced from schemas/models you read]

## Business Rules
[Bullet list of non-negotiable invariants found in code — constraints, validations, required fields, enum values]

Keep concise. Output ONLY the file content.`;
}

module.exports = { buildDistillDomainMapPrompt, buildDistillDomainMapFromCodePrompt };
