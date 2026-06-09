'use strict';

/**
 * Builds a prompt for detecting behavioral corrections across a full session.
 * Called once at SessionEnd with all keyword-matched exchange pairs from the session.
 *
 * @param {Array<{assistant: string, user: string}>} exchanges - Pre-filtered exchanges
 * @returns {string}
 */
function buildDetectCorrectionsSessionPrompt({ exchanges }) {
  const formatted = exchanges
    .map((e, i) => `--- Exchange ${i + 1} ---\nAssistant: ${e.assistant}\nUser: ${e.user}`)
    .join('\n\n');

  return `You are analyzing a conversation between a developer and an AI coding assistant (BMad).
Review the exchanges below and identify any behavioral corrections the developer made.

A correction is when the developer tells BMad to change HOW it behaves going forward — not what to build.
Examples of corrections:
- "don't create extra files I didn't ask for"
- "always show me the diff before applying changes"
- "stop adding comments everywhere"
- "I told you, never run migrations automatically"

NOT a correction:
- Changing requirements or scope ("actually, make it do X instead")
- Asking a follow-up question
- Saying something was wrong about the output content (not the behavior)

For each correction found, extract:
- rule: a concise, actionable rule BMad should follow going forward (present tense, imperative)
- agent_context: which agent context applies — "dev", "planner", "qa", "security", or "general"

Exchanges to review:
${formatted}

Respond ONLY with valid JSON. No explanation, no markdown fences.
If no corrections found, return: {"corrections": []}
If corrections found: {"corrections": [{"rule": "...", "agent_context": "..."}]}`;
}

module.exports = { buildDetectCorrectionsSessionPrompt };
