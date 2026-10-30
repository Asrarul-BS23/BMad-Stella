'use strict';

/**
 * Builds a prompt for detecting behavioral corrections and behavioral observations
 * across a full session. Called once at SessionEnd.
 *
 * @param {Array<{assistant: string, user: string}>} exchanges - Keyword-filtered exchanges for corrections
 * @param {Array<{assistant: string, user: string}>} allExchanges - Full session exchanges for observations
 * @returns {string}
 */
function buildDetectCorrectionsSessionPrompt({ exchanges, allExchanges }) {
  const formattedFiltered = exchanges
    .map((e, i) => `--- Exchange ${i + 1} ---\nAssistant: ${e.assistant}\nUser: ${e.user}`)
    .join('\n\n');

  const formattedAll = (allExchanges || exchanges)
    .map((e, i) => `--- Exchange ${i + 1} ---\nAssistant: ${e.assistant}\nUser: ${e.user}`)
    .join('\n\n');

  return `You are analyzing a conversation between a developer and an AI coding assistant (BMad).

Respond ONLY with valid JSON. No explanation, no markdown fences:
{"corrections": [...], "observations": {...}}

===== PART 1: BEHAVIORAL CORRECTIONS =====

Review the pre-filtered exchanges below. A correction is when the developer permanently changes HOW BMad behaves — not what to build.

Extract only corrections where the developer's intent to change BMad's permanent behavior is unambiguous — if intent is ambiguous, skip it.
Skip if the developer qualified it as one-time: "just this once", "for this task", "in this case", "this time" disqualify it.

Examples of corrections:
- "don't create extra files I didn't ask for"
- "always show me the diff before applying changes"
- "stop adding comments everywhere"
- "I told you, never run migrations automatically"

NOT a correction:
- Changing requirements or scope ("actually, make it do X instead")
- Asking a follow-up question
- Criticizing a specific output ("this function is wrong") — test: is the developer correcting BMad's working style, or the content of one specific response? Content → skip

For each correction found:
- rule: format as "Never [action]" or "Always [action] when [condition]" — one sentence, no hedging words (avoid/try/consider/prefer)
- agent_context: "dev" | "planner" | "qa" | "security" | "general". Use specific agent only if the correction was directed at that agent's behavior in the exchange. Use "general" if the rule applies across agents or the active agent is unclear.

Return [] if no unambiguous corrections found.

Exchanges to review for corrections:
${formattedFiltered}

===== PART 2: BEHAVIORAL OBSERVATIONS =====

Review ALL exchanges below and assess two behavioral patterns. Return null for any value you cannot determine from the available exchanges.

1. PLAN APPROVAL STYLE
Did BMad present an implementation plan? Look for numbered steps, task breakdowns, or sections titled "Plan" or "Implementation Plan".
- "plan_presented": true if a plan was presented, false if not
- "plan_first_approval": true if developer approved on first response without requesting changes; false if developer requested changes, refinements, or revisions; null if no plan was presented

2. CONTEXT QUALITY
How precisely does the developer provide context when making requests? Judge by the user messages across all exchanges.
- "precise": includes file paths, specific function/class/module names, clear scope boundaries
- "vague": describes problems or features in general terms without file references or specific scope
- "mixed": some requests precise, others vague within the same session
- "unclear": too few exchanges to judge
- "context_quality": one of the four values above

All exchanges for observations:
${formattedAll}`;
}

module.exports = { buildDetectCorrectionsSessionPrompt };
