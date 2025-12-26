<!-- Powered by Stella Development Team -->

# Implementation Plan Validation Checklist

The Planner should use this checklist to validate that each implementation plan provides comprehensive guidance enabling a dev agent to implement the ticket confidently without requiring additional research or context gathering.

[[LLM: INITIALIZATION INSTRUCTIONS - IMPLEMENTATION PLAN VALIDATION

Before proceeding with this checklist, ensure you have access to:

1. The implementation plan document being validated (in /docs/impl-plan/)
2. The original JIRA ticket or input source
3. Referenced architecture documents
4. Project coding standards and conventions

IMPORTANT: This checklist validates implementation plans BEFORE handing off to dev agent.

VALIDATION PRINCIPLES:

1. Completeness - Plan contains ALL information needed for implementation
2. Clarity - Tasks are clear, specific, and actionable by dev agents
3. Technical Depth - Sufficient technical detail provided (file paths, patterns, specifics)
4. Logical Sequence - Tasks are ordered correctly with proper dependencies
5. Testability - Testing approach is comprehensive and clear
6. Self-Sufficiency - Dev agent will NOT read architecture docs unless explicitly told to in the plan

IMPORTANT: The validator (Planner) CAN and SHOULD reference architecture docs to verify correctness, but the resulting plan must be self-contained for the dev agent.

REMEMBER: We're targeting dev agents who need:

- Explicit file paths and locations following project structure
- Specific technical patterns to follow
- Clear step-by-step instructions
- Complete context embedded in the plan (no external doc hunting)
- All necessary information to implement without reading architecture docs

Source references [Source: ...] are for validator traceability, NOT for dev agent to read.

We're checking for COMPREHENSIVE detail that eliminates ambiguity.]]

## 1. REQUIREMENTS & ACCEPTANCE CRITERIA QUALITY

[[LLM: Requirements and acceptance criteria must be clear and complete. Verify:

1. All requirements are explicitly stated (functional and non-functional)
2. Acceptance criteria are specific, testable, and measurable
3. Scope boundaries are clear (what's included and excluded)
4. Success conditions are unambiguous
5. Edge cases and error scenarios are addressed]]

- [ ] All requirements are explicitly listed and clear
- [ ] Acceptance criteria are specific and testable
- [ ] Scope is well-defined with clear boundaries
- [ ] Success conditions are measurable
- [ ] Edge cases and error scenarios are identified
- [ ] Requirements align with ticket description and type (feature/bug/migration)

## 2. TECHNICAL APPROACH & IMPLEMENTATION DETAILS

[[LLM: The plan must provide complete technical guidance without requiring dev agent to read architecture docs. Verify:

APPROACH LEVEL:
1. Overall strategy is explained clearly
2. Key architecture decisions are documented with reasoning
3. Technology/framework/library choices are specified
4. Component design is outlined
5. Data flow and integration points are explained
6. Approach aligns with project architecture and standards

DETAILED SPECIFICATIONS:
7. Data models/schemas are fully specified with source refs
8. API specifications are complete with all details
9. Component specs include props, state, events
10. File locations follow project structure guidelines
11. Code patterns and standards are explicitly stated
12. Technical constraints are clearly documented
13. Integration points with external systems are detailed

VALIDATOR NOTE: Check architecture docs for correctness, but ensure plan includes all context inline.]]

- [ ] High-level implementation strategy is clear
- [ ] Architecture decisions are documented with justification
- [ ] Technology and library choices are specified (with versions if relevant)
- [ ] Component/module design is outlined
- [ ] Data flow and state management approach is explained
- [ ] Integration points with existing code are identified
- [ ] Approach aligns with project conventions and standards
- [ ] Data models/schemas are fully specified with validation rules
- [ ] API specifications include endpoints, methods, request/response formats, authentication
- [ ] Component specifications include complete technical details
- [ ] File locations are explicit with full paths following project structure
- [ ] Code patterns and coding standards are described with examples
- [ ] Technical constraints (versions, performance, security) are documented
- [ ] Integration points are detailed with connection information
- [ ] All technical details cite architecture sources [Source: ...] for validator verification
- [ ] No placeholders or "TBD" items remain

## 3. IMPLEMENTATION TASKS QUALITY

[[LLM: Tasks must be detailed enough for dev agents to execute without ambiguity. Verify:

1. Each task is specific and actionable
2. File paths are complete and accurate
3. Sequence is logical with dependencies respected
4. Subtasks break down complex work appropriately
5. Technical details are included (not just "implement X")
6. Tasks reference relevant acceptance criteria
7. Checkbox format [ ] is used correctly]]

- [ ] All tasks are specific and actionable (not vague)
- [ ] File paths are complete and follow project structure
- [ ] Task sequence is logical and respects dependencies
- [ ] Complex tasks are broken into appropriate subtasks
- [ ] Each task includes sufficient technical detail
- [ ] Tasks reference relevant acceptance criteria (AC: #)
- [ ] Checkbox format [ ] is used for all tasks and subtasks
- [ ] No task requires the dev agent to "figure out" major technical decisions

## 4. TESTING STRATEGY COMPLETENESS

[[LLM: Testing must be comprehensive and actionable. Verify:

1. Test files are specified with full paths
2. Specific test cases are listed (not just "write tests")
3. Testing frameworks and patterns are specified
4. Coverage requirements are stated
5. Manual testing steps are included if needed
6. Test approach covers unit, integration, and e2e as appropriate]]

- [ ] Test files to create/modify are listed with full paths
- [ ] Specific test cases are detailed (happy path, errors, edge cases)
- [ ] Testing frameworks and libraries are specified
- [ ] Test patterns to follow are explained or referenced
- [ ] Coverage requirements or expectations are stated
- [ ] Manual testing steps are included if applicable
- [ ] Testing approach aligns with testing-strategy.md

## 5. DEPENDENCIES & RISKS IDENTIFICATION

[[LLM: Dependencies and risks must be surfaced early. Check:

1. Technical dependencies are identified
2. Potential blockers are listed
3. Areas of uncertainty are explicitly noted
4. Risk mitigation strategies are provided
5. External dependencies (APIs, services) are documented]]

- [ ] Technical dependencies are clearly identified
- [ ] Potential blockers are listed with severity
- [ ] Areas of uncertainty are explicitly called out
- [ ] Risk mitigation strategies are provided
- [ ] External dependencies (APIs, services, infrastructure) are documented
- [ ] Dependencies on other tickets or work are noted

## 6. FILE STRUCTURE CLARITY

[[LLM: File changes must be complete and organized. Verify:

1. All new files are listed with full paths
2. All files to modify are identified
3. Files to delete are noted (if applicable)
4. Directory changes are specified
5. File organization follows project structure guidelines]]

- [ ] All new files to create are listed with full paths
- [ ] All existing files to modify are identified
- [ ] Files to delete are noted (for migrations/refactoring)
- [ ] New directories to create are specified
- [ ] File organization follows project structure standards
- [ ] Naming conventions are followed

## 7. SELF-SUFFICIENCY ASSESSMENT

[[LLM: The plan should be fully self-contained for the dev agent. Verify:

1. Dev agent can implement without reading architecture docs (unless explicitly instructed in plan)
2. All necessary context is included inline in the plan
3. No critical information requires external lookups
4. Technical decisions are already made (not deferred to dev agent)
5. Examples or patterns are provided where helpful]]

- [ ] Plan contains all context needed (dev agent won't read external docs unless told to)
- [ ] Critical information is included inline, not just referenced
- [ ] Technical decisions are made, not left to dev agent
- [ ] Code patterns or examples are provided where helpful
- [ ] Dev agent can start implementation immediately without research

## 8. DEV AGENT READINESS

[[LLM: Can a dev agent implement this plan without confusion? Consider:

1. Are instructions clear and unambiguous?
2. Are file paths, function names, and specifics provided?
3. Are technical choices already made (not requiring additional research)?
4. Is the sequence logical and dependency-aware?
5. Would the dev agent have all information needed to execute each step?]]

- [ ] Instructions are clear and unambiguous for autonomous execution
- [ ] Specific details eliminate need for additional research or judgment calls
- [ ] Technical complexity is broken down into manageable steps
- [ ] Sequence guides dev agent through logical progression
- [ ] Plan provides complete context rather than requiring inference
- [ ] Examples or patterns are provided where helpful for clarity

## 9. QUALITY & CONSISTENCY

[[LLM: Plan quality and consistency matter. Check:

1. Writing is clear and professional
2. Formatting is consistent throughout
3. No spelling/grammar errors in critical sections
4. Terminology is consistent
5. All sections of template are populated
6. No contradictory information]]

- [ ] Writing is clear, professional, and well-organized
- [ ] Formatting is consistent (headers, lists, code blocks)
- [ ] Technical terminology is used correctly and consistently
- [ ] All template sections are populated (no empty required sections)
- [ ] No contradictory information between sections
- [ ] Plan follows implementation-plan template structure

## VALIDATION RESULT

[[LLM: FINAL IMPLEMENTATION PLAN VALIDATION REPORT

Generate a comprehensive validation report:

1. Quick Summary
   - Plan readiness: READY / NEEDS REFINEMENT / BLOCKED
   - Completeness score (1-10)
   - Clarity score (1-10)
   - Dev agent readiness score (1-10)
   - Major gaps identified

2. Fill in the validation table with:
   - PASS: Requirements clearly met, excellent quality
   - PARTIAL: Some gaps or areas needing enhancement
   - FAIL: Critical information missing or insufficient

3. Specific Issues (if any)
   - List concrete problems to fix
   - Suggest specific improvements
   - Identify missing information
   - Note areas needing more detail

4. Dev Agent Perspective
   - Could a dev agent implement this plan as written?
   - What questions or ambiguities might arise?
   - Where might the dev agent get stuck or need additional context?
   - What additional detail would help?

5. Recommendations
   - If READY: Confirm plan can be handed to dev agent
   - If NEEDS REFINEMENT: Specific refinements needed (use *refine-plan)
   - If BLOCKED: What information is blocking completion

Be thorough - the goal is a plan that enables confident, efficient implementation without confusion or constant questions.]]

| Category                                    | Status | Issues |
| ------------------------------------------- | ------ | ------ |
| 1. Requirements & Acceptance Criteria       | _TBD_  |        |
| 2. Technical Approach & Implementation      | _TBD_  |        |
| 3. Implementation Tasks Quality             | _TBD_  |        |
| 4. Testing Strategy Completeness            | _TBD_  |        |
| 5. Dependencies & Risks                     | _TBD_  |        |
| 6. File Structure Clarity                   | _TBD_  |        |
| 7. Self-Sufficiency Assessment              | _TBD_  |        |
| 8. Dev Agent Readiness                      | _TBD_  |        |
| 9. Quality & Consistency                    | _TBD_  |        |

**Scores:**
- Completeness: ___/10
- Clarity: ___/10
- Dev Agent Readiness: ___/10

**Final Assessment:**

- READY: Plan is comprehensive and ready for development
- NEEDS REFINEMENT: Plan requires updates (see issues above)
- BLOCKED: External information required (specify what)

**Recommendation:**
[Provide specific guidance on next steps]
