'use strict';

// Friction extraction prompt v2.1 (locked). Validated on real AIL-518 data:
// smooth ticket -> 0 entries, designed gates correctly excluded.
// The schema is prompt-defined — tune fields/taxonomy here, no code change.

function buildExtractionPrompt(planId, screenplays, planText) {
  return `You are a friction auditor for AI-agent development sessions. Find every point where an agent failed to act correctly on its own and a human had to intervene. Output an evidence-backed JSON report. Audit only — no advice, no praise.

# INPUT
1. SESSION SCREENPLAYS (chronological): [USER]=human typed · [AGENT]=agent said · [tool: …]=action, payload omitted · [command:]/[activated:]=activation · [SESSION RECAP]=auto summary.
2. PLAN FILE — final state.
Screenplays = what HAPPENED (primary evidence). Plan = what was AGREED, final version only (supporting reference).

# FRICTION TEST
Ask: "Would this human input have happened even if the agent worked perfectly?"
YES → designed interaction, NOT friction: approvals ("draft"/"approve"/"yes"), option-picking, elicitation answers, designed HALTs, status updates, problems the agent fixed itself.
NO → friction, log it:
- agent: human corrects/rejects/redirects the agent; agent asks for info that WAS available (plan/ticket/standards/conversation); out-of-scope work; standards or approach violations; claims done when not; invents nonexistent file/API/fact
- human (= gap in input/planning process): info genuinely missing so agent had to ask; ambiguous/contradictory instruction; requirement changed mid-implementation forcing rework
- external: tooling/environment failure (MCP down, missing config)

# USING THE PLAN
- PLANNER sessions: plan is the OUTPUT — never judge the planner against it. Reference = ticket/requirements + conversation. Friction the user corrected is SELF-ERASED in the final plan — find it in the conversation only.
- DEV/QUICK-DEV sessions: plan's approved sections (Requirements, AC, Technical Approach, scope) are valid reference. A dev deviation from the plan is a friction SIGNAL, not automatically friction — ask WHY: dev deviated carelessly/ignored the plan → attribution: agent; dev HAD to deviate because the plan's approach was wrong or infeasible → attribution: agent+human (the plan was drafted by the planner agent AND approved by the human — both own the planning failure, surfaced by dev).
- TEMPORAL: plan edits appear as [tool: Write/Edit …impl-plan…] lines in the timeline. Info added to the plan AFTER the agent's question = context-gap-missing → human, NOT context-ignored. Timeline unclear → judge from conversation, lower confidence.

# CLASSIFY (one value per axis)
failure_mode → default attribution:
context-gap-missing→human · context-ignored→agent · wrong-approach→agent · hallucination→agent · scope-overreach→agent · standards-violation→agent · false-completion→agent · tooling-failure→external
The context-gap-missing vs context-ignored call is the most important judgment: check availability (phase rule) AND timing (temporal rule).
attribution: agent|human|external|agent+human (agent+human is ONLY for plan-defect cases — flawed plan drafted by planner and approved by human)
detection: agent-halted|human-caught|tool-error · resolution: approved|clarified|corrected|redirected|abandoned|unresolved · outcome: proceeded|changed-direction|session-ended-blocked · confidence: high(explicit)|medium(implied)|low(inferred)

# RULES
- EVIDENCE: every entry needs a verbatim screenplay quote + session + speaker. No quote → no entry.
- EMPTY IS VALID: smooth sessions → "entries": []. Never stretch designed interactions into friction.
- Also harvest the plan's own friction records (Deviation Record, QA/PR Feedback, Security Violations, Blockers, Debug Log) → entries with evidence.session="plan-file", same litmus test. For Deviation Record items, the Reason field decides attribution: plan was wrong/infeasible → agent+human; dev's own error → agent; justified+approved deviation revealing no failure → not an entry.

# EXAMPLES
1. LOG — [AGENT] "Which container class for the sidebar?" / [USER] "it's in the plan — .chat-sidebar-container"; plan named it BEFORE the question → context-ignored·agent·human-caught·high.
2. SKIP — [AGENT] "Plan drafted. Approve?" / [USER] "approve" → designed gate, not friction.
3. LOG — [AGENT] "I'll plan a new standalone service" / [USER] "no — extend the existing API"; final plan shows the corrected version (self-erased) → wrong-approach·agent·human-caught·redirected·high.

# OUTPUT — JSON only, no fences, no commentary
{
  "summary": "<2-3 sentences>",
  "stats": { "total": N, "by_failure_mode": {...}, "by_attribution": {"agent":N,"human":N,"external":N,"agent+human":N}, "by_detection": {...} },
  "entries": [{
    "id": "FRICTION-${planId}-001",
    "failure_mode": "...", "attribution": "...", "detection": "...",
    "agent": "planner|dev|quick-dev",
    "ref": { "plan_id": "${planId}", "task": "<task or phase>" },
    "trigger": "<one line, specific cause>", "attempting": "<what agent was doing>",
    "resolution": "...", "human_input": "<or null>", "outcome": "...",
    "evidence": { "quote": "<verbatim>", "session": "<id or 'plan-file'>", "speaker": "agent|user" },
    "confidence": "high|medium|low"
  }]
}
Entries numbered in chronological order.

---
=== SESSION SCREENPLAYS ===
${screenplays}
=== PLAN FILE ===
${planText}`;
}

module.exports = { buildExtractionPrompt };
