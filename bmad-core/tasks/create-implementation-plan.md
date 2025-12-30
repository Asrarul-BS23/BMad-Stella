<!-- Powered by Stella Development Team -->

# Create Implementation Plan Task

## Purpose

To transform JIRA tickets (features, bugs, migrations) into comprehensive, actionable implementation plans that provide junior developers with all the technical details, step-by-step tasks, and context needed to implement the solution without additional research. This task handles variable input quality - from complete requirements to just ticket titles or screenshots.

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
- Which components/files are likely affected?

**For Bugs:**
- What is the expected behavior vs. actual behavior?
- Can you provide steps to reproduce?
- What is the impact and severity?
- Are there error messages or stack traces?
- Which components/files are likely affected?

**For Migrations:**
- What is being migrated (code, data, infrastructure)?
- What is the source and target state?
- Are there data transformation requirements?
- What is the rollback strategy?
- Are there dependencies on other systems?

**CRITICAL:** Only ask essential questions. Use your senior developer judgment to infer reasonable details when possible.

### 3. Gather Architecture Context

#### 3.1 Determine Architecture Reading Strategy

- **If `architectureVersion: >= v4` and `architectureSharded: true`**: Read `{architectureShardedLocation}/index.md` then follow structured reading
- **Else**: Use monolithic `architectureFile`

#### 3.2 Read Relevant Architecture Documents

**For ALL Tickets:**
- tech-stack.md
- unified-project-structure.md
- coding-standards.md
- testing-strategy.md

**For Backend/API Tickets:**
- data-models.md
- database-schema.md
- backend-architecture.md
- rest-api-spec.md
- external-apis.md

**For Frontend/UI Tickets:**
- frontend-architecture.md
- components.md
- core-workflows.md
- data-models.md

**For Full-Stack Tickets:**
- Read both Backend and Frontend sections above

**For Bug Fixes:**
- Focus on architecture relevant to affected components
- Review error handling patterns
- Check logging and debugging guidelines

**For Migrations:**
- Review current architecture of affected components
- Check deployment and infrastructure docs
- Review data models if data migration involved

#### 3.3 Extract Technical Context

Extract ONLY information directly relevant to this ticket:
- Specific data models, schemas, or structures
- API endpoints to implement or consume
- Component specifications for UI elements
- File paths and naming conventions
- Testing requirements and frameworks
- Security or performance considerations
- Dependencies and third-party libraries

ALWAYS cite source documents: `[Source: architecture/{filename}.md#{section}]`

### 4. Load Dependency Analysis (If Available)

#### 4.1 Check for Temporary Dependency File

- Check if `docs/temporary/{ticket-no}-dependency-tmp.md` exists
- If exists: Read the complete dependency analysis
- If not exists: Proceed without pre-analyzed dependencies (will analyze during planning)

#### 4.2 Extract Dependency Information

If dependency file exists, extract:
- Technical dependencies (code, APIs, modules)
- Infrastructure dependencies (databases, services, configs)
- Third-party dependencies (packages, external APIs)
- Data dependencies (schemas, migrations, transformations)
- Identified blockers (with severity levels)
- Integration points (internal and external)
- Risk assessments (with mitigation strategies)
- Recommended approach and critical path items

#### 4.3 Note Dependency Source

Track whether dependencies came from:
- Pre-existing dependency analysis file
- Derived during this planning process

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

### 6. Identify Technical Approach and Decisions

As a senior developer, document key technical decisions:

#### 6.1 High-Level Approach
- Overall strategy for implementing the ticket
- Major components or modules affected
- Technology/framework choices
- Design patterns to apply

#### 6.2 File Structure Planning
- New files to create (with full paths)
- Existing files to modify
- Files to delete (for migrations)
- Directory structure changes

#### 6.3 Architecture Decisions
- Component design
- Data flow
- State management approach
- API design (if applicable)
- Database schema changes (if applicable)

#### 6.4 Dependencies and Risks

**If dependency file was loaded (Step 4):**
- Integrate all dependencies from the analysis file
- Add any additional dependencies discovered during planning
- Incorporate identified blockers with severity levels
- Include integration points with protocols and error handling
- Document risks with likelihood, impact, and mitigation strategies

**If no dependency file exists:**
- Identify technical dependencies
- List third-party libraries needed
- Note potential blockers
- Highlight areas of uncertainty requiring investigation
- Document integration points with other systems

### 7. Create Detailed Implementation Task List

Break down the implementation into sequential, actionable tasks with checkboxes.

**Task Characteristics:**
- Each task should be completable by a junior developer
- Include specific file paths and function names where applicable
- Reference acceptance criteria (e.g., "AC 1, 2")
- Include technical details from architecture docs
- Specify what to implement, how to implement it, and where

**Task Structure Example:**
```
- [ ] Task 1: Set up data model (AC: 1)
  - [ ] Create file `src/models/User.js` following project structure
  - [ ] Define User schema with fields: id, name, email, created_at
  - [ ] Add validation: email must be valid format, name required
  - [ ] Export model following coding standards [Source: coding-standards.md#exports]

- [ ] Task 2: Implement API endpoint (AC: 1, 2)
  - [ ] Create route handler in `src/routes/users.js`
  - [ ] Implement POST /api/users endpoint
  - [ ] Add request validation middleware
  - [ ] Add error handling following error-handling patterns [Source: backend-architecture.md#errors]
  - [ ] Return 201 with user object on success
```

