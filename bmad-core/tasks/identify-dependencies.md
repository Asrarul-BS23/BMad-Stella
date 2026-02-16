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

Search Jira using JQL based on semantic features (project, status, keywords, timeframe). Rank candidates by similarity scoring (title 40%, description 30%, component 20%, type 10%). Select top 2-3 tickets interactively or automatically.

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
Display related tickets with similarity scores, files modified, key components, and risk assessment.

**Temporary Dependency File:**
Create `bmad-docs/temporary/{ticket_id}-dependency-tmp.md` with:

```markdown
# Dependency Analysis: {TICKET-ID}

## Summary

Total files impacted, files to modify/create, integration points, overall risk level

## Technical Hints Extracted

- From screenshots: URLs, error traces, console logs
- From ticket: URL patterns, API endpoints, code references
- From architecture: Project structure, naming conventions, routing patterns, layers

## Related Past Work

For each ticket: similarity score, completion date, key learnings, files modified

## Code Dependencies

**Files to Modify:** For each file document:

- Purpose and current state
- How identified (evidence trail)
- Predicted methods/changes
- Requirements and confidence level
- Concerns or complexity notes

**Files to Create:** For each file document:

- Purpose and template source
- How identified (architecture pattern)
- Expected interfaces/methods
- Confidence level and concerns

## Integration Points

Document internal/external integrations with contracts, reliability concerns, and testing requirements

## Blockers

List technical blockers with impact, resolution path, alternatives, and partial progress options

## Risks

Assess technical risks with likelihood, impact, detection method, mitigation, and contingency

## Recommended Approach

Step-by-step approach leveraging past work and addressing blockers

## Critical Path Items

Key dependencies that must be resolved for successful implementation

## Next Steps

Immediate actions required before implementation planning
```

**Console Summary:**
Print analysis completion status with file counts, risk level, related ticket IDs, and next task prompt.

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
