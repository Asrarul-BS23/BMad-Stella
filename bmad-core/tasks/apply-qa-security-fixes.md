<!-- Powered by Stella AI Team -->

# apply-qa-security-fixes

Implement fixes based on QA results (gate and assessments) and security violations for a specific story/feature. This task is for the Dev agent to systematically consume QA outputs and security violations, then apply code/test changes while only updating allowed sections in the story and plan files.

## Purpose

- Read QA outputs for a plan (gate YAML + assessment markdowns)
- Read security violations from the implementation plan file
- Create a prioritized, deterministic fix plan
- Apply code and test changes to close gaps and address issues
- Update only the allowed plan sections for the Dev agent

## Inputs

```yaml
required:
  - story_id: '{epic}.{story}' # e.g., "2.2"
  - qa_root: from `.bmad-core/core-config.yaml` key `qa.qaLocation` (e.g., `bmad-docs/project/qa`)
  - plan_root: from `.bmad-core/core-config.yaml` key `devStoryLocation` (e.g., `bmad-docs/impl-plan`)
  - implementation_plan: 'Path to implementation plan file — required when security fixes are present'

optional:
  - story_title: '{title}' # derive from story H1 if missing
  - story_slug: '{slug}' # derive from title (lowercase, hyphenated) if missing
```

## QA Sources to Read

- Gate (YAML): `{qa_root}/gates/{epic}.{story}-*.yml`
  - If multiple, use the most recent by modified time
- Assessments (Markdown):
  - Test Design: `{qa_root}/assessments/{ticket_number}-*-test-design-*.md`
  - Traceability: `{qa_root}/assessments/{ticket_number}-*-trace-*.md`
  - Risk Profile: `{qa_root}/assessments/{ticket_number}-*-risk-*.md`
  - NFR Assessment: `{qa_root}/assessments/{ticket_number}-*-nfr-*.md`

## Security Violation Source

- `{implementation_plan}` → `## Security Violations` section
- Only process entries with `- [ ]`; skip `- [x]` (already resolved)
- If `implementation_plan` not provided or section absent, skip all security steps

## Prerequisites

- Repository builds and tests run locally (Deno 2)
- Lint and test commands available:
  - `deno lint`
  - `deno test -A`

## Process (Do not skip steps)

### 0) Load Core Config & Locate Plan

- Read `.bmad-core/core-config.yaml` and resolve `qa_root` and `plan_root`
- Locate plan file in `{plan_root}/{ticket_number}-*.md`
  - HALT if missing and ask for correct plan id/path

### 1) Collect QA Findings

- Parse the latest gate YAML:
  - `gate` (PASS|CONCERNS|FAIL|WAIVED)
  - `top_issues[]` with `id`, `severity`, `finding`, `suggested_action`
  - `nfr_validation.*.status` and notes
  - `trace` coverage summary/gaps
  - `test_design.coverage_gaps[]`
  - `risk_summary.recommendations.must_fix[]` (if present)
- Read any present assessment markdowns and extract explicit gaps/recommendations

### 1b) Collect Security Violations

- Read `## Security Violations` from `{implementation_plan}`
- Extract all `- [ ]` entries; parse each into: SEVERITY, finding, `file:line`, fix action
- Group by severity: CRITICAL → HIGH → MEDIUM → LOW
- If section reads "No violations found." → skip all security fix steps

### 2) Build Deterministic Fix Plan (Priority Order)

Apply in order, highest priority first:

1. CRITICAL security violations
2. High severity `top_issues` (security/perf/reliability/maintainability) + HIGH security violations
3. NFR statuses: FAIL → CONCERNS
4. MEDIUM security violations
5. Test Design `coverage_gaps` (P0 first)
6. Trace uncovered requirements (AC-level)
7. Risk `must_fix` recommendations
8. LOW security violations, medium/low QA issues

Guidance:

- Prefer tests closing coverage gaps before/with code changes
- Keep changes minimal and targeted; follow project architecture and TS/Deno rules

