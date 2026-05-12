<!-- Powered by Stella Development Team -->

# Create Implementation Plan Task

## Purpose

Transform requirements from any source (JIRA tickets, direct instructions, markdown/text files) into actionable implementation plans for junior developers. Plans are type-aware: bugs, features, and migrations each receive specialized treatment — different questions, architecture reading strategies, acceptance criteria, task granularity, and validation. Handles variable input quality, from complete requirements to just ticket titles or screenshots.

## CRITICAL RULES

**FILE LOCATION DISCOVERY:** When file locations are needed, ALWAYS ASK the user first which approach they prefer:

1. **User provides paths:** User can directly specify full file paths if they know them

2. **System scans codebase:** Use Glob/Grep to search and detect relevant files if user doesn't know exact locations
   - **Get search hints first:** Ask user for helpful hints to narrow the search (e.g., "Look in services folder", "Related to authentication", "Files with 'payment' in name", "Backend API files")
   - **Check project structure docs:** ALWAYS read `bmad-docs/architecture/project-structure.md` (or `project-structure.md`) FIRST to understand file locations and naming conventions
   - **Perform targeted search:** Use hints + structure knowledge to create focused Glob/Grep searches instead of broad codebase scans
   - **Identify impacted files:** When modifying a function, component, or interface, search for its usages across codebase using targeted Glob/Grep before making changes. Update all impacted files accordingly.

## SEQUENTIAL Task Execution (Do not proceed until current Task is complete)

### 0. Load Core Configuration

- Load `{root}/core-config.yaml` from the project root
- If the file does not exist, HALT and inform the user: "core-config.yaml not found. This file is required for planning. Please add and configure core-config.yaml before proceeding."
- Extract key configurations: `devLoadAlwaysFiles`, `architecture.*`, `devStoryLocation`

### 1. Analyze Input Source

#### 1.1 Determine Input Type and Extract Information

- **If input is a JIRA ticket number or URL:** Fetch via Atlassian MCP. On MCP failure → apply `mcp-failure` rule (see planner.md `shared-rules`).
- **If input is a .md file path:** Read the file completely
- **If input is a .txt file path:** Read the file completely
- **If input is a screenshot/image:** Analyze the image to extract details
- **If input is direct text (typed by user):** Use the provided description as-is
- **If input includes images alongside text:** Process both — text for requirements, images for visual context

#### 1.2 Extract Core Ticket Information

Extract the following (or derive if missing):

- **Plan ID:** Apply `plan-id-format` rule (see planner.md `shared-rules`).
- **Ticket Type:** Identify as Bug, Feature, or Migration
- **Ticket Subtype:** For Migrations, classify as one of the following. Set N/A for Bug/Feature.
  - **Stack Version** — dependency version changes, API updates, deprecation replacements
  - **Architecture Pattern** — structural reorganization (e.g., MVC → Clean Architecture, layered → hexagonal)
  - **Infrastructure** — deployment/hosting/cloud provider changes
  - **Data** — database schema changes, data transformations, engine migrations
  - **Hybrid** — combination of the above
