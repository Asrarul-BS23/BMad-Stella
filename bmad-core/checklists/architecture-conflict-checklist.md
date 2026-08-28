<!-- Powered by Stella Development Team -->

# Architecture Conflict Checklist

Detect when a proposed direction (technology, coding approach, or structure) conflicts with `tech-stack.md`, `coding-standards.md`, or `project-structure.md`, and ensure Confluence is updated before any plan or implementation proceeds on it.

[[LLM: INITIALIZATION INSTRUCTIONS - ARCHITECTURE CONFLICT CHECK

These three docs are binding, not advisory. Confluence is the source of truth — local `bmad-docs/architecture/` files are a synced copy. This checklist gates PLANNING only: dev/quick-dev implementation is already blocked without an approved plan, so halting before a plan is finalized is sufficient.

CONTEXT LOADING: if the three docs are already loaded this session (default for Dev, Quick-Dev, Planner), use them as-is. Otherwise (default for Architect, PM, PO) read them from `bmad-docs/architecture/` first.

NOT A CONFLICT: a Migration task (Stack Version / Architecture Pattern subtype) moving from a documented current state to a documented target state — that is its sanctioned purpose, not a violation.

Mark each item [x] done, [N/A] not applicable, or add a note. Never resolve a conflict unilaterally — ask the user and follow the matching branch below.]]

## 1. Identify Conflicts

[[LLM: Compare the proposal against each doc. Name the exact doc, the contradicted rule, and what the proposal does instead. If nothing conflicts, mark the rest of this checklist N/A.]]

- [ ] Proposal checked against tech-stack.md, coding-standards.md, project-structure.md
- [ ] **Conflicts found (if any):** doc + rule + what the proposal does instead

## 2. Confirm Intent

[[LLM: Skip if Section 1 found no conflicts. Otherwise present the conflicts plainly and ask: "Is this a deliberate architecture change, or should the plan align with the current docs?" Wait for an explicit answer — treat undecided as "align to existing docs."]]

- [ ] User's stated intent: **Deliberate change** / **Align to existing docs**

## 3. Branch — Deliberate Change

[[LLM: Only if the user confirmed a deliberate change. Sequence: brief → confirm → update Confluence → re-sync local copy. Nothing proceeds on the new direction before Confluence is updated.]]

- [ ] Change briefed to user (old value vs. new, per doc) and approved
- [ ] Confluence page(s) updated first — under `architectureFolderUrl` (core-config.yaml) — then local `bmad-docs/architecture/` re-synced

## 4. Branch — Align to Existing Docs

[[LLM: If the user declined or stayed undecided. Hard stop before the plan/design is finalized, for both Planner and Quick-Dev's planning phase.]]

- [ ] Workflow HALTED; user told the direction must be revised to match current docs — no conflicting plan was finalized

## VALIDATION RESULT

**Outcome:** NO CONFLICT / RESOLVED — DOCS UPDATED / HALTED — REALIGNMENT REQUIRED

**Conflicts & Resolution:** _TBD_

**Next Step:** _TBD_
