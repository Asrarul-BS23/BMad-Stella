<!-- Powered by Stella Development Team -->

# implement-test

Implement unit and integration tests from test design scenarios. Execute test scenarios in priority order, validate coverage, and update task documentation. If a scenario is marked as E2E, do not implement it and record it as out of scope in the Test Summary.

## Inputs

```yaml
required:
  - test_design_path: '{qa.qaLocation}/assessments/{{ticket_number}}-*-test-design-{YYYYMMDD}.md'
  - task_path: 'docs/impl-plan/{{ticket_number}}-*.md'
  - project_root: '{root from core-config.yaml}'
```

## Purpose

Convert test design scenarios into executable test code. Implement tests following priority order and ensure all acceptance criteria have working test coverage.

## Dependencies

```yaml
data:
  - technical-preferences.md # Project testing framework and patterns
config:
  - core-config.yaml # Project paths and test command
```

## Process

### 1. Load Test Design

Read the test design document at `test_design_path`:

- Extract all test scenarios from the "Test Scenarios by Acceptance Criteria" section
- Note the test level (unit/integration) for each scenario
- Identify P0 tests - these MUST be implemented first
- Record which ACs each test covers

### 2. Identify Test Framework

Read `technical-preferences.md` to determine:

- Testing framework (Jest, Pytest, RSpec, etc.)
- Test file naming convention
- Test file location pattern
- Assertion library in use
- Mock/stub patterns used in project

### 3. Implement Tests by Priority

For each test scenario in **priority order** per Critical Rule #1:

#### A. Locate or Create Test File

**Unit tests:**

- Follow project convention (e.g., `*.test.ts`, `*_test.py`, `*_spec.rb`)
- Place adjacent to source file OR in mirror `tests/` directory per project standard
- If test file exists, append new test cases
- If new, create with proper imports and setup blocks

**Integration tests:**

- Use integration test directory from project structure
- Group by feature/module if project does so
- Include necessary test fixtures and setup

#### B. Write Test Implementation

For each test scenario, write ONE test case:

1. **Test name**: Use exact scenario ID (e.g., `test('1.3-UNIT-001: Validate input format', ...)`)

2. **Structure**: Given-When-Then format (setup → execute → assert)

3. **Style**: Match project's existing test patterns (mocking, assertions, helpers)

#### C. Execute and Validate

After implementing each test:

1. Run the specific test file
2. If file-level test execution is not supported, run the smallest valid test scope available per project configuration.
3. Verify the test PASSES
4. If test FAILS:
   - Debug the test implementation (NOT the source code)
   - Verify test data matches scenario requirements
   - Check assertions match expected behavior
   - Only if source code has a bug, note it in "Debug Log" section of task and continue

DO NOT proceed to the next test until the current test passes OR the failure is documented in "Debug Log" as a source code bug.

### 4. Update Task File

Add to the task file's "Testing" section:

```markdown
## Testing

### Implemented Tests

Test design: `{relative path to test design doc}`

Implemented: {date}

**Test Summary:**

- Unit tests: {count} (Files: {list test files})
- Integration tests: {count} (Files: {list test files})
- All P0 tests: ✓ PASSING
- Test design scenarios: {total}
- Implemented scenarios: {total}
- Passing tests: {total}
- Coverage: {percentage}% of ACs

**Coverage:**

- AC1: {test IDs}
- AC2: {test IDs}
- [list all ACs with their test IDs]

**Execution:**
Run tests: `{test command from core-config}`
```

## Outputs

### Output 1: Test Files

**Created/Updated Files:**

- Unit test files in project test directory
- Integration test files in project test directory
- Test fixtures/helpers if needed

**Naming Convention:**
Follow project standard from `technical-preferences.md`

### Output 2: Execution Report

Print to console:

```text
TEST IMPLEMENTATION COMPLETE
==============================
Task: {ticket_number}-{ticket_title_short}
Test Design: {filename}

Tests Implemented:
  Unit:        {count} tests in {file count} files
  Integration: {count} tests in {file count} files

Priority Breakdown:
  P0: {count} ✓
  P1: {count} ✓
  P2: {count} ✓

Execution Results:
  ✓ All tests passing
  ✓ All ACs covered

Run tests: {test command}
```

## Validation Checklist

Before marking complete:

- [ ] All P0 tests implemented and passing
- [ ] All P1 and P2 tests implemented and passing or documented as bug
- [ ] Test IDs match test design document exactly
- [ ] Every AC has at least one test
- [ ] Test count matches test design document totals
- [ ] Full test suite passes (no regressions)
- [ ] Test files follow project naming conventions
- [ ] Task "Testing" section updated / added
- [ ] No tests marked as `.skip()` or `.todo()` (unless documented as bugs in Debug Log)

## Critical Rules

1. **Implement in priority order**: P0 first, then P1, then P2, then P3. Stop if P0 tests fail.

2. **One scenario = one test**: Each scenario ID in test design gets exactly one test case.

3. **Test scope:** Implement only scenarios from test design - no additional test cases.

4. **Test files only**: Do NOT modify source code unless fixing a legitimate bug found during testing.