**Include tasks for:**
1. Setup/preparation tasks
2. Core implementation tasks (in logical order)
3. Integration tasks
4. Error handling and edge cases
5. Testing tasks (unit, integration, e2e as applicable)
6. Documentation updates (if needed)
7. Cleanup/refactoring tasks
8. Dependency validation tasks (if critical dependencies identified)
9. Risk mitigation tasks (for high-risk items)

**Example dependency validation task:**
```
- [ ] Task X: Validate Critical Dependencies (from Dependency Analysis)
  - [ ] Verify database schema exists and is compatible
  - [ ] Test connection to external API service
  - [ ] Confirm required npm packages are installed
  - [ ] Validate environment variables are configured
```

### 8. Define Testing Strategy for This Ticket

Based on testing-strategy.md and ticket type:

**Specify:**
- Test files to create (with full paths)
- Test cases to implement
- Testing frameworks and patterns to use
- Coverage expectations
- Manual testing steps (if any)

**Example:**
```
Testing:
- Create unit tests in `tests/unit/models/User.test.js`
  - Test valid user creation
  - Test validation failures
  - Test edge cases (empty strings, SQL injection attempts)
- Create integration tests in `tests/integration/api/users.test.js`
  - Test POST /api/users with valid data
  - Test error responses
- Run full test suite before marking complete
```

### 9. Create Technical Context Section (Dev Notes)

Compile all technical details that the dev agent will need:

**Include:**
- **Previous Implementation Notes:** Relevant learnings from similar tickets
- **Data Models:** Complete specifications with source refs
- **API Specifications:** Endpoint details with source refs
- **Component Specifications:** UI details with source refs
- **File Locations:** Exact paths based on project structure
- **Code Patterns:** Specific patterns to follow from coding standards
- **Testing Requirements:** Detailed test specifications
- **Technical Constraints:** Versions, performance targets, security rules
- **Dependencies:** Libraries, services, other components
- **Dependencies and Blockers:** Complete dependency analysis with sources, blockers with severity, and mitigation plans
- **Integration Requirements:** Integration points with protocols, error handling, and fallback strategies
- **Risk Mitigation:** Strategies for identified risks with monitoring requirements

**CRITICAL:** Every technical detail MUST include source reference or note if derived

### 10. Populate Implementation Plan Template

- Use `{root}/templates/implementation-plan-tmpl.yaml` structure
- Fill all sections completely:
  - Ticket Information (number, type, title, description)
  - Acceptance Criteria (derived or provided)
  - Requirements (explicit or derived)
  - Technical Approach
  - Implementation Tasks (with checkboxes)
  - Testing Strategy
  - Technical Context / Dev Notes
  - Dependencies and Risks (from dependency analysis or derived)
  - File Structure Changes
  - Dependency Cleanup Action (what was done with temporary file)

### 11. Save Implementation Plan

- Create directory if not exists: `/docs/impl-plan/`
- Save plan as: `/docs/impl-plan/{ticket-number}-implementation-plan.md`
- Update plan status to "Draft - Awaiting Review"

### 12. Clean Up Temporary Dependency File

If a dependency file was loaded in Step 4:

#### 12.1 Determine Cleanup Action

**Scenario 1: All dependencies addressed in current plan**
- If all dependencies from `{ticket-no}-dependency-tmp.md` are incorporated into this implementation plan
- **Action:** Delete `docs/temporary/{ticket-no}-dependency-tmp.md` completely
- **Reason:** All dependencies have been addressed and documented in the implementation plan

**Scenario 2: Dependencies span multiple tasks**
- If the ticket is large (multiple story points) and will be decomposed using `decompose-task.md`
- Some dependencies may apply to future subtasks not yet planned
- **Action:**
  - Remove only the dependencies addressed in this implementation plan from the temporary file
  - Keep dependencies that apply to other subtasks that haven't been planned yet
  - Update the temporary file with remaining dependencies
- **Reason:** The temporary file will be reused when creating implementation plans for subsequent subtasks

#### 12.2 Log Cleanup Action

Document which action was taken and why in a comment at the end of the implementation plan.

### 13. Present Plan to User for Review

Provide summary including:
- **Plan created:** `/docs/impl-plan/{ticket-number}-implementation-plan.md`
- **Ticket Type:** Feature/Bug/Migration
- **Status:** Draft - Awaiting Review
- **Acceptance Criteria:** List all ACs
- **Number of Implementation Tasks:** X tasks with Y subtasks
- **Key Technical Components:** Brief summary
- **Dependencies Identified:** [X technical, Y infrastructure, Z third-party dependencies]
- **Critical Blockers:** List any critical blockers that must be resolved
- **Risk Level:** [Low/Medium/High/Critical] based on dependency analysis
- **Estimated Complexity:** Simple/Moderate/Complex (based on task count and dependencies)
- **Next Steps:** "Please review the plan. Use *refine-plan to provide feedback, or approve to proceed with implementation."

### 14. Await User Feedback

HALT and wait for user to:
- Approve the plan (ready for dev agent)
- Request refinements (use *refine-plan command)
- Ask questions or provide additional context
