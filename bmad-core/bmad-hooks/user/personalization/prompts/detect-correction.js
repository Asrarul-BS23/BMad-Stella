'use strict';

/**
 * Prompt for Layer 2 correction detection — determines if a user turn contains a behavioral rule.
 * Edit this file to tune detection sensitivity without touching personalization/index.js logic.
 */
function buildDetectCorrectionPrompt({ lastAssistant, lastUser }) {
  return `You are analyzing a conversation turn to determine if the developer issued a behavioral correction to the AI assistant.

LAST ASSISTANT MESSAGE:
${lastAssistant}

LAST USER MESSAGE:
${lastUser}

Is the developer correcting a behavior pattern they want the AI to always follow going forward?
A behavioral correction is: a rule about HOW the AI should work (not just fixing this one case).
Examples of corrections: "never create extra files", "always show full plan before any code", "stop adding trailing summaries"
NOT corrections: "fix that bug", "try again", "that's wrong, do X instead" (one-off fix)

If this IS a behavioral correction, respond with JSON:
{"is_correction": true, "rule": "concise rule text", "agent_context": "which agent type this applies to"}

If NOT a correction, respond with: {"is_correction": false}`;
}

module.exports = { buildDetectCorrectionPrompt };
