<!-- Powered by Stella Development Team -->

# Create Implementation Plan Task

## Purpose

To transform JIRA tickets (features, bugs, migrations) into comprehensive, actionable implementation plans that provide junior developers with all the technical details, step-by-step tasks, and context needed to implement the solution without additional research. This task handles variable input quality - from complete requirements to just ticket titles or screenshots.

## CRITICAL RULES

**FILE LOCATION DISCOVERY:** When file locations are needed, ALWAYS ASK the user first which approach they prefer:

1. **User provides paths:** User can directly specify full file paths if they know them

2. **System scans codebase:** Use Glob/Grep to search and detect relevant files if user doesn't know exact locations
   - **Get search hints first:** Ask user for helpful hints to narrow the search (e.g., "Look in services folder", "Related to authentication", "Files with 'payment' in name", "Backend API files")
   - **Check project structure docs:** ALWAYS read `bmad-docs/architecture/project-structure.md` (or `project-structure.md`) FIRST to understand file locations and naming conventions
   - **Perform targeted search:** Use hints + structure knowledge to create focused Glob/Grep searches instead of broad codebase scans

## SEQUENTIAL Task Execution (Do not proceed until current Task is complete)

### 0. Load Core Configuration

- Load `{root}/core-config.yaml` from the project root
- If the file does not exist, HALT and inform the user: "core-config.yaml not found. This file is required for planning. Please add and configure core-config.yaml before proceeding."
- Extract key configurations: `devLoadAlwaysFiles`, `architecture.*`, `devStoryLocation`

### 1. Analyze JIRA Ticket Input

#### 1.1 Determine Input Type and Extract Information

- **If input is a .md file:** Read the file completely
- **If input is a screenshot:** Analyze the image to extract ticket details
- **If input is plain text:** Use the provided description or title

#### 1.2 Extract Core Ticket Information

Extract the following (or derive if missing):