- **Title:** The ticket summary
- **Description:** Full description if available
- **Requirements:** Explicit requirements if provided; if not, derive from description and acceptance criteria. Each must be clear, specific, and testable.
- **Acceptance Criteria:** Explicit ACs if provided (if not, you'll derive them later)
- **Additional Context:** Screenshots, examples, error messages, stack traces

#### 1.3 Alert User on Input Quality

Based on what's available, inform the user:

- "✓ Complete ticket with requirements and acceptance criteria"
- "⚠ Partial information - will derive requirements and acceptance criteria"
- "⚠ Minimal information (title only) - will need to ask clarifying questions"

### 2. Clarify Missing Information (If Needed)

If critical information is missing, ask the user targeted questions. Questions are organized by ticket type — ask ONLY the questions relevant to the ticket type.

**CRITICAL:** Only ask essential questions. Use your senior developer judgment to infer reasonable details when possible.

#### 2.1 For Bugs

- What is the expected behavior vs. actual behavior?
- **What is the identified root cause?** (Not just symptoms — the actual code path or logic error responsible)
- Can you provide steps to consistently reproduce the bug?
- What is the exact code path through the failure? (entry point → data flow → failure point)
- What is the impact and severity?
- Are there error messages or stack traces?
- **What is the minimal change scope?** What should NOT be touched during this fix?
- **Which files contain the bug?**

#### 2.2 For Features

- What is the expected user workflow?
- What are the key functional requirements?
- Are there specific UI/UX requirements?
- What data needs to be captured/displayed?
- Are there integration requirements with existing features?
- Are there existing patterns or similar features in the codebase the implementation should follow?
- **Which files need modification?**

#### 2.3 For Migrations — Stack Version

- What is the current version (FROM) and target version (TO)?
- Is there an official migration guide or breaking changes document? (If yes, request it — HALT and ask: "Providing an official migration guide significantly improves migration accuracy. Do you have one?")
- What deprecated APIs does the current code use that are removed or changed in the target version?
- Are there configuration format changes between versions?
- Can the migration be done incrementally or does it require a big-bang switch?
- Are there coexistence requirements (old and new versions running simultaneously)?
- **Which files need modification?**

#### 2.4 For Migrations — Architecture Pattern

- What is the current architecture pattern? (e.g., MVC, layered, monolithic)
- What is the target architecture pattern? (e.g., Clean Architecture, hexagonal, CQRS)
- **Provide the current architecture document or reference** (HALT if missing)
- **Provide the target architecture document or reference** (HALT if missing)
- What are the dependency direction rules of the target pattern? (e.g., domain must not depend on infrastructure)
- What is the migration scope — full codebase or specific modules?
- Should the migration be file-by-file, module-by-module, or layer-by-layer?
- Is there a fully completed, already-migrated module that can serve as the reference implementation?
- What patterns from the old architecture should NOT be carried over? (the "Do Not Migrate" list)
- **Which files/modules are affected?**

#### 2.5 For Migrations — Infrastructure / Data / Hybrid

- What infrastructure or data is being migrated?
- What is the source and target state?
- **For Data migrations:** What is the data volume? Is zero-downtime required? What is the data transformation logic? How will data integrity be verified post-migration?
- **For Infrastructure migrations:** What cloud/platform changes are involved? What configuration files need updating? Are there environment-specific concerns?
- Are there dependencies on other systems?
- What is the rollback strategy?
- **Which files need modification?**

#### 2.6 For Database Changes (All Ticket Types)

- Analyze: Does this work require any database table updates or creation?
- **If not mentioned in ticket and uncertain, ASK the user** - better to clarify than assume
- If YES:
  - **Database migration tasks must be handled by the user** (add in tasks list but tell user to do this)
  - If specific fields to add to a model or a new model structure are NOT specified in the ticket info/requirements:
    - **Ask the user to specify the fields to be added or the model structure** (field names, types, constraints, relationships)
  - Document the model/table changes needed in the Technical Approach section

### 3. Gather Architecture Context

#### 3.1 Determine Architecture Reading Strategy

- **If `architectureVersion: >= v4` and `architectureSharded: true`**: Read `{architectureShardedLocation}/index.md` then follow structured reading order below
- **Else**: Use monolithic `architectureFile` for similar sections
- **Fallback**: If no `architecture/` folder exists, check for `Claude.md` in project root for architecture and project information

#### 3.2 Read Architecture Documents Based on Ticket Type

**For ALL Tickets:** tech-stack.md, unified-project-structure.md, coding-standards.md

**For Backend/API Tickets, additionally:** data-models.md, database-schema.md, backend-architecture.md, rest-api-spec.md, external-apis.md

**For Frontend/UI Tickets, additionally:** frontend-architecture.md, components.md, core-workflows.md, data-models.md

**For Full-Stack Tickets:** Read both Backend and Frontend sections above

**For Bugs:** Focus on architecture relevant to the affected code path, error handling patterns, logging and debugging guidelines

**For Migrations — Stack Version:** Read tech-stack.md thoroughly. If a migration guide or breaking changes document was provided by the user, read it and extract all breaking changes relevant to the planned work.

**For Migrations — Architecture Pattern:** Read ALL architecture docs to map the full current pattern (not just "affected components"). Also read the target architecture document provided by user. Cross-reference both to understand the gap between current and target architecture.

**For Migrations — Infrastructure/Data:** Read deployment and infrastructure docs, data models, database schema, and environment configuration docs.

#### 3.3 Extract Ticket-Specific Technical Details

Extract ONLY information directly relevant to implementing this ticket. Do NOT invent new libraries, patterns, or standards not in the source documents.

Extract:

- Specific data models, schemas, or structures the ticket will use
- API endpoints to implement or consume
- Component specifications for UI elements
- File paths and naming conventions for new code
- Security or performance considerations affecting the ticket
- Dependencies and third-party libraries

ALWAYS cite source documents: `[Source: architecture/{filename}.md#{section}]`

### 3.4 Orientation Scan

Use Glob/Grep to map the affected codebase area:

- **Locate** — find files matching ticket keywords; read them to understand current behavior.
- **Find precedents** — similar implementations, patterns, and reusable utilities. **Prefer existing over creating new.** Common reuse targets: logger, error handler / custom exceptions, HTTP/API client, validators, config reader, auth helpers, caching, ID/GUID generators, serialization (JSON/XML), date/time utilities.
- **Identify callers** — search usages of functions/components likely to change.
- **Note test coverage** for affected files (informs regression risk).

Capture findings for §6 (Technical Approach). Verification of paths and patterns happens at `*validate-plan` (see planner-validation-checklist §7).

### 4. Handle Dependency Analysis (If Available)

**Check and Load:**

- Check if `bmad-docs/temporary/{plan_id}-dependency-tmp.md` exists
- If exists: Read and extract all dependency information (technical, infrastructure, third-party, data dependencies, blockers, risks)
- If not exists: Proceed without pre-analyzed dependencies

**After Planning Completion:**

- If all dependencies addressed: Delete `bmad-docs/temporary/{plan_id}-dependency-tmp.md`
- If ticket will be decomposed into subtasks: Keep file with remaining dependencies for future subtasks
- Document cleanup action in implementation plan

### 5. Derive or Validate Acceptance Criteria

Based on ticket type and information gathered:

**Branches are mutually exclusive — pick one.**

**If acceptance criteria are provided:** Use as-is. Do NOT append from the lists below.

**If NOT provided, derive them per ticket type:**

#### 5.1 For Bugs

- Root cause is identified and documented
- Fix addresses root cause, not just symptom
- Reproduction steps no longer reproduce the bug
- Permanent regression test for the specific bug exists
- Adjacent functionality verified unbroken
- No scope creep — only the minimal necessary changes are made

#### 5.2 For Features

- Functional requirements (what the feature does)
- UI/UX requirements (how it looks/behaves)
- Data validation requirements
- Integration requirements (how it connects to existing features)
- Pattern conformance (follows existing codebase patterns)
- Performance requirements (if applicable)
- Security requirements (if applicable)

#### 5.3 For Migrations — Stack Version

- All dependencies updated to target version
- No deprecated API usage remains
- Breaking change replacements verified
- Configuration format updated to target version
- All tests pass (count >= pre-migration baseline count)
- Build succeeds with no new warnings

#### 5.4 For Migrations — Architecture Pattern

- Source folder structure matches target pattern
- Dependency direction follows target rules (e.g., domain doesn't depend on infrastructure)
- No circular dependencies introduced
- Layer boundaries respected (no cross-layer shortcuts)
- All tests pass (count >= pre-migration baseline count)
- Build succeeds with no new warnings
- Behavioral preservation — no business logic changes during migration

#### 5.5 For Migrations — Infrastructure/Data

- Successful migration of all affected components/data
- No data loss or corruption
- Backward compatibility maintained (if required)
- Rollback successfully tested
- Performance maintained or improved
- Environment-specific configurations correctly isolated

#### 5.6 Validate Derived ACs with User

After deriving ACs (5.1–5.5), display them to the user and ask for confirmation, edits, or additions before proceeding to §6. This makes the derive path symmetric with the "provided" path — both end with user-validated ACs.

### 6. Define Technical Approach and Decisions

As a senior developer, document the complete technical approach using the structured sub-sections from the template.

#### 6.1 Current State

Document what exists now in the codebase relevant to this ticket:

- Current code structure and file organization in the affected area
- Current data flow or execution path (especially for bugs and migrations)
- Existing patterns, utilities, and services that are relevant
- Current test coverage of affected files
- Cite source: `[Source: architecture/{filename}.md#{section}]`

#### 6.2 Target State

Document what should exist after implementation is complete:

- For Bugs: corrected behavior and the specific code path change
- For Features: new components, endpoints, files, and how they integrate
- For Migrations: target architecture, folder structure, and pattern

#### 6.3 Transformation Strategy

Document how to get from current state to target state:

- Implementation strategy and major components affected
- Key design patterns and code patterns to follow
- API/database design changes (if applicable)
- Technology/framework choices

#### 6.4 File Structure Planning

- New files to create (with full paths)
- Existing files to modify
- Files to delete (for migrations)
- Directory structure changes

#### 6.5 Integration Points

Document where new or changed code connects to existing code:

- Existing services, APIs, or modules that will be called or modified
- Callers and consumers of code being changed
- Shared state, configuration, or infrastructure dependencies

#### 6.6 Pattern Conformance

Document existing patterns the implementation must follow:

- Reference existing files that demonstrate the pattern
- Naming conventions, DI registration patterns, error handling patterns
- Identify a reference implementation if one exists

#### 6.7 Reuse Opportunities

List existing utilities/helpers/services to reuse (from §3.4 scan). Format: file path + purpose. E.g., `Services/LoggerService.cs` for logging.

#### 6.8 Type-Specific Sections

Populate the section matching the ticket type. Skip the other two.

**Bug Fix Details:**

- Root Cause Analysis — actual cause, not symptoms; code path + trigger conditions.
- Reproduction Steps — self-contained in the plan.
- Affected Code Path — entry point → data flow → failing function.
- Fix Scope Boundary — what must NOT be touched.

**Feature Details:**

- Existing Patterns to Follow — file paths + what to observe.

**Migration Details:**

- Reference Implementation — already-migrated module to use as canonical example.
- Source State — what we're migrating FROM (versions / pattern / infra / data).
- Target State — what we're migrating TO.
- Source Architecture Reference — link/path to current arch doc.
- Target Architecture Reference — link/path to target arch doc.
- Transformation Map — file/folder moves, splits, merges, creations, deletions.
- Migration Strategy — incremental vs big-bang; order; intermediate states.
- Rollback Plan — overall + per-task notes.
- Health Criteria — test count, build warnings, perf benchmarks to maintain.
- Do Not Migrate — patterns to intentionally drop.

### 7. Create Implementation Task List

Break down implementation into sequential tasks with checkboxes. Reference acceptance criteria (AC: #).

#### 7.1 Task Granularity by Ticket Type

**For Bugs:**

- 3-5 tasks maximum regardless of complexity. Complex diagnosis does NOT mean complex task count. Typical pattern:
  1. Verify reproduction (confirm the bug manifests as described)
  2. Implement root cause fix (minimal change addressing the actual cause)
  3. Write permanent regression test for the specific bug
  4. Verify fix resolves the issue and no regressions
  5. Manual testing / user verification

**For Features:**

- Simple ticket (1-2 story points): 3-5 tasks with minimal subtasks
- Medium ticket (3-5 story points): 5-8 tasks with subtasks
- Complex ticket (8+ story points): 8-12 tasks with subtasks

**For Migrations:**

- 8-15 tasks. Each structural change gets its own task.
- Each migration task MUST include a mandatory build verification subtask.
- Include per-task rollback notes as subtasks where applicable.
- Order tasks following the target architecture's dependency direction (innermost/most-stable layers first).
- For Architecture Pattern migrations: follow layer-by-layer ordering from the transformation map.

#### 7.2 Task Guidelines (All Types)

- Tasks should be logical implementation steps, not overly granular
- DO NOT include code snippets in tasks
- Avoid micro-tasks like "create file X" or "add import statement"
- Group related implementation steps into meaningful tasks
- Reference architecture docs where applicable [Source: {doc}]

#### 7.3 Task Categories to Include

1. Setup/preparation (if needed)
2. Core implementation (main features/fix/migration steps)
3. Integration (connecting components)
4. Error handling

#### 7.4 Testing Tasks by Ticket Type

**For Bugs:**

- Write a permanent regression test that fails before the fix and passes after
- Run targeted tests on the affected code path first
- Run full regression suite
- Perform manual testing of the specific bug scenario

**For Features:**

- Write integration tests verifying the feature works with existing code
- Identify which existing tests might break and update them
- Perform manual testing

**For Migrations:**

- Run before/after comparison tests (verify baseline metrics maintained)
- Run full regression suite (not just affected tests)
- For Architecture Pattern migrations: validate structural conformance (dependency direction, layer boundaries)
- For Stack Version migrations: verify no deprecated API usage remains
- Perform manual testing of migrated functionality

### 8. Document Dependencies and Risks (Only if Applicable)

Include this section ONLY if there are actual dependencies, blockers, or risks to document. It populates the `Dependencies and Risks` section of the template.

**If dependency file was loaded (Step 4):**

- Integrate all dependencies from the analysis file
- Incorporate identified blockers with severity levels
- Add any additional dependencies or blockers discovered during planning
- Document mitigation strategies for high-risk items

**If no dependency file exists but risks/dependencies identified:**

- Identify technical dependencies
- Note potential blockers with severity
- Highlight areas of uncertainty requiring investigation

**If no dependencies or risks:** Skip this section entirely

### 9. Populate Implementation Plan Template

- Use `{root}/templates/implementation-plan-tmpl.yaml` structure
- Fill all sections completely:
  - Status (set to "Draft - Awaiting Review")
  - Ticket Information (Plan ID, type, **subtype**, title, input source, description)
  - Requirements (explicit or derived)
  - Acceptance Criteria (type-specific, derived or provided)
  - Technical Approach (structured: Current State, Target State, Transformation Strategy, Integration Points, Pattern Conformance)
  - Type-specific section (one only, per §6.7)
  - Tasks / Subtasks (type-specific granularity, with checkboxes and testing tasks)
  - Dependencies and Risks (if applicable)
  - Change Log (initialize with creation entry)
  - Dev Agent Record (leave empty - dev agent will populate during implementation)
  - Deviation Record (leave empty - dev agent will populate if implementation diverges from plan)
  - Security Violations (leave empty - populated by security agent post-implementation)
  - Feedback (leave empty initially)

### 10. Implementation Plan Completion and Review

- Review all sections for completeness and accuracy
- Verify all technical details include source citations
- Ensure tasks align with requirements, acceptance criteria, and architecture constraints
- **Verify type-specific sections are populated** (Bug Fix Details / Feature Details / Migration Details)
- Create directory if not exists: `/bmad-docs/impl-plan/`
- Update plan status to "Draft - Awaiting Review" and save as: `bmad-docs/impl-plan/{{plan_id}}-{{ticket_title_short}}.md`
- Provide summary to user including:
  - **Plan created:** `bmad-docs/impl-plan/{{plan_id}}-{{ticket_title_short}}.md`
  - **Ticket Type:** Bug / Feature / Migration (subtype if applicable)
  - **Tasks / Subtasks:** Total count of main tasks and subtasks
  - **Summary:** Brief overview of acceptance criteria and key technical decisions
  - Any deviations or conflicts noted between task and architecture
  - **Dependencies/Risks:** If any were identified
  - **Next Steps:** "Please review the plan. Use \*refine-plan to provide feedback, or approve to proceed with implementation."
- HALT and await user to:
  - Approve the plan (ready for dev agent)
  - Request refinements (use \*refine-plan command)
  - Ask questions or provide additional context

### 11. Post-Approval Cleanup

- On user approval, update plan status to "Approved"
- If plan source is a JIRA ticket, run Bash: `node .bmad-core/utils/jira-attachments {TICKET-KEY} --purge --quiet`
- Report purge result to user (bytes freed). Non-zero exit → warn only, do not block approval
- Skip purge for non-JIRA plans (no cache exists)
