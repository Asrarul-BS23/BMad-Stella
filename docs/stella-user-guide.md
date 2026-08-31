# Stella User Guide

## Overview

Stella is an AI-powered development workflow system that guides you through the complete software development lifecycle - from planning to implementation, testing, and review. This guide will help you understand how to work with Stella's specialized agents in **Claude Code CLI** to deliver high-quality software efficiently.

---

## Installation

### Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **Claude Code CLI** — [setup guide](https://docs.anthropic.com/claude/docs/claude-code)
- **Atlassian account** — JIRA access + API token ([how to create](atlassian-token-guide.md))
- **Confluence architecture page** _(optional)_ — for auto-loading coding standards, tech stack, project structure

### Install

Open a command prompt in your project directory and run:

```bash
npx bmad-stella install
```

The installer is interactive. Most prompts have sensible defaults — press **ENTER** to accept, **SPACE** to toggle multiselect options.

### Walkthrough

The installer asks 8 questions. Defaults are pre-selected — most users press **ENTER** through each.

**1. Project directory**

```
? Enter the full path to your project directory:
```

Path where `.bmad-core/` will be installed. Use `./` if already inside your project directory.

**2. What to install**

```
? Select what to install/update:
  (*) BMad Agile Core System (default)
```

Press **ENTER** to install the core. Toggle expansion packs with **SPACE** if needed.

**3. Architecture documentation source**

```
? Select your project for architecture documentation:
> LEADRS Core
  Risk Monitor
  SAFV
  QuarryConnect
  DRE
  SLS-FRONTEND
  SLS-BACKEND
  TEC
  Other (custom URL)
```

Pick your project. Choose **Other** to paste a custom Confluence page URL. If Atlassian credentials are set up during install, architecture docs and domain knowledge are downloaded from this page right away; otherwise the planner (architecture) and domain expert (domain knowledge) fetch them on first activation.

**4. IDE**

```
? Which IDE(s) do you want to configure:
  (*) Claude Code (default)
```

Press **ENTER**. Toggle additional IDEs with **SPACE** only if needed.

**5. Claude Code permissions**

```
? Grant Claude Code with BMAD related permissions? (Y/n)
```

Enter **y**. Adds the BMad allowlist to `.claude/settings.local.json` so agents run without permission prompts.

**6. Notification System**

```
? Do you want to set up Notification from Claude events? (Y/n)
```

Enter **y**. To be notified upon Claude events like when your permission is required or Claude has finished working.

**7. MCP servers**

```
? Which MCP servers do you want to configure:
  (*) Atlassian (for JIRA & Confluence integration)
  ( ) Other (custom MCP server)
```

Atlassian is pre-selected. Press **ENTER**.

- **Atlassian:**
  - **If not configured:** asks for your JIRA instance URL. Example: `https://stellaint.atlassian.net`
  - **If already configured:** skips the prompt and shows authentication status.

**8. Jira API credentials**

Used by the Jira attachment helper to download ticket images and PDFs. Stored in git-ignored `bmad-docs/.bmad-tokens/.env` (mode 0600).

