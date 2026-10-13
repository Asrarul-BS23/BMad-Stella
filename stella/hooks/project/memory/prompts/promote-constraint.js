'use strict';

function buildPromoteConstraintPrompt({ lessonContent, today }) {
  return `You are promoting a frequently-recurring lesson into an active project constraint.
The lesson has triggered 3 or more times — it is now a standing rule all agents must follow.

LESSON CONTENT:
${lessonContent}

TASK: Produce a constraint file in the exact format below.
- constraint-type: classify as "policy" (behavioral rule), "migration" (transitional state), or "feature" (feature-flag/scope restriction)
- severity: "high" if violation breaks correctness/security, "medium" if it causes rework, "low" otherwise
- expiry-condition: derive from the lesson — if it is a permanent pattern, write "Permanent". If tied to a phase, describe when it ends.
- Keep all sections concise — agents read this at plan time, not implementation time.

OUTPUT FORMAT:
---
type: active-constraint
constraint-type: <policy|migration|feature>
status: active
created: ${today}
expiry-condition: "<when this constraint retires>"
severity: <high|medium|low>
tags: []
---

# <Constraint Title — what must agents remember>

## What It Is
<One paragraph: what recurring mistake this prevents and why it matters>

## What Agents Must Do
<Bullet list: required behaviors while this constraint is active>

## What Agents Must Not Do
<Bullet list: forbidden actions while this constraint is active>

## Expiry Condition
<Same as frontmatter — when does this retire>

Output ONLY the constraint file content, no other text.`;
}

module.exports = { buildPromoteConstraintPrompt };
