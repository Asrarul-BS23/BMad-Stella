<!-- Powered by Stella Development Team -->

# Review and Improve Code Task

## Purpose

Review code and apply practical improvements directly. Focus on reducing time complexity, fixing inefficiencies, and improving code quality. No reports, just action.

## Task Execution

### 1. Load Files

**Load and Read `coding-standards.md` file:** from the given location in `devLoadAlwaysFiles` of `.bmad-core/core-config.yaml` file
**If story/task file:** Extract files from "Dev Agent Record" → "File List"
**If specific files:** Use provided paths

### 2. Review Each File

_Suggest Improvements ONLY in Recently Modified or Added Code_

Use the **Code Review Guidelines & Checklist** below as the primary reference during review.

Look for:

**Time Complexity Issues:**

- O(n²) or worse algorithms → Can we make it O(n)?
- Nested loops → Can we use a Map/Set?
- Repeated calculations → Can we calculate once?
- Inefficient searching/sorting → Better algorithm?

**Code Quality:**

- Confusing variable names → Rename
- Duplicate code → Extract to function
- Long functions → Break down
- Missing error handling → Add it

**Code Standards:**

- Standards not followed → Fix to match coding-standards.md
- Missing or incorrect comments → Add/fix per commenting strategy

**Simple Performance:**

- Database queries in loops → Batch them
- Large arrays being copied → Use references
- Unnecessary iterations → Remove

### 3. For Each Improvement Found

Present to user:

```
Found improvement in {file}:{line}

Current code:
{show current code}

Issue: {explain what's wrong - e.g., "O(n²) nested loop"}

Improved code:
{show better code}

Expected benefit: {e.g., "50% faster with large datasets"}

Apply this improvement? (yes/no)
```

### 4. If User Says Yes

- Apply the improvement using Edit tool
- Show confirmation: "✅ Applied improvement to {file}:{line}"
- Continue to next improvement

### 5. If User Says No

- Skip and continue to next improvement

### 6. After All Improvements

Summary:

- Files reviewed: {count}
- Improvements found: {count}
- Improvements applied: {count}
- Improvements skipped: {count}

Done!

## Code Review Guidelines & Checklist

Use this checklist when reviewing each file. Each item marked **Required** must be verified; **Recommended** items should be flagged if clearly violated.

---

### Requirements & Functionality

| Checklist | Preference | Notes |
|---|---|---|
| Have the requirements been met? | Required | Verify the implementation matches the intended feature/fix behavior. |
| Will the new feature impact existing functionality? | Required | Check for regressions; validate via unit/integration tests if available. |

---

### Maintainability & Best Practices

| Checklist | Preference | Notes |
|---|---|---|
| Use intention-revealing, meaningful names (one word per concept) | Required | Names should clearly express purpose without needing a comment. |
| Avoid magic values — use constants or enums | Required | e.g., use `WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000` not `604800000`. |
| No repeated code (DRY principle) | Required | Extract duplicate logic into a shared function. |
| Method length: ~20–30 lines; Class length: ~100–200 lines | Required | Long methods/classes should be broken down into smaller units. |
| Relevant parameters are configurable — avoid hardcoding | Required | Use constants, config files, or enums instead of inline literal values. |
| Single Responsibility Principle followed | Required | Each function/class should do one thing and do it well. |
| Proper error handling with meaningful error messages/logs | Required | Errors must be caught, logged with context, and surfaced appropriately. |
| Meaningful comments only; no commented-out code | Required | Commented-out code must be removed. Use source control to retrieve old code. |
| Minimize nesting depth and unnecessary loops | Required | Flatten logic where possible; avoid deeply nested conditionals. |

---

### Code Formatting

| Checklist | Preference | Notes |
|---|---|---|
| Proper indentation and consistent formatting applied | Required | Use project linting tools to enforce formatting rules. |
| No unnecessary whitespace | Required | Remove trailing spaces and extra blank lines. |
| Consistent naming convention throughout (camelCase, PascalCase, snake_case) | Required | Follow the convention already established in the codebase. |
| Consistent formatting style across the entire codebase | Required | A file should look like it was written by one person. |
| Proper code alignment and readable block structure | Required | Block start/end points must be easily identifiable. |

---

### Performance

| Checklist | Preference | Notes |
|---|---|---|
| DB queries optimized — no queries inside loops | Required | Batch queries or restructure to avoid N+1 problems. |
| Loops and conditions are efficient | Required | Avoid redundant iterations and unnecessary branching. |
| Appropriate data types used | Required | Use the most suitable type for the data being stored/processed. |

---

### Testing

| Checklist | Preference | Notes |
|---|---|---|
| Unit tests cover new or modified code | Recommended | New logic should have corresponding unit test coverage. |
| Integration tests cover new feature behavior | Recommended | Feature-level behavior should be validated end-to-end. |

---

### Security

| Checklist | Preference | Notes |
|---|---|---|
| Code reviewed for common vulnerabilities (injection, XSS, unauthorized access, data leakage) | Recommended | Flag any input that reaches a DB, shell, or output without sanitization. |
| Static analysis tool used if available in the project | Recommended | Run project-configured linter/security scanner before finalizing review. |

---

## Rules

**DO suggest:**

- ✅ Better algorithms (O(n²) → O(n))
- ✅ Using Map/Set instead of nested loops
- ✅ Removing duplicate code
- ✅ Batching database queries
- ✅ Fixing variable names
- ✅ Adding error handling

**DON'T suggest:**

- ❌ Caching layers
- ❌ Vector embeddings
- ❌ Redis/persistent memory
- ❌ Infrastructure changes
- ❌ Complex architectural changes
- ❌ Advanced design patterns

**Keep it simple and practical!**
