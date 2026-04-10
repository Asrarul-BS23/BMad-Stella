<!-- Powered by Stella Development Team -->

# Implementation Plan Validation Checklist

The Planner should use this checklist to validate that each implementation plan provides sufficient context for a dev agent to implement the ticket confidently without requiring additional research or architecture document lookups.

[[LLM: INITIALIZATION INSTRUCTIONS - IMPLEMENTATION PLAN VALIDATION

Before proceeding with this checklist, ensure you have access to:

1. The implementation plan document being validated (in /bmad-docs/impl-plan/)
2. The original JIRA ticket or input source
3. Referenced architecture documents for verification
4. Project coding standards and conventions

IMPORTANT: This checklist validates implementation plans BEFORE handing off to dev agent.

VALIDATION PRINCIPLES:

1. Clarity - Dev agent understands WHAT to implement and HOW
2. Completeness - All necessary technical details are embedded in the plan
3. Actionability - Tasks are specific enough to execute without ambiguity
4. Self-Sufficiency - Dev agent won't need to read architecture docs (context is embedded)
5. Testability - Testing approach is clear and comprehensive
6. Type-Awareness - Plan has appropriate depth for its ticket type (Feature/Bug/Migration)
7. Codebase Accuracy - Plan references match the actual state of the codebase

REMEMBER: We're creating plans for dev agents who need complete technical context embedded, explicit file paths and patterns, clear task breakdown, all architectural decisions made, and no external document hunting.

We're checking for COMPREHENSIVE detail that eliminates ambiguity and external lookups.]]

## 1. REQUIREMENTS & ACCEPTANCE CLARITY

[[LLM: Without clear requirements, dev agents build the wrong thing. Verify:

1. Requirements are explicit and complete
2. Acceptance criteria are specific and testable
3. Success conditions are measurable
4. Scope boundaries are clear
5. Edge cases are addressed]]

- [ ] Requirements are clearly stated and complete
- [ ] Acceptance criteria are specific and testable
- [ ] Success conditions are measurable and unambiguous
- [ ] Scope is well-defined (what's included/excluded)
- [ ] Edge cases and error scenarios are identified

## 2. TECHNICAL COMPLETENESS & ACTIONABILITY

[[LLM: Dev agents need all technical decisions made and context embedded. Check:

1. Implementation strategy is clear and justified
2. All architectural decisions are made (not deferred to dev agent)
3. Tasks are specific with file paths, not vague
4. Technical context is embedded inline (no doc lookups needed)
5. Code patterns and standards are explicitly stated
6. Data models, APIs, components are fully specified
7. No placeholders or "TBD" items remain]]

- [ ] Implementation strategy clearly explained with justification
- [ ] All technical decisions made (technology, patterns, architecture)
- [ ] Tasks are specific and actionable with complete file paths
- [ ] Task sequence is logical and dependency-aware
- [ ] Complex tasks broken into manageable subtasks
- [ ] Technical context fully embedded inline (data models, APIs, components, patterns)
- [ ] Code standards and patterns explicitly described in the plan
- [ ] All file changes documented inline (new files, modifications, deletions)
- [ ] No placeholders or unresolved decisions remain

## 3. SELF-SUFFICIENCY & EMBEDDED CONTEXT

[[LLM: The plan must be self-contained - dev agent cannot read architecture docs. Verify:

1. Dev agent can implement without external document lookups
2. Critical information is in the plan (not just referenced)
3. Source citations [Source: ...] are for validator verification only
4. Instructions are clear and unambiguous]]

- [ ] Dev agent can implement without reading architecture docs
- [ ] Critical information is in the plan (not just referenced)
- [ ] Instructions are clear and unambiguous
- [ ] No treasure hunting required for essential information
- [ ] Source citations present for validator verification (not for dev agent use)

## 4. TESTING STRATEGY COMPLETENESS

[[LLM: Testing ensures implementation actually works. Verify:

1. Test approach is specified with file paths
2. Specific test cases are detailed
3. Testing frameworks and patterns are specified
4. Coverage requirements are stated
5. Testing tasks are included in the task breakdown
6. Testing strategy matches the ticket type]]

- [ ] Test files specified with full paths
- [ ] Specific test cases detailed (happy path, errors, edge cases)
- [ ] Testing frameworks, libraries, and patterns specified
- [ ] Coverage requirements stated
- [ ] Manual testing steps included (if applicable)
- [ ] Testing tasks included in task breakdown with checkboxes
- [ ] Testing strategy matches ticket type (feature integration tests ≠ bug regression tests ≠ migration health tests)

## 5. DEPENDENCIES, RISKS & COMPLETENESS

[[LLM: Dependencies must be identified and plan must be complete. Check:

1. Technical dependencies and blockers are identified
2. External dependencies are documented
3. Risk mitigation strategies provided
4. All template sections are populated
5. Metadata and initialization are complete]]

- [ ] Technical dependencies clearly identified
- [ ] External dependencies documented (APIs, services, infrastructure)
- [ ] Potential blockers listed with mitigation strategies (if applicable)
- [ ] Temporary dependency file integrated (if existed)
- [ ] All required template sections populated
- [ ] Plan metadata complete (ticket info, status, change log)
- [ ] Dev Agent Record section exists and is empty
- [ ] Deviation Record section exists and is empty
- [ ] Feedback section exists and is empty initially
- [ ] Formatting consistent throughout (headers, lists, checkboxes)

## 6. TYPE-SPECIFIC VALIDATION

[[LLM: Each ticket type has unique validation requirements. Identify the ticket type from the plan's Ticket Information section, then validate ONLY the matching sub-section below. Skip the other two.

Verify that type-specific sections are populated with appropriate depth — not just present, but substantively filled with actionable details.]]

### 6a. Migration-Specific Checks (ONLY if Ticket Type = Migration)

- [ ] Migration sub-type is classified (Stack Version / Architecture Pattern / Infrastructure / Data / Hybrid)
- [ ] Source state and target state are clearly defined with specifics
- [ ] Migration Details section is populated (not empty or placeholder)
- [ ] Transformation map covers every affected module/layer/folder
- [ ] Migration strategy specifies incremental vs big-bang with rationale
- [ ] Migration task order respects target architecture dependency rules (innermost layers first)
- [ ] Rollback plan is documented — both overall and per-task where applicable
- [ ] Health criteria are defined (test count baseline, build warning baseline)
- [ ] Each migration task includes a mandatory build verification subtask
- [ ] Reference implementation is identified (a fully migrated module to follow as canonical example)
- [ ] Do Not Migrate list identifies patterns to intentionally drop

**Architecture Pattern migrations additionally:**
- [ ] Both source and target architecture documents are referenced and accessible
- [ ] Dependency direction rules of target pattern are explicitly stated
- [ ] Transformation map shows file/folder moves, splits, merges, creations, and deletions
- [ ] Intermediate states are documented (codebase compiles and functions at each step)
- [ ] No tasks create dependency direction violations in the target pattern

**Stack Version migrations additionally:**
- [ ] Current and target version numbers are explicit
- [ ] Breaking changes are identified with their replacements
- [ ] Migration guide or breaking changes document is referenced (or user confirmed none available)
- [ ] Deprecated API usage in current code is cataloged

**Data migrations additionally:**
- [ ] Data volume and downtime constraints are documented
- [ ] Data transformation logic is specified
- [ ] Data integrity verification approach is defined

### 6b. Bug Fix-Specific Checks (ONLY if Ticket Type = Bug)

- [ ] Root cause is identified in Bug Fix Details (not just symptoms described)
- [ ] Root cause analysis distinguishes root cause from workaround
- [ ] Reproduction steps are documented in the plan (self-contained, not just JIRA reference)
- [ ] Affected code path is traced (entry point → data flow → failure point)
- [ ] Fix scope is bounded (what will NOT be changed is explicitly stated)
- [ ] Fix addresses root cause, not just symptom
- [ ] Permanent regression test for the specific bug is planned (not temporary)
- [ ] Task count is 3-5 regardless of complexity (complex diagnosis ≠ complex task count)

### 6c. Feature-Specific Checks (ONLY if Ticket Type = Feature)

- [ ] Integration points with existing code are identified
- [ ] Existing patterns to follow are referenced with codebase file path examples
- [ ] Reuse opportunities are documented (existing utilities/helpers to use instead of building new)
- [ ] Impact on existing tests is assessed (which tests might break)

## 7. CODEBASE REALITY VALIDATION

[[LLM: A plan can pass quality checks but be factually wrong about the codebase. Verify that plan references match reality. This section validates ACCURACY, not just QUALITY.

If you have access to the codebase, perform these checks directly. If not, flag them as "requires codebase verification" for the planner to confirm.]]

- [ ] File paths in the plan correspond to actual files in the codebase
- [ ] Patterns described in Technical Approach match actual codebase patterns
- [ ] Integration points referenced actually exist in the codebase
- [ ] Referenced utilities, services, or helpers exist and function as described
- [ ] For migrations: current architecture description matches actual folder structure
- [ ] For bugs: affected code path files exist and contain the referenced functions
- [ ] Tasks are independent enough that work can pause and resume between any two tasks
- [ ] Planner Notes section is populated with decisions, trade-offs, and complexity assessment

## VALIDATION RESULT

[[LLM: FINAL IMPLEMENTATION PLAN VALIDATION REPORT

Generate a very concise validation report:

1. Quick Summary
   - Plan readiness: READY / NEEDS REFINEMENT / BLOCKED
   - Major gaps identified

2. Fill in the validation table with:
   - PASS: Section complete, clear, and actionable
   - PARTIAL: Some gaps but workable with minor fixes
   - FAIL: Critical information missing or insufficient
   - N/A: Section not applicable to this ticket type

3. Specific Issues (if any)
   - List concrete problems to fix
   - Suggest specific improvements
   - Identify missing information

4. Dev Agent Perspective
   - Could a dev agent implement this plan as written?
   - What questions or ambiguities might arise?
   - Where might the dev agent get stuck?

5. Recommendations
   - If READY: Confirm plan ready for dev agent
   - If NEEDS REFINEMENT: Use \*refine-plan with specific issues
   - If BLOCKED: What external information is needed

Be thorough - the goal is a plan enabling confident, efficient implementation without confusion.]]

| Category                                  | Status | Issues |
| ----------------------------------------- | ------ | ------ |
| 1. Requirements & Acceptance Clarity      | _TBD_  |        |
| 2. Technical Completeness & Actionability | _TBD_  |        |
| 3. Self-Sufficiency & Embedded Context    | _TBD_  |        |
| 4. Testing Strategy Completeness          | _TBD_  |        |
| 5. Dependencies, Risks & Completeness     | _TBD_  |        |
| 6. Type-Specific Validation               | _TBD_  |        |
| 7. Codebase Reality Validation            | _TBD_  |        |

**Final Assessment:**

- READY: Plan is comprehensive and ready for development
- NEEDS REFINEMENT: Plan requires updates (see issues above)
- BLOCKED: External information required (specify what)

**Recommendation:**
[Provide specific guidance on next steps]