### 3) Apply Changes

- Implement code fixes per plan
- Add missing tests to close coverage gaps (unit first; integration where required by AC)
- Keep imports centralized via `deps.ts` (see `bmad-docs/project/typescript-rules.md`)
- Follow DI boundaries in `src/core/di.ts` and existing patterns
- For each security violation: apply the fix at the exact `file:line` stated — do not rewrite surrounding code
- Mark the violation checkbox `[ ]` → `[x]` in the plan file immediately after each fix; do not batch
- If a fix requires an unapproved dependency or new architectural pattern → HALT and ask the user

### 4) Validate

- Run `deno lint` and fix issues
- Run `deno test -A` until all tests pass
- Run `deno lint` and `deno test -A` after all CRITICAL/HIGH fixes before proceeding to MEDIUM/LOW
- If a test fails because it asserted insecure behavior → fix the test, not the security fix
- Iterate until clean

### 5) Update Plan (Allowed Sections ONLY)

CRITICAL: Dev agent is ONLY authorized to update these sections of the plan file. Do not modify any other sections (e.g., QA Results, Plan, Acceptance Criteria, Dev Notes, Testing):

- Tasks / Subtasks Checkboxes (mark any fix subtask you added as done)
- Dev Agent Record →
  - Agent Model Used (if changed)
  - Debug Log References (commands/results, e.g., lint/tests)
  - Completion Notes List (what changed, why, how)
  - File List (all added/modified/deleted files)
- Change Log (new dated entry describing applied fixes)
- `## Security Violations` checkboxes in `{implementation_plan}` — mark `[ ]` → `[x]` only; never alter violation text, severity, location, or fix fields
- Status (see Rule below)

Status Rule:

- Gate PASS + all QA gaps closed + all CRITICAL/HIGH violations resolved → `Status: Ready for Done`
- Any CRITICAL or HIGH violation still `[ ]` → `Status: Blocked — Security`; HALT and report unresolved count
- MEDIUM/LOW unresolved → `Status: Ready for Review`; list deferred violations in Completion Notes
- Otherwise → `Status: Ready for Review`; notify QA to re-run

### 6) Do NOT Edit Gate Files

- Dev does not modify gate YAML. If fixes address issues, request QA to re-run `review-story` to update the gate

## Blocking Conditions

- Missing `.bmad-core/core-config.yaml`
- Plan file not found for `ticket_id`
- No QA artifacts found (neither gate nor assessments)
  - HALT and request QA to generate at least a gate file (or proceed only with clear developer-provided fix list)

## Completion Checklist

- deno lint: 0 problems
- deno test -A: all tests pass
- All high severity `top_issues` addressed
- NFR FAIL → resolved; CONCERNS minimized or documented
- Coverage gaps closed or explicitly documented with rationale
- All CRITICAL security violations marked `[x]` in plan file
- All HIGH security violations marked `[x]` in plan file
- MEDIUM/LOW violations resolved or deferred with rationale in Completion Notes
- Plan updated (allowed sections only) including File List and Change Log
- Status set according to Status Rule

## Example: Ticket 2.2

Given gate `bmad-docs/project/qa/gates/2.2-*.yml` shows

- `coverage_gaps`: Back action behavior untested (AC2)
- `coverage_gaps`: Centralized dependencies enforcement untested (AC4)

Fix plan:

- Add a test ensuring the Toolkit Menu "Back" action returns to Main Menu
- Add a static test verifying imports for service/view go through `deps.ts`
- Re-run lint/tests and update Dev Agent Record + File List accordingly

## Key Principles

- Deterministic, risk-first prioritization — security CRITICAL/HIGH before all QA items
- Minimal, maintainable changes
- Tests validate behavior and close gaps
- Strict adherence to allowed plan and plan update areas
- Each security violation carries its own `file:line` and fix action — apply it literally, no interpretation
- Security violation checkboxes are dev-owned; only the security agent's re-audit removes a violation from the plan
- Gate ownership remains with QA; Dev signals readiness via Status
