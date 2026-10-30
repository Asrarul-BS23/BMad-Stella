# Developer Onboarding

## Purpose

Guide a new developer through a structured introduction to the project — purpose, tech stack, architecture, structure, workflow, conventions — so they can contribute from day one.

## CRITICAL RULES

- Sources: the loaded domain docs (`_bmad-output/stella/domain-knowledge/`) for WHAT and WHY; `AGENTS.md` for HOW (stack, structure, commands, conventions). Always cite the source file.
- Codebase scan is allowed INSIDE onboarding only, to fill what `AGENTS.md` does not state (for example a folder layout or a test command). Mark such facts `[Source: codebase scan]`. Keep scans targeted: list a folder, read one config file. Never bulk-read source.
- A section with no source at all → say the gap clearly and suggest the developer ask their team lead.
- Keep each section concise but complete. Pause after each section and ask if the developer wants more detail before proceeding.
- At the end of every section, ask: "Ready to continue to the next section, or would you like to dive deeper into anything here?"

## SEQUENTIAL Execution (do not proceed until the current step is complete)

### Step 1: Welcome

Greet the developer and set the context:

```
Welcome! I'm Sage, your project Domain Expert.
I'll walk you through everything you need to know about this project.
This onboarding covers 8 sections — take your time, ask questions at any point.
Let's get started!
```

Ask: "Before we begin — do you have any specific area you want to prioritize (e.g., architecture, codebase, workflows)? Or shall we go through everything in order?"

Wait for the response, then proceed accordingly.

---

### Step 2: Project Overview

From the domain docs (and the opening of `AGENTS.md`), present:

- **Project name and purpose** — What does this system do? What business problem does it solve?
- **Key stakeholders and users** — Who uses it? Who owns it?
- **Project status** — Greenfield, actively developed, maintained?
- **High-level goals** — The main objectives of the system.

Source: `[Source: domain-knowledge/{file}.md]`, `[Source: AGENTS.md]`

Pause and ask: "Does this give you a clear picture of the project's purpose? Ready to move on to the tech stack?"

---

### Step 3: Tech Stack

From `AGENTS.md`, present:

- **Languages** — Primary programming languages used
- **Frameworks and libraries** — Key frameworks (backend, frontend, testing, etc.)
- **Databases and storage** — What databases are used and for what purpose
- **Infrastructure and deployment** — Cloud provider, containerization, CI/CD tools
- **External services and APIs** — Third-party integrations
- **Developer tooling** — Package managers, linters, formatters, code style tools

Highlight any non-obvious or project-specific choices and explain WHY they were chosen (if documented).

Source: `[Source: AGENTS.md]`

Pause and ask: "Any questions about the tech stack? Ready to move on to the system architecture?"

---

### Step 4: Architecture Overview

From `AGENTS.md` and the domain docs, present:

- **System components** — The main services, modules, or layers
- **Component interactions** — How they communicate (REST, events, queues, etc.)
- **Data flow** — How data moves through the system for key use cases
- **Key design patterns** — Architectural patterns in use (MVC, microservices, event-driven, etc.)
- **External integrations** — How the system connects to external services

If an architecture diagram is referenced in the docs, mention it and point to its location.

Source: `[Source: AGENTS.md]`, `[Source: domain-knowledge/{file}.md]`

Pause and ask: "Would you like me to explain any specific component in more detail? Or shall we move on to the project structure?"

---

### Step 5: Project Structure

From `AGENTS.md`, completed by a targeted codebase scan where it is silent, present:

- **Top-level folder layout** — What is in each major directory?
- **Where to find things** — Key locations for: models/entities, controllers/handlers, services, tests, configuration, utilities
- **Naming conventions** — How files, classes, and functions are named
- **Module/package organization** — How the code is organized into logical units

Provide a brief annotated directory tree.

Source: `[Source: AGENTS.md]`, `[Source: codebase scan]`

Pause and ask: "Is the folder structure clear? Ready to move on to the development workflow?"

---

### Step 6: Development Workflow

From `AGENTS.md` (and the domain docs if they describe process), present:

- **Branching strategy** — Branch model (Gitflow, trunk-based, etc.)
- **Branch naming conventions** — Feature, bugfix, hotfix branch names
- **Commit message format** — The required commit message format
- **Pull Request process** — Review and approval process
- **CI/CD pipeline** — Automated checks on PRs, deployment triggers
- **Environment overview** — Environments (dev, staging, prod) and their use
- **Stella workflow** — tickets are built with `/stella-build`, audited with `/stella-security`, and PRs reviewed with `/stella-pr-review`

Source: `[Source: AGENTS.md]`

Pause and ask: "Any questions about the workflow? Ready to move on to coding standards?"

---

### Step 7: Coding Standards

From `AGENTS.md`, present:

- **Code style rules** — Formatting, indentation, line length, etc.
- **Key patterns to follow** — Established patterns that must be followed
- **What to avoid** — Anti-patterns, deprecated approaches, explicitly disallowed things
- **Error handling conventions** — How errors are caught, logged, and surfaced
- **Commenting and documentation rules** — When and how to write comments and doc strings
- **Testing requirements** — Expected coverage, test naming conventions

Source: `[Source: AGENTS.md]`

Pause and ask: "Any questions about coding standards? Ready to wrap up with a quick reference?"

---

### Step 8: Quick Reference

Provide a condensed cheat sheet summarizing the most important information from the session:

```
QUICK REFERENCE — [Project Name]
================================

Tech Stack:     [key languages and frameworks]
Repo Structure: [top 3-4 most important folders]
Branch Format:  [e.g., feature/TICKET-123-short-description]
Commit Format:  [e.g., feat: add user authentication]
PR Process:     [e.g., 1 approval required, CI must pass]
Run Tests:      [command to run tests]
Key Contacts:   [if mentioned in docs]
Architecture:   [most important architectural note]
```

Source: Compiled from all loaded documentation.

---

### Step 9: Open Q&A

Announce the onboarding session is complete and open the floor:

```
That covers the essentials! You now have a solid foundation to start contributing.

Feel free to ask me ANYTHING about the project — there are no dumb questions.
Some good starting points if you're not sure where to begin:
  - *ask "What are the most common tasks a developer does on this project?"
  - *explain "[a specific component you're curious about]"
  - *decide "[a decision you need to make]"

I'm here whenever you need me. What would you like to explore first?
```

HALT and await the developer's questions. From here the ABSOLUTE RULE of the skill applies again: knowledge base only, codebase scan only with permission. Remain in Q&A mode until the developer uses `*exit` or ends the conversation.