- **Ticket Number:** Required for filename (e.g., PROJ-123)
- **Ticket Type:** Identify as Feature, Bug, or Migration
- **Title:** The ticket summary
- **Description:** Full description if available
- **Requirements:** Explicit requirements if provided
- **Acceptance Criteria:** Explicit ACs if provided (if not, you'll derive them later)
- **Additional Context:** Screenshots, examples, error messages, stack traces

#### 1.3 Alert User on Input Quality

Based on what's available, inform the user:

- "✓ Complete ticket with requirements and acceptance criteria"
- "⚠ Partial information - will derive requirements and acceptance criteria"
- "⚠ Minimal information (title only) - will need to ask clarifying questions"

### 2. Clarify Missing Information (If Needed)

If critical information is missing, ask the user targeted questions:

**For Features:**

- What is the expected user workflow?
- What are the key functional requirements?
- Are there specific UI/UX requirements?
- What data needs to be captured/displayed?
- Are there integration requirements?
- **Which files need modification?** (Offer both options as per CRITICAL RULES)

**For Bugs:**

- What is the expected behavior vs. actual behavior?
- Can you provide steps to reproduce?
- What is the impact and severity?
- Are there error messages or stack traces?
- **Which files contain the bug?** (Offer both options as per CRITICAL RULES)

**For Migrations:**

- What is being migrated (code, data, infrastructure)?
- What is the source and target state?
- Are there data transformation requirements?
- What is the rollback strategy?
- Are there dependencies on other systems?

**For Database Changes (All Ticket Types):**

- Does this work require any database table updates or creation?
- **If uncertain, ASK the user** - better to clarify than assume
- If YES:
  - **Database migration tasks must be handled by the user** (add in tasks list but tell user to do this)
  - If specific fields to add to a model or a new model structure are NOT specified in the ticket info/requirements:
    - **Ask the user to specify the fields to be added or the model structure** (field names, types, constraints, relationships)
  - **If uncertain about any database-related details, ALWAYS ask the user** - do not make assumptions or proceed silently
  - Document the model/table changes needed in the Technical Approach sectio

**CRITICAL:** Only ask essential questions. Use your senior developer judgment to infer reasonable details when possible.

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

**For Bug Fixes:** Focus on architecture relevant to affected components, error handling patterns, logging and debugging guidelines

**For Migrations:** Review current architecture of affected components, deployment and infrastructure docs, data models if data migration involved

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

### 4. Handle Dependency Analysis (If Available)

**Check and Load:**

- Check if `bmad-docs/temporary/{ticket-no}-dependency-tmp.md` exists
- If exists: Read and extract all dependency information (technical, infrastructure, third-party, data dependencies, blockers, risks)
- If not exists: Proceed without pre-analyzed dependencies

**After Planning Completion:**

- If all dependencies addressed: Delete `bmad-docs/temporary/{ticket-no}-dependency-tmp.md`
- If ticket will be decomposed into subtasks: Keep file with remaining dependencies for future subtasks
- Document cleanup action in implementation plan

### 5. Derive or Validate Acceptance Criteria

Based on ticket type and information gathered:

**If acceptance criteria are provided:** Validate they are complete and testable

**If NOT provided, derive them:**

**For Features:**

- Functional requirements (what the feature does)
- UI/UX requirements (how it looks/behaves)
- Data validation requirements
- Integration requirements
- Performance requirements (if applicable)
- Security requirements (if applicable)

**For Bugs:**

- Reproduce the bug consistently
- Verify root cause is identified
- Implement fix that addresses root cause
- Verify fix doesn't introduce regressions
- Add tests to prevent recurrence

**For Migrations:**

- Successful migration of all affected components/data
- No data loss or corruption
- Backward compatibility maintained (if required)
- Rollback successfully tested
- Performance maintained or improved

### 6. Define Technical Approach and Decisions

As a senior developer, document the complete technical approach:

#### 6.1 Overall Strategy

- Implementation strategy and major components affected
- Technology/framework choices and design patterns to apply
- Component design and data flow (only if complex interactions)
- API design or database schema changes (if applicable)
- State management approach (if applicable)

#### 6.2 File Structure Planning

**🚨 REMINDER:** Follow the FILE LOCATION DISCOVERY approach from CRITICAL RULES (offer both options to user).

- **New files to create** (with full paths) - **AS Project Structure**
- **Existing files to modify** - **Use FILE LOCATION DISCOVERY approach**
- **Files to delete** (for migrations) - **Use FILE LOCATION DISCOVERY approach**
- **Directory structure changes**

#### 6.3 Code Patterns and Technical Details

Extract relevant patterns and specifications from architecture documents:

- Specific patterns and examples to follow from architecture docs
- Security or performance considerations
- Integration points and third-party libraries

**CRITICAL:**

- Every technical detail MUST cite source: `[Source: architecture/{filename}.md#{section}]`
- Do not invent information - only include what was extracted from architecture docs or derived from requirements
- Keep focused on essential information directly relevant to this ticket

#### 6.4 Dependencies and Risks (Only if Applicable)

Include this subsection ONLY if there are actual dependencies, blockers, or risks to document. It will be in `Dependencies and Risks` section of the template, not subsection of `Technical Approach`.

**If dependency file was loaded (Step 4):**

- Integrate all dependencies from the analysis file
- Incorporate identified blockers with severity levels
- Add any additional dependencies or blockers discovered during planning
- Document mitigation strategies for high-risk items

**If no dependency file exists but risks/dependencies identified:**

- Identify technical dependencies
- Note potential blockers with severity
- Highlight areas of uncertainty requiring investigation

**If no dependencies or risks:** Skip this subsection entirely

### 7. Create Implementation Task List

**🚨 REMINDER:** Follow the FILE LOCATION DISCOVERY approach from CRITICAL RULES for all file paths.

Break down implementation into sequential tasks with checkboxes. Reference acceptance criteria (AC: #).

**Granularity Based on Complexity:**

- **Simple ticket (1-2 story points):** 3-5 tasks with minimal subtasks
- **Medium ticket (3-5 story points):** 5-8 tasks with subtasks
- **Complex ticket (8+ story points):** 8-12 tasks with subtasks

**Task Guidelines:**

- Tasks should be logical implementation steps, not overly granular
- DO NOT include code snippets in tasks
- Avoid micro-tasks like "create file X" or "add import statement"
- Group related implementation steps into meaningful tasks
- Reference architecture docs where applicable [Source: {doc}]

**Task Categories to Include:**

1. Setup/preparation (if needed)
2. Core implementation (main features)
3. Integration (connecting components)
4. Error handling
5. **Testing (always include these 2 final tasks):**
   - Write and run temporary unit tests, then delete
   - Perform manual testing

### 8. Populate Implementation Plan Template

- Use `{root}/templates/implementation-plan-tmpl.yaml` structure
- Fill all sections completely:
  - Status (set to "Draft - Awaiting Review")
  - Ticket Information (number, type, title, description, original source)
  - Requirements (explicit or derived)
  - Acceptance Criteria (derived or provided)
  - Technical Approach (overall strategy, file locations, code patterns with citations, component design if complex)
  - Dependencies and Risks (if applicable)
  - Tasks / Subtasks (with checkboxes, including 2 testing tasks at the end)
  - Change Log (initialize with creation entry)
  - Dev Agent Record (leave empty - dev agent will populate with Agent Model Used and File List only)
  - Feedback (leave empty initially)

### 9. Implementation Plan Completion and Review

- Review all sections for completeness and accuracy
- Verify all technical details include source citations
- Ensure tasks align with requirements, acceptance criteria, and architecture constraints
- Create directory if not exists: `/bmad-docs/impl-plan/`
- Update plan status to "Draft - Awaiting Review" and save as: `bmad-docs/impl-plan/{{ticket_number}}-{{ticket_title_short}}.md`
- Provide summary to user including:
  - **Plan created:** `bmad-docs/impl-plan//{{ticket_number}}-{{ticket_title_short}}.md`
  - **Tasks / Subtasks:** Total count of main tasks and subtasks and Checklist Tasks
  - **Summary:** Brief overview of acceptance criteria and key technical decisions
  - Any deviations or conflicts noted between task and architecture
  - **Dependencies/Risks:** If any were identified
  - **Next Steps:** "Please review the plan. Use \*refine-plan to provide feedback, or approve to proceed with implementation."
- HALT and await user to:
  - Approve the plan (ready for dev agent)
  - Request refinements (use \*refine-plan command)
  - Ask questions or provide additional context