- **First-time setup:**

  ```
  ? Configure Jira API access to auto-fetch ticket attachments? (Y/n)
  ```

  Enter **y**, then provide:

  ```
  ? Atlassian site URL:       https://stellaint.atlassian.net
  ? Atlassian account email:  you@stellainternational.com
  ? Atlassian API token:      ********
  ```

  [Create a token here](https://id.atlassian.com/manage-profile/security/api-tokens).

- **If credentials already exist in `bmad-docs/.bmad-tokens/.env`:**

  ```
  ✓ Detected existing credentials (you@stellainternational.com → https://stellaint.atlassian.net).
  ? Use the detected credentials as-is? (Y/n)
  ```

  Press **ENTER** to reuse. Choose **n** to overwrite with fresh values.

- **If you decline setup:** the helper is skipped — the planner agent will ask you to paste ticket attachments manually instead.

Installation completes with a summary of installed components.

### What Gets Installed Where

| Location                       | What                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| `.bmad-core/`                  | Agents, tasks, templates, `core-config.yaml`                 |
| `bmad-docs/`                   | Plans, QA reports, logs, memory — git-ignored, per developer |
| `bmad-docs/.bmad-tokens/.env`  | JIRA API credentials (git-ignored, mode 0600)                |
| `.claude/settings.local.json`  | BMad permissions allowlist + project hooks                   |
| `.claude/bmad-hooks/`          | Friction logger (BMAD-LOGS) + prompt hooks (project-level)   |
| `~/.claude/bmad-hooks/`        | Notification + personalization hooks (user-wide)             |
| `~/.claude/personalization.md` | Your developer profile, seeded from git config               |

### Post-Installation

#### Authenticate MCP servers

Required before using the planner agent.

1. Open Claude Code in your project directory
2. Run `/mcp`
3. Select **Atlassian** → follow the OAuth redirect → grant JIRA + Confluence access
4. Verify **Atlassian** shows **Connected**

### Troubleshooting

| Issue                         | Solution                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npx` not found               | Install Node.js 20+ from [nodejs.org](https://nodejs.org)                                                                                                                                                                            |
| Permission denied             | Run with elevated permissions or `sudo` (Unix)                                                                                                                                                                                       |
| Cannot reach JIRA             | Verify URL + network access                                                                                                                                                                                                          |
| Architecture docs not loading | Re-authenticate: `/mcp` → Atlassian → Re-authenticate                                                                                                                                                                                |
| Agent files not found         | Re-run `npx bmad-stella install`                                                                                                                                                                                                     |
| Jira attachments not loading  | Check all credentials in `bmad-docs/.bmad-tokens/.env` (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`). If the token expired, [create a new one](https://id.atlassian.com/manage-profile/security/api-tokens) and update the file. |
| No desktop notifications      | Re-run `npx bmad-stella install` and accept the notification prompt                                                                                                                                                                  |

---

## Quick Start

**Environment:** All commands below are executed in **Claude Code CLI**

**⚠️ Important:** Complete the [Installation](#installation) section before following this quick start guide.

Every development task follows this core workflow:

```
                          ┌─ Domain Expert (advisor, anytime)
                          ↓
Planner → Dev → QA → Security → Reviewer
         ↑__________(if fixes needed)__|
```

**Agent Activation (in Claude Code CLI):**

- `/planner` - Activate planning agent
- `/dev` - Activate development agent
- `/qa` - Activate QA/testing agent
- `/security` - Activate security auditor
- `/quick-dev` - Activate quick dev agent (full cycle, single session)
- `/reviewer` - Activate review agent
- `/domain-expert` - Activate project knowledge oracle (advisory)

**Must-Use Commands:**

- `*retrieve-ticket-information` - Fetch JIRA ticket details (JIRA path)
- `*capture-requirements` - Capture requirements from non-JIRA sources (.md, .txt, direct instruction)
- `*draft-plan` - Create implementation plan
- `*implement-task` - Execute planned tasks
- `*comment-plan` - Post implementation summary to JIRA (after full completion)
- `*test-design` - Design test scenarios
- `*implement-test` - Write test code
- `*trace` - Map requirements to tests
- `*run-tests` - Execute all tests
- `*check-frontend` - Audit frontend security against the plan
- `*check-backend` - Audit backend security against the plan
- `*review-qa-security` - Apply QA / security fixes (dev agent)
- `*review` - Review and optimize code

**Important Optional Commands:**

- `*refine-plan` - Iterate on plan before dev starts
- `*validate-plan` - Validate plan completeness
- `*risk-profile` - Assess risks for complex stories
- `*pr-review` - Review a GitHub PR against its requirements (reviewer, read-only)
- `*ask` / `*explain` / `*decide` - Query project knowledge (domain expert)
- `*search` / `*status` - Search loaded docs / show which docs are loaded (domain expert)
- `*decompose-task` - Break a complex task into detailed subtasks (planner)
- `*onboard` - Guided project onboarding for new developers (domain expert)
- `*reload` - Refresh domain knowledge from Confluence (domain expert)
- `*quick-flow` - Run full dev cycle in one session (quick-dev)

**User-Level Commands:**

- `/BMad:caveman <intensity>` - Reduce output tokens (lite / full / ultra / wenyan-lite / wenyan-full / wenyan-ultra); revert with "stop caveman"
- `/BMad:caveman-compress <file-path>` - Compress a target file

---

## The Stella Development Workflow

```mermaid
graph TD
    A["Start Development"] --> A1{"Source?"}
    A1 -->|JIRA Ticket| B["Planner: *retrieve-ticket-information"]
    A1 -->|Non-JIRA<br/>(.md / .txt / direct)| B2["Planner: *capture-requirements"]
    B --> C["Planner: *draft-plan"]
    B2 --> C
    C --> D{"High-Risk Story?"}
    D -->|Yes| E["Planner: *risk-profile"]
    D -->|No| F
    E --> F{"Refine Plan?"}
    F -->|Yes| G["Planner: *refine-plan"]
    F -->|Skip| H
    G --> H["Planner: *validate-plan"]
    H --> I{"User Approval"}
    I -->|Needs Changes| C
    I -->|Approved| J{"Design Tests Before Dev? (Recommended)"}
    J -->|Yes| K["QA: *test-design"]
    J -->|Skip for Now| L
    K --> L["Dev: *implement-task"]
    L --> M["Dev: Sequential Task Execution"]
    M --> N["Dev: Complete All Tasks"]
    N --> P{"User Verification"}
    P -->|Request QA Review| S{"Test Design Done?"}
    S -->|No| T["QA: *test-design"]
    S -->|Yes| U
    T --> U["QA: *implement-test"]
    U --> V["QA: *trace"]
    V --> W["QA: *run-tests"]
    W --> X{"QA Decision"}
    X -->|Needs Dev Fixes| Y["Dev: *review-qa-security"]
    Y --> W1["QA: *run-tests to Verify Fixes"]
    W1 --> X
    X -->|Approved| Z
    P -->|Needs Fixes| M
    P -->|Approve Without QA| Z["IMPORTANT: Verify All Tests Pass"]
    Z --> SEC1["Security: *check-frontend"]
    SEC1 --> SEC2["Security: *check-backend"]
    SEC2 --> SECX{"Violations Found?"}
    SECX -->|Yes| SECY["Dev: *review-qa-security"]
    SECY --> SEC1
    SECX -->|No| AA["Reviewer: *review"]
    AA --> AB{"Reviewer Finds Issues?"}
    AB -->|Yes| AC["Reviewer: Apply Improvements Directly"]
    AC --> AD["QA: *run-tests to Verify"]
    AD --> AA
    AB -->|No Issues| AE["Dev: *comment-plan + Mark Ticket Complete"]
    AE --> A

    DE["Domain Expert: *ask / *explain / *decide<br/>(advisor — query anytime)"]
    DE -.advises.-> C
    DE -.advises.-> L
    DE -.advises.-> AA

    style A fill:#f5f5f5,color:#000
    style A1 fill:#e3f2fd,color:#000
    style B fill:#e8f5e9,color:#000
    style B2 fill:#e8f5e9,color:#000
    style C fill:#e8f5e9,color:#000
    style D fill:#e3f2fd,color:#000
    style E fill:#ffd54f,color:#000
    style F fill:#e3f2fd,color:#000
    style G fill:#e8f5e9,color:#000
    style H fill:#e8f5e9,color:#000
    style I fill:#e3f2fd,color:#000
    style J fill:#e3f2fd,color:#000
    style K fill:#ffd54f,color:#000
    style L fill:#e3f2fd,color:#000
    style M fill:#e3f2fd,color:#000
    style N fill:#e3f2fd,color:#000
    style P fill:#e3f2fd,color:#000
    style S fill:#e3f2fd,color:#000
    style T fill:#ffd54f,color:#000
    style U fill:#ffd54f,color:#000
    style V fill:#ffd54f,color:#000
    style W fill:#ffd54f,color:#000
    style W1 fill:#ffd54f,color:#000
    style X fill:#e3f2fd,color:#000
    style Y fill:#e3f2fd,color:#000
    style Z fill:#ff5722,color:#fff
    style SEC1 fill:#b71c1c,color:#fff
    style SEC2 fill:#b71c1c,color:#fff
    style SECX fill:#e3f2fd,color:#000
    style SECY fill:#e3f2fd,color:#000
    style AA fill:#f9ab00,color:#fff
    style AB fill:#e3f2fd,color:#000
    style AC fill:#f9ab00,color:#fff
    style AD fill:#ffd54f,color:#000
    style AE fill:#34a853,color:#fff
    style DE fill:#7e57c2,color:#fff
```

---

## Common Workflows

**Note:** All commands below are executed in **Claude Code CLI**.

### Workflow 1: Standard Feature Development

```bash
# 1. Planning Phase (in Claude Code CLI)
/planner
*retrieve-ticket-information PROJ-123
*draft-plan {task-file}
# For complex/high-risk stories, add risk assessment:
# *risk-profile bmad-docs/impl-plan/PROJ-123-plan.md
*validate-plan bmad-docs/impl-plan/PROJ-123-plan.md

# 2. Optional: Design Tests Before Development (Recommended)
/qa
*test-design bmad-docs/impl-plan/PROJ-123-plan.md

# 3. Development Phase
/dev
*implement-task
# (repeat for each task until all complete)

# 4. Testing Phase
/qa
# If test design not done earlier, do it now:
# *test-design bmad-docs/impl-plan/PROJ-123-plan.md
*implement-test bmad-docs/impl-plan/PROJ-123-plan.md
# After tests are implemented, create traceability matrix:
*trace bmad-docs/impl-plan/PROJ-123-plan.md
# After trace confirms coverage, run tests:
*run-tests

# 5. Security Audit
/security
*check-frontend bmad-docs/impl-plan/PROJ-123-plan.md
*check-backend bmad-docs/impl-plan/PROJ-123-plan.md
# If violations found, fix them:
/dev
*review-qa-security
# Re-run security checks until clean
/security
*check-frontend bmad-docs/impl-plan/PROJ-123-plan.md
*check-backend bmad-docs/impl-plan/PROJ-123-plan.md

# 6. Review Phase
/reviewer
*review bmad-docs/impl-plan/PROJ-123-plan.md
# Reviewer applies improvements directly if issues found

# 7. Verify Improvements (if reviewer made changes)
/qa
*run-tests
# If tests pass, proceed to completion

# 8. Mark Complete and Update JIRA
/dev
*comment-plan bmad-docs/impl-plan/PROJ-123-plan.md
# Mark ticket as complete
```

### Workflow 2: Bug Fix with QA Feedback Loop

```bash
# 1. Planning (in Claude Code CLI)
/planner
*retrieve-ticket-information BUG-789
*draft-plan {task-file}
*validate-plan bmad-docs/impl-plan/BUG-789-plan.md

# 2. Optional: Design Tests Before Fix (Recommended)
/qa
*test-design bmad-docs/impl-plan/BUG-789-plan.md

# 3. Initial Fix
/dev
*implement-task

# 4. QA Testing
/qa
*implement-test bmad-docs/impl-plan/BUG-789-plan.md
# After tests are implemented, create traceability matrix:
*trace bmad-docs/impl-plan/BUG-789-plan.md
# After trace confirms coverage, run tests:
*run-tests
# Tests fail - QA provides feedback

# 5. Apply QA Fixes
/dev
*review-qa-security
# Dev makes corrections based on QA feedback

# 6. Re-run QA Validation
/qa
*run-tests
# Verify fixes resolve issues

# 7. Security Audit
/security
*check-frontend bmad-docs/impl-plan/BUG-789-plan.md
*check-backend bmad-docs/impl-plan/BUG-789-plan.md
# If violations found, loop back to /dev *review-qa-security and re-check

# 8. Review
/reviewer
*review bmad-docs/impl-plan/BUG-789-plan.md
# Reviewer applies improvements directly if issues found

# 9. Verify Improvements (if reviewer made changes)
/qa
*run-tests
# If tests pass, proceed to completion

# 10. Mark Complete and Update JIRA
/dev
*comment-plan bmad-docs/impl-plan/BUG-789-plan.md
# Mark ticket as complete
```

### Workflow 3: Non-JIRA Requirements (Direct / Markdown / Text File)

Use when work originates outside JIRA — a brief, an internal doc, or a direct ask.

```bash
# 1. Capture Requirements (in Claude Code CLI)
/planner
# Option A: direct text
*capture-requirements "Add dark-mode toggle to settings page; persist preference per user."
# Option B: markdown / text file
# *capture-requirements ./docs/specs/dark-mode-brief.md
# Planner asks for screenshots, Plan ID, and confirms type (Bug/Feature/Migration)

# 2. Draft and validate plan
*draft-plan
*validate-plan bmad-docs/impl-plan/{plan-id}-plan.md

# 3. Continue with the standard flow (test-design → implement → QA → security → reviewer)
# Skip *comment-plan at the end — there is no JIRA ticket to comment on
```

### Workflow 4: Onboarding a New Developer

Use when a new developer joins the project and needs a guided tour of architecture, conventions, and tech stack.

```bash
# 1. Activate the domain expert (in Claude Code CLI)
/domain-expert

# 2. Run guided onboarding
*onboard
# Walks through overview, tech stack, architecture, structure, workflow, coding standards, Q&A

# 3. Ad-hoc questions (anytime, during any workflow)
*ask "How does authentication work?"
*explain "the payment service"
*decide "Should this be a new service or extend the existing API?"

# 4. Refresh knowledge after Confluence updates
*reload
```

### Workflow 5: Quick Dev (Small Features and Bug Fixes)

Use for small, well-scoped work where switching between four agents adds unnecessary overhead.

```bash
# Single-session full cycle
/quick-dev
*quick-flow PROJ-456
# Alice guides you through each step with confirmation halts:
# intake → plan (approve) → implement → test → security check → review → Jira post-back

# Or run steps individually for more control:
/quick-dev
*intake PROJ-456
*draft-plan
# Approve the plan, then:
*implement-task
*test
*check-security
*review-qa-security
*review
*comment-plan
```

---

## Best Practices

### Planning Phase

1. **Always retrieve ticket info first** - Don't skip straight to planning (use `*capture-requirements` for non-JIRA sources)
2. **Use risk-profile for complex stories** - Better to assess risks early
3. **Validate plans before handoff** - Saves time in development
4. **Refine based on feedback** - Iteration improves plan quality
5. **Include detailed acceptance criteria** - Makes testing easier

### Development Phase

1. **Follow the plan exactly** - It contains all necessary context
2. **Implement tasks sequentially** - Don't skip ahead
3. **Write tests as you go** - Don't defer testing to the end
4. **Run validations after each task** - Catch issues early
5. **Update File List continuously** - Maintain accurate change tracking
6. **Ask questions when blocked** - Don't fail silently
7. **Mark tasks complete as you go** - Update plan checkboxes after each task

### Testing Phase

1. **Design tests before implementation (Recommended)** - Guides development and ensures testability
2. **Follow correct sequence** - `*test-design` → `*implement-test` → `*trace` → `*run-tests`
3. **Never skip trace** - Always run `*trace` after test implementation to verify coverage before running tests
4. **Prioritize critical paths (P0)** - Test must-haves first
5. **Implement tests in priority order** - P0 → P1 → P2 → P3
6. **Run full test suite** - Including regression tests after trace confirms coverage
7. **Document gaps clearly** - Help dev address issues

### Security Phase

1. **Run after QA approval** - Audit only verified code; saves cycles on flaky builds
2. **Always run both layers** - `*check-frontend` and `*check-backend` cover different attack surfaces
3. **Security never modifies code** - Findings land in the plan's Security Violations section; dev fixes via `*review-qa-security`
4. **Loop until clean** - Re-run `*check-frontend` / `*check-backend` after each fix until no violations remain
5. **Don't skip for "small" changes** - Auth, validation, and audit gaps surface in unexpected places

### Review Phase

1. **Reviewer applies fixes directly** - No need to loop back to dev
2. **Focus on real improvements** - Not theoretical optimizations
3. **Prioritize performance** - Time complexity matters
4. **Keep changes simple** - Avoid over-engineering
5. **Always run tests after changes** - Use `/qa` then `*run-tests` to verify improvements

### Domain Expert Usage

1. **Query before guessing** - Use `*ask` / `*explain` / `*decide` instead of inferring from code
2. **Cite-from-docs reduces drift** - Sage answers only from `bmad-docs/domain-knowledge/` and `bmad-docs/architecture/`, with source citations
3. **Use `*onboard` for new joiners** - Guided walkthrough beats ad-hoc reading
4. **Run `*reload` after Confluence updates** - Refreshes the knowledge base from the latest docs
5. **Treat knowledge gaps as a signal** - When Sage says "not covered", update the Confluence Domain-Knowledge page rather than letting code be the only source of truth

---

## Troubleshooting

| Issue                                         | Cause                                                                                                                     | Solution                                                                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cannot retrieve ticket or post comments**   | Atlassian MCP authentication failed                                                                                       | /mcp → Navigate to Atlassian → Re-authenticate → Confirm JIRA URL format and ticket access                                                                                                                           |
| **Attachments not auto-loaded into plan**     | Jira API credentials missing, invalid, or `bmad-docs/.bmad-tokens/.env` not present                                       | Run `npx bmad-stella install` to refresh credentials, or create `bmad-docs/.bmad-tokens/.env` with `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`. Verify with `node .bmad-core/utils/jira-attachments --self-test` |
| **`Authentication failed (401)` from helper** | Expired or revoked Atlassian API token                                                                                    | Regenerate token at https://id.atlassian.com/manage-profile/security/api-tokens → Update `JIRA_API_TOKEN` in `bmad-docs/.bmad-tokens/.env` → Retry                                                                   |
| **Agent cannot find plan file**               | Plan file path incorrect or not created                                                                                   | Ensure plan exists in `bmad-docs/impl-plan/{PLAN-ID}-plan.md` → Provide full path                                                                                                                                    |
| **Tests failing during validation**           | Implementation mismatch or incorrect test scenarios                                                                       | Review test failure messages → Verify implementation matches requirements → Use `/dev` then `*review-qa-security` → Use `/qa` then `*run-tests` to verify fixes                                                      |
| **Dev agent HALTs**                           | Unapproved dependency, ambiguous requirements, 3+ failures, missing config, or failing regression                         | Address blocking issue (approve dependency, clarify requirements, provide config, fix tests) → Resume                                                                                                                |
| **`*run-tests` shows no tests**               | Test design or implementation not completed                                                                               | Run `/qa` → `*test-design` → `*implement-test` → Then `*run-tests`                                                                                                                                                   |
| **Architecture docs not loading**             | Install-time prefetch skipped (no Atlassian credentials) and Atlassian MCP not authenticated, or incorrect Confluence URL | `/mcp` → Atlassian → Re-authenticate → Verify Confluence URL in core-config.yaml → Re-run `/planner` activation (or delete `bmad-docs/architecture/` and re-run `npx bmad-stella install`)                           |
| **Agent commands not recognized**             | BMad-Stella not installed or installed incorrectly                                                                        | Follow Installation section → Run `npx bmad-stella install`                                                                                                                                                          |

---

## Command Reference

**Note:** All commands listed below are executed in **Claude Code CLI**.

### Planner Agent Commands

**Activation (in Claude Code CLI):** `/planner`
**Agent:** Alex - Senior Implementation Planner
**Icon:** 🎯

| Command                        | Purpose                                                                                                                               | When to Use                                                                                                                                                                                                                       | Files Created/Modified                                                   | Parameters                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `*help`                        | Display all available commands                                                                                                        | When starting planner agent or need command list                                                                                                                                                                                  | None                                                                     | None                                                                                  |
| `*retrieve-ticket-information` | Fetch JIRA ticket details via Atlassian MCP                                                                                           | **First step (JIRA path)** in planning workflow. Use when you have a JIRA ticket number or URL and need to gather requirements, acceptance criteria, and attachments before planning                                              | None (displays ticket info for validation)                               | `{ticket-number-or-url}` - JIRA ticket ID (e.g., PROJ-123) or full URL                |
| `*capture-requirements`        | Capture requirements from non-JIRA sources (direct text, .md, or .txt) and prepare for planning                                       | **First step (non-JIRA path)** in planning workflow. Use when work originates from a brief, internal doc, or direct ask. Asks for screenshots, Plan ID, and confirms type (Bug/Feature/Migration) before handoff to `*draft-plan` | None (displays prepared summary for validation)                          | `{input}` - Direct text (quoted) OR path to a `.md`/`.txt` file                       |
| `*identify-dependencies`       | Find related past tickets, analyze code files modified in past work, and assess code modification requirements for the current ticket | After retrieving ticket info. Use before drafting a plan for complex tasks to understand what past work is related, which files are likely impacted, and what risks or blockers exist early                                       | **Creates:** `bmad-docs/temporary/{TICKET-ID}-dependency-tmp.md`         | `{ticket-number-or-url}` - JIRA ticket ID (e.g., PROJ-123) or full URL                |
| `*draft-plan`                  | Create detailed implementation plan with tasks, technical approach, and dependencies                                                  | After retrieving ticket info and validating requirements. Transforms task into actionable plan with step-by-step tasks that junior developers can follow                                                                          | **Creates:** `bmad-docs/impl-plan/{PLAN-ID}-plan.md`                     | `{task-file-or-description}` - Task file path or description with Acceptance Criteria |
| `*decompose-task`              | Break down a complex task into detailed subtasks                                                                                      | When a task is too large or vague to plan directly. Produces a detailed subtask breakdown before or during plan drafting                                                                                                          | None (displays decomposition for validation)                             | `{task-file-or-description}` - Task file path or description                          |
| `*refine-plan`                 | Iterate and improve existing implementation plan                                                                                      | When initial plan needs more technical detail, user provides feedback, requirements change, or approach needs adjustment. Supports iterative refinement before dev handoff                                                        | **Modifies:** Existing plan file                                         | `{plan-file}` - Path to implementation plan                                           |
| `*validate-plan`               | Run validation checklist on plan completeness                                                                                         | Before handing off to dev agent. Ensures plan has all required sections, clear acceptance criteria, detailed tasks, identified dependencies, and technical decisions documented                                                   | None (displays validation results)                                       | `{plan-file}` - Path to implementation plan                                           |
| `*risk-profile`                | Generate risk assessment matrix with mitigation strategies                                                                            | For complex/high-risk stories: database migrations, schema changes, breaking API changes, multi-integration features, security-sensitive implementations, or stories affecting critical business flows                            | **Creates:** Risk assessment section in plan or separate assessment file | `{story}` - Story/plan reference                                                      |
| `*exit`                        | Exit planner agent mode                                                                                                               | When planning phase is complete and plan is validated                                                                                                                                                                             | None                                                                     | None                                                                                  |

---

### Dev Agent Commands

**Activation (in Claude Code CLI):** `/dev`
**Agent:** Bob - Full Stack Developer
**Icon:** 💻

| Command               | Purpose                                        | When to Use                                                                                                                                                                                                                                                     | Files Created/Modified                                                                                                                                         | Parameters                                    |
| --------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `*help`               | Display all available commands                 | When starting dev agent or need command list                                                                                                                                                                                                                    | None                                                                                                                                                           | None                                          |
| `*implement-task`     | Execute implementation plan tasks sequentially | **Primary development command.** Use when you have an approved implementation plan and are ready to code. Implements one task at a time, writes tests, runs validations, and HALTs between tasks for user approval                                              | **Modifies:** Implementation plan (checkboxes, Dev Agent Record, Change Log, Status). **Creates/Modifies:** Source code files, test files as specified in plan | None (reads from current implementation plan) |
| `*comment-plan`       | Post implementation summary to JIRA ticket     | **ONLY after ticket implementation is FULLY done** - all tasks completed with [x], all validations pass, code complete. Posts formatted comment with completed tasks, technical summary, and acceptance criteria (if not in ticket) to update JIRA stakeholders | None (posts comment to JIRA)                                                                                                                                   | `{plan-file}` - Path to implementation plan   |
| `*review-qa-security` | Apply fixes based on QA and security feedback  | When QA identifies bugs, test failures, or coverage gaps, or security audit records violations in the plan. Systematically addresses the feedback. After fixes, must run `/qa` then `*run-tests` to verify corrections                                          | **Modifies:** Source code files, test files, implementation plan Debug Log                                                                                     | None (reads QA/security feedback from plan)   |
| `*explain`            | Provide detailed explanation of implementation | When you want to learn and understand what was implemented, why certain decisions were made, and how code works. Educational tool for knowledge transfer                                                                                                        | None                                                                                                                                                           | None                                          |
| `*exit`               | Exit dev agent mode                            | When development phase is complete or switching agents                                                                                                                                                                                                          | None                                                                                                                                                           | None                                          |

**CRITICAL Dev Rules:**

- ONLY updates plan checkboxes, Dev Agent Record (Agent Model, Debug Log, Completion Notes, File List), Change Log, and Status
- NEVER modifies Requirements, Technical Approach, Acceptance Criteria, or other planning sections
- HALTS for: unapproved dependencies, ambiguous requirements, 3+ consecutive failures, missing config, failing regression tests
- Requires user confirmation before: DB migrations, building project, creating models without clear specs

---

### QA Agent Commands

**Activation (in Claude Code CLI):** `/qa`
**Agent:** Quinn - Test Architect & Implementation Specialist
**Icon:** 🧪

| Command           | Purpose                                                               | When to Use                                                                                                                                                                                                                                                    | Files Created/Modified                                                                                                                   | Parameters                                  |
| ----------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `*help`           | Display all available commands                                        | When starting QA agent or need command list                                                                                                                                                                                                                    | None                                                                                                                                     | None                                        |
| `*test-design`    | Design comprehensive test scenarios with priority levels              | **Recommended:** After plan validation, BEFORE dev starts (guides implementation and ensures testability). **Alternative:** After implementation completes. Designs test scenarios covering happy paths, edge cases, error conditions with P0-P3 priorities    | **Creates:** `bmad-docs/qa/assessments/test-design-{PLAN-ID}.md`                                                                         | `{plan-file}` - Path to implementation plan |
| `*implement-test` | Write actual test code from test scenarios                            | After `*test-design` creates scenarios. Implements tests in priority order (P0→P1→P2→P3), following project testing conventions. HALTs after each priority group for validation                                                                                | **Creates/Modifies:** Test files in project test directories (unit/integration tests). **Modifies:** Implementation plan Testing section | `{plan-file}` - Path to implementation plan |
| `*trace`          | Create requirements traceability matrix mapping requirements to tests | **ONLY after `*implement-test` completes** - requires actual test files to exist. Maps all requirements to implemented tests using Given-When-Then format, identifies coverage gaps and untested requirements. Must run before `*run-tests` to verify coverage | **Creates:** `bmad-docs/qa/assessments/trace-{PLAN-ID}.md`                                                                               | `{plan-file}` - Path to implementation plan |
| `*run-tests`      | Execute all tests (linting, unit, integration, regression)            | **CRITICAL:** ONLY use AFTER both `*test-design` AND `*implement-test` are complete. Runs full test suite and reports pass/fail status with detailed results                                                                                                   | None (displays test results)                                                                                                             | None                                        |
| `*exit`           | Exit QA agent mode                                                    | When testing phase is complete or switching agents                                                                                                                                                                                                             | None                                                                                                                                     | None                                        |

**IMPORTANT Test Workflow:**

1. **Recommended Flow:** `/qa` → `*test-design` (before dev) → `/dev` implements → `/qa` → `*implement-test` → `*trace` → `*run-tests`
2. **Alternative Flow:** `/dev` implements → `/qa` → `*test-design` → `*implement-test` → `*trace` → `*run-tests`
3. **Critical Sequence:** Must run in exact order: `*implement-test` → `*trace` → `*run-tests`
4. **Never skip:** `*trace` after test implementation - it validates coverage before running tests

**Test File Locations:**

- Unit tests: Typically alongside source files or in parallel test directory structure
- Integration tests: Dedicated integration test directory
- Follows conventions in `bmad-docs/architecture/technical-preferences.md`

---

### Quick Dev Agent Commands

**Activation (in Claude Code CLI):** `/quick-dev`
**Agent:** Alice — Quick Dev Specialist
**Icon:** ⚡

| Command               | Purpose                                                                                                                 | When to Use                                                                                                            | Files Created/Modified                                                                                                         | Parameters                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `*help`               | Display all available commands                                                                                          | When starting the quick-dev agent or when you need the command list                                                    | None                                                                                                                           | None                                                                                          |
| `*intake`             | Fetch and analyse the requirement, scan domain knowledge, and assign a Plan ID                                          | **First step.** Provide a Jira ticket key/URL, a `.md`/`.txt` file path, or plain text                                 | None (displays summary for confirmation)                                                                                       | `{ticket-or-text-or-file}` — Jira ticket ID (e.g. PROJ-123), file path, or quoted description |
| `*draft-plan`         | Create a concise, action-oriented implementation plan (max ~100 lines)                                                  | After intake is confirmed. Saves the plan and sets it as the active plan for the session                               | **Creates:** `bmad-docs/impl-plan/{PLAN-ID}-plan.md`                                                                           | None (uses active plan context from `*intake`)                                                |
| `*implement-task`     | Execute the approved implementation plan                                                                                | After the plan is explicitly approved. Will not start without approval                                                 | **Modifies:** plan file (checkboxes, Dev Agent Record, File List, Change Log). **Creates/Modifies:** source code files         | None (reads active plan file)                                                                 |
| `*test`               | Design test scenarios, implement test code, and run the test suite                                                      | After implementation. Runs test design → implement tests → execute suite in one step                                   | **Creates:** `bmad-docs/qa/assessments/test-design-{PLAN-ID}.md`. **Creates/Modifies:** test files in project test directories | None (reads active plan file)                                                                 |
| `*check-security`     | Run a security audit on the files changed during implementation                                                         | Optional, after testing. Classifies files as frontend/backend and runs the appropriate security checklist(s)           | None (read-only — findings are reported, never auto-fixed)                                                                     | None (reads File List from active plan)                                                       |
| `*review-qa-security` | Apply QA and security fixes identified in the previous steps                                                            | After `*test` and/or `*check-security` surface issues                                                                  | **Modifies:** source code files. Updates plan Deviation Record and Security Violations sections                                | None (reads active plan file)                                                                 |
| `*review`             | Review implemented code and apply practical improvements                                                                | After testing and fixes are complete. Focuses on time complexity, naming, and structure. Applies improvements directly | **Modifies:** source code files                                                                                                | None (reads active plan file)                                                                 |
| `*comment-plan`       | Post an implementation summary comment to the Jira ticket                                                               | **ONLY after all work is fully complete.** Skips automatically if the intake was not a Jira ticket                     | None (posts comment to Jira)                                                                                                   | None (reads active plan file)                                                                 |
| `*quick-flow`         | Run the full cycle — intake → plan → implement → test → security check → review → Jira post-back — as a guided sequence | When you want the entire cycle orchestrated with confirmation prompts at each stage                                    | Same as individual commands above                                                                                              | `{ticket-or-description}` — same as `*intake`                                                 |
| `*exit`               | Exit quick-dev agent mode                                                                                               | When the session is complete                                                                                           | None                                                                                                                           | None                                                                                          |

---

### Reviewer Agent Commands

**Activation (in Claude Code CLI):** `/reviewer`
**Agent:** Morgan - Code Reviewer & Optimizer
**Icon:** 🔍

| Command      | Purpose                                                                                | When to Use                                                                                                                                                                                                                                                                                                                                                                                                                                   | Files Created/Modified                                                                | Parameters                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `*help`      | Display all available commands                                                         | When starting reviewer agent or need command list                                                                                                                                                                                                                                                                                                                                                                                             | None                                                                                  | None                                                                                                              |
| `*review`    | Review code and apply practical improvements directly                                  | After dev and QA phases complete, all tests pass. **Reviewer identifies issues and applies fixes directly** without looping back to dev. Finds and applies real improvements: time complexity reduction (O(n²)→O(n)), algorithmic inefficiencies, readability issues, code structure problems. After making changes, must run `/qa` then `*run-tests` to verify improvements                                                                  | **Modifies:** Source code files with optimizations. May update plan with review notes | `{plan-or-file}` - Path to implementation plan or specific file                                                   |
| `*pr-review` | Review a GitHub PR against its requirements and write findings (never modifies source) | When a PR is open and you want it reviewed against the ticket/requirements. Evaluates the PR diff against 9 criteria (requirements coverage & business correctness, logical correctness, security & hidden bugs, performance & scalability, API & data contracts, observability, coding standards, project architecture, test adequacy) and records actionable, dev-facing findings — the dev addresses them and pushes new commits to the PR | **Creates:** `bmad-docs/reviewer/{repo}-pr{number}-review-{YYYY-MM-DD}.md`            | `{pr-url}` - GitHub PR link; `{requirements}` - JIRA ticket (key/URL) or raw requirements (text or .md/.txt path) |
| `*exit`      | Exit reviewer agent mode                                                               | When review phase is complete or done with optimizations                                                                                                                                                                                                                                                                                                                                                                                      | None                                                                                  | None                                                                                                              |

**`*review` Focus Areas (optimization mode):**

- **Time Complexity:** Reducing algorithmic complexity (e.g., nested loops → hash maps)
- **Algorithmic Efficiency:** Eliminating redundant operations, unnecessary iterations
- **Code Readability:** Improving variable names, function structure, clarity
- **Best Practices:** Ensuring adherence to project coding standards

**What `*review` AVOIDS:**

- Theoretical improvements without measurable impact
- Complex solutions (caching layers, vector embeddings, infrastructure changes)
- Over-engineering for hypothetical future requirements

**Important:** `*review` applies improvements directly to source (after changes, run `/qa` then `*run-tests` to verify). `*pr-review` is read-only — it never edits source; it writes findings to a review summary the dev acts on.

---

### Security Agent Commands

**Activation (in Claude Code CLI):** `/security`
**Agent:** Sam - Security Auditor
**Icon:** 🔒

| Command           | Purpose                                  | When to Use                                                                                                                            | Files Created/Modified                                                                | Parameters                                  |
| ----------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------- |
| `*help`           | Display all available commands           | When starting security agent or need command list                                                                                      | None                                                                                  | None                                        |
| `*check-frontend` | Audit frontend security against the plan | After QA approval. Runs the frontend security checklist on files changed during implementation                                         | **Modifies:** plan's Security Violations section (findings only — never edits source) | `{implementation-plan}` - Path to plan file |
| `*check-backend`  | Audit backend security against the plan  | After QA approval. Checks authorization coverage, role/permission correctness, auth pipeline and context integrity, audit completeness | **Modifies:** plan's Security Violations section (findings only — never edits source) | `{implementation-plan}` - Path to plan file |
| `*exit`           | Exit security agent mode                 | When security phase is complete or switching agents                                                                                    | None                                                                                  | None                                        |

**Important:** Security never modifies code. Violations land in the plan — fix them with `/dev` then `*review-qa-security`, and re-run both checks until clean.

---

### Domain Expert Agent Commands

**Activation (in Claude Code CLI):** `/domain-expert`
**Agent:** Sage - Project Knowledge Oracle
**Icon:** 🧠

| Command    | Purpose                                                                | When to Use                                                                                                              | Files Created/Modified                      | Parameters                                 |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------ |
| `*help`    | Display all available commands                                         | When starting domain expert agent or need command list                                                                   | None                                        | None                                       |
| `*ask`     | Answer a question from loaded domain-knowledge and architecture docs   | Anytime, during any workflow. Answers cite the source document; knowledge gaps are stated instead of guessed             | None                                        | `{question}` - Question in quotes          |
| `*explain` | Thorough explanation of a topic, component, API, workflow, or concept  | When you need depth on one area. Answers only from loaded docs; offers codebase scan only with permission                | None                                        | `{topic}` - Topic in quotes                |
| `*decide`  | Recommend a technical/architectural decision based on project patterns | When choosing between approaches. Analyzes the scenario against documented conventions and recommends with reasoning     | None                                        | `{scenario}` - Decision scenario in quotes |
| `*onboard` | Guided project onboarding for new developers                           | When a new developer joins. Walks through overview, tech stack, architecture, structure, workflow, coding standards, Q&A | None                                        | None                                       |
| `*search`  | Search all loaded documentation for a term or concept                  | When you need every mention of a keyword across the loaded docs, with context                                            | None                                        | `{term}` - Search term                     |
| `*status`  | Show which documentation files are currently loaded                    | To verify what knowledge Sage is answering from, and the configured architecture URL                                     | None                                        | None                                       |
| `*reload`  | Re-fetch all domain knowledge pages fresh from Confluence              | After Confluence documentation updates. **WARNING:** deletes and replaces `bmad-docs/domain-knowledge/`                  | **Replaces:** `bmad-docs/domain-knowledge/` | None                                       |
| `*exit`    | Exit domain expert agent mode                                          | When done querying project knowledge                                                                                     | None                                        | None                                       |

---

### User-Level Commands

These commands are not tied to any agent — run them anytime in Claude Code CLI.

| Command                              | Purpose                                                                                           | When to Use                                                                                  | Parameters                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `/BMad:caveman <intensity>`          | Activate caveman mode to reduce conversational output tokens without losing technical correctness | When you need token-efficient output — choose an intensity level. Revert with "stop caveman" | `lite` / `full` / `ultra` / `wenyan-lite` / `wenyan-full` / `wenyan-ultra` — intensity |
| `/BMad:caveman-compress <file-path>` | Compress a target file into caveman format (backup saved as `<file>.original.md`)                 | When you need to compress a specific file to save input tokens                               | `<file-path>` — path to the target file                                                |

---

### BMAD Logs

When a plan reaches **Ready for Review** or **Ready for Done**, a background hook analyzes the work sessions and writes a friction report — what slowed the work down and why — to `bmad-docs/bmad-logs/{PLAN-ID}/friction.md`. Fully automatic, no commands.

---

### Architecture Conflict Detection

During planning, the planner (and quick-dev's planning phase) checks the proposed direction against the architecture docs in `bmad-docs/architecture/` — tech stack, coding standards, project structure. If a conflict is found, you're asked whether it's a **deliberate architecture change** (Confluence is updated first, then local docs re-synced) or the plan should **align with current docs** (planning halts until the direction is revised). Fully automatic, no commands.

---

### File Creation Summary

Everything lands under `bmad-docs/` (git-ignored, per developer):

```
bmad-docs/
├── impl-plan/                  # Implementation plans (planner, quick-dev)
├── temporary/                  # Dependency analysis, temporary (planner)
├── architecture/               # Coding standards, tech stack, project structure — fetched from Confluence
├── domain-knowledge/           # Domain docs — fetched from Confluence (domain expert)
├── qa/assessments/             # test-design-{PLAN-ID}.md, trace-{PLAN-ID}.md (qa)
├── reviewer/                   # PR review findings (*pr-review)
├── bmad-logs/                  # Friction reports per plan (automatic)
├── memory/                     # Session memory (hooks)
├── cache/jira/                 # Downloaded ticket attachments
└── .bmad-tokens/.env           # JIRA API credentials
```

Dev modifies the plan (checkboxes, Dev Agent Record, Change Log) and project source/test files. Reviewer `*review` modifies source directly. QA also writes test files into the project's test directories.

**Key configuration:** `.bmad-core/core-config.yaml`

---

## Tips for Success

1. **Trust the workflow** - Each phase builds on the previous one
2. **Use must-use commands** - They're required for a reason
3. **Don't skip validation** - Catching issues early saves time
4. **Keep JIRA updated** - Use `*comment-plan` ONCE when ticket is fully complete
5. **Ask for help** - Every agent has a `*help` command
6. **Iterate when needed** - Use refine-plan, review-qa-security as needed
7. **Run all tests** - Including regression before marking done
8. **Document changes** - File List and Change Log matter
9. **Review before completion** - Final review catches optimizations
10. **Follow agent guidance** - Agents HALT when user input is needed
11. **Choose the right workflow** - Quick Dev for small tasks, the full four-agent workflow for anything complex

---

## Getting Started Checklist

- [ ] Complete BMad-Stella installation (see Installation section above)
- [ ] Authenticate Atlassian MCP server with `/mcp` command
- [ ] Verify JIRA access and permissions
- [ ] Confirm architecture docs loaded successfully
- [ ] Review project architecture docs location in core-config.yaml
- [ ] Understand your project's testing conventions
- [ ] Open your project in Claude Code CLI
- [ ] Start with `/planner` command for your first task (or `/quick-dev` for small tasks)
- [ ] Follow the workflow: planner → dev → qa → reviewer (or `*quick-flow` for small tasks)
- [ ] Use must-use commands for each phase
- [ ] Run all tests before marking complete
- [ ] Review code for optimizations
- [ ] Post final summary to JIRA with `*comment-plan` when ticket is complete
- [ ] Mark ticket as done

---

## Support and Resources

- **Installation Issues:** See Installation and Troubleshooting sections
- **MCP Authentication:** Use `/mcp` command in Claude Code CLI to authenticate or re-authenticate
- **Agent Commands:** Use `*help` in any agent mode to see available commands
- **Workflow Guidance:** Reference this guide when unsure of next steps
- **Decision Making:** Check agent persona sections for decision-making principles
- **Visual Reference:** Review mermaid diagram for workflow visualization
- **File Templates:** Consult implementation plan template for expected structure

---

**Remember:** Stella works best when you follow the structured workflow. Start with planning, develop systematically, test comprehensively, and review critically. Each phase ensures quality and reduces rework.

Happy coding with Stella!
