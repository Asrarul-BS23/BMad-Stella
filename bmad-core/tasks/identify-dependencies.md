<!-- Powered by Stella Development Team -->

# identify-dependencies

Find related past work, analyze code dependencies, and assess modification requirements for current ticket implementation.

## Inputs

```yaml
required:
  - ticket_id: 'Current Jira ticket ID' # e.g., "PROJ-123"
  - jira_project: 'Jira project key from MCP config'

optional:
  - max_related_tickets: 3 # Number of past tickets to analyze (default: 3)
  - architecture_refs: 'bmad-docs/architecture/**'
  - code_base_path: 'Root path for code analysis'
```

## Purpose

Generate comprehensive dependency analysis including:

1. Related past tickets (2-3 with semantic similarity)
2. Code files modified in past work
3. Code modification assessment for current ticket
4. Temporary dependency file at `bmad-docs/temporary/{ticket_id}-dependency-tmp.md`

## Process

### 1. Validate Data Sources

Verify Atlassian MCP connection. If unavailable, request Jira URL or fallback to git history analysis.

### 2. Load Current Ticket Context

**Fetch ticket details** via MCP including summary, description, type, components, and acceptance criteria.

**Analyze attachments** (screenshots, error logs):

- Extract URLs from browser bars and network tabs
- Identify file paths from stack traces
- Note API endpoints and error messages
- Capture UI routes and console logs

**Extract technical hints** from ticket content:

- Feature keywords and technical components
- URL patterns and route segments
- API endpoints and frontend components
- Function/class names and file references

### 3. Find Related Past Tickets

**Build search scope:** Check if current ticket has a parent. If parent exists and differs from project, include parent in JQL query. Otherwise, search at project level only.

**Search Jira:** Use JQL with project, status (Done/Closed/Resolved), parent (if applicable), keywords, and timeframe (last 6 months).

**Rank candidates:** Score by similarity (title 40%, description 30%, component 20%, type 10%).

**Select tickets:** Present top candidates for user selection or auto-select top 2-3.

### 4. Analyze Code Changes from Past Tickets

**Extract commits:** Check Jira ticket for linked commits (primary source). If none found, search git history with `git log --all --grep="{TICKET-ID}"`.

**Analyze changes:** For each commit, use `git show --name-status {SHA}` to get modified/added/deleted files.

**Group results:** Organize files by component/module, file type (controller, service, model, test), and architectural layer (frontend, backend, database).

### 5. Assess Current Ticket Code Impact

**Load architecture context:**
Read project architecture docs (`bmad-docs/architecture/**`) to extract directory structures, naming conventions, URL routing patterns, and testing patterns. Use these conventions as the primary guide for code location.

**Map URLs to code:**

- Use architecture-defined routing patterns to map URLs from screenshots/descriptions to controllers and views
- Apply project-specific conventions (not generic framework patterns)
- Generate candidate files with confidence scores based on evidence strength

**Trace API calls (Frontend → Backend):**

- Locate frontend components using routing configuration
- Extract API calls using project's HTTP client patterns
- Map API endpoints to backend routes and controllers
- Follow architectural layers (routes → controllers → services → repositories → models)

**Generate candidate functions:**
Use architecture-defined naming patterns to predict function names. Search codebase with project conventions (directory structure + naming patterns). Consider multiple naming styles only if architecture doesn't specify.

**Synthesize predictions:**
Combine evidence from multiple sources with priority:

1. Architecture conventions (highest)
2. Past ticket patterns
3. URL/route mapping
4. API endpoint tracing
5. Function name inference
6. Generic framework conventions (fallback only)

Document each file with evidence trail, predicted methods/changes, and confidence level (HIGH/MEDIUM/LOW).

**Verify file state:**
Check existence, last modified date/author, complexity metrics, and whether file appeared in related tickets.

### 6. Generate Outputs

**Console Report:**
Display minimal summary in terminal with single-line format per related ticket showing ticket ID, similarity percentage, and file count only.

**Temporary Dependency File:**
Create `bmad-docs/temporary/{ticket_id}-dependency-tmp.md` containing the following aspects:

```

**Summary Section:**
Provide quantitative overview including total number of files impacted, breakdown of files requiring modification versus new file creation, count of integration points, and overall risk level classification (Simple/Moderate/Complex).

**Technical Hints Extracted:**
Document all technical clues organized by source. From screenshots include URLs, file paths from error traces, and console log messages. From ticket description capture URL patterns, API endpoint references, and direct code references. From architecture documentation note project structure conventions, naming patterns, routing configurations, and architectural layers.

**Related Past Work:**
For each related ticket identified, include similarity score percentage, completion date, key learnings or patterns discovered, and complete list of files that were modified during that work.

**Code Dependencies - Files to Modify:**
For each existing file requiring changes, document its purpose and current state, explain the evidence trail showing how it was identified, describe predicted methods or code sections needing changes, state implementation requirements, assign confidence level (HIGH/MEDIUM/LOW), and note any concerns or complexity factors.

**Code Dependencies - Files to Create:**
For each new file needed, specify its purpose and which template or pattern it should follow, explain how this need was identified through architecture analysis, outline expected interfaces or methods it should implement, assign confidence level, and document any concerns about its creation.

**Integration Points:**
Document all integration touchpoints both internal (between modules) and external (third-party services). For each integration specify the contract or interface, note reliability concerns, and define testing requirements.

**Blockers:**
List technical blockers preventing immediate progress. For each blocker describe its impact on implementation, outline resolution path, suggest alternatives if available, and indicate whether partial progress is possible while blocker remains.

**Risks:**
Assess technical risks with structured analysis. For each risk specify likelihood (High/Medium/Low), potential impact, detection method during implementation, mitigation strategy, and contingency plan if risk materializes.

**Recommended Approach:**
Provide step-by-step implementation approach that leverages patterns from past work, addresses identified blockers, and follows project architectural conventions.

**Critical Path Items:**
Identify key dependencies that absolutely must be resolved for successful implementation. These are prerequisites that block all progress if not addressed.

**Next Steps:**
List immediate actionable items required before proceeding to implementation planning phase.

```

**Console Summary:**
Print single-line completion message containing: dependency file path, total files to modify, total files to create, risk level (Simple/Moderate/Complex), and related ticket IDs (comma-separated). No additional explanatory text or formatting.

## Assessment Criteria

**Similarity Scoring:**

- High (≥80%): Same component/module and feature area
- Medium (60-79%): Related area with some overlap
- Low (<60%): Different area with useful patterns

**Code Impact Assessment:**

- Simple (Low Risk): 1-3 files, clear patterns, no new integrations
- Moderate (Medium Risk): 4-10 files, some new files, 1-2 integration points
- Complex (High Risk): 10+ files, many new components, multiple integrations

## Key Principles

**Evidence Priority (for code location):**

1. Architecture documentation (highest - project conventions)
2. Screenshots/attachments (URLs, error traces)
3. Past ticket patterns (proven approaches)
4. Code tracing (URL → routes → controllers → services)
5. Semantic inference (function name generation)
6. Generic framework conventions (fallback only)

**Best Practices:**

- Focus on semantic similarity over keyword matching
- Prioritize recent work (last 6 months)
- Extract architecture conventions first
- Combine multiple evidence sources
- Document uncertainties as risks, not blockers
- Show evidence trail for transparency
- Keep console output concise, temp file detailed

## Integration with Implementation Plan

The `create-implementation-plan` task reads the temporary dependency file and integrates findings. After integration:

- Delete temp file if all dependencies addressed
- Keep remaining items if dependencies span multiple subtasks

**Workflow:** identify-dependencies → decompose-task (optional) → create-implementation-plan → repeat for subtasks
