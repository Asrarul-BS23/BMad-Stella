<!-- Powered by Stella Development Team -->

# Review Code Task

## Purpose

Review code quality and performance after dev agent completes implementation. Identify issues, suggest improvements, and provide actionable recommendations.

## Task Execution

### 1. Identify Files to Review

**If input is a story/implementation plan:**
- Read the story file
- Extract files from "Dev Agent Record" → "File List" section

**If input is specific file(s):**
- Use the provided file paths

### 2. Review Code Quality

For each file, analyze:

**Standards & Best Practices:**
- Naming conventions
- Code structure and organization
- SOLID principles adherence
- DRY (no code duplication)
- KISS (keep it simple)
- Proper error handling

**Security:**
- SQL injection risks
- XSS vulnerabilities
- Authentication/authorization issues
- Sensitive data exposure
- Input validation

**Maintainability:**
- Code readability
- Proper comments
- Technical debt
- Test coverage

### 3. Identify Performance Issues

**Common bottlenecks:**
- O(n²) algorithms
- N+1 database queries
- Missing indexes
- Inefficient loops
- Large payloads
- Missing caching

### 4. Categorize Issues

**CRITICAL:** Security vulnerabilities, crashes, data corruption
**HIGH:** Performance bottlenecks, major violations
**MEDIUM:** Maintainability issues, refactoring needs
**LOW:** Minor improvements, style issues

For each issue provide:
- **Location:** file:line
- **Issue:** What's wrong
- **Impact:** Why it matters
- **Fix:** How to resolve
- **Example:** Before/after code (if helpful)

### 5. Generate Report

Use template `{root}/templates/review-report-tmpl.yaml`

Save to: `docs/code-review/{ticket-or-file}-review.md`

Include:
- Overall assessment (Excellent/Good/Fair/Needs Improvement)
- Issue counts by priority
- Top 3 critical issues
- Top 3 optimization opportunities
- Actionable recommendations

### 6. Update Story File (if applicable)

Add "Code Review Results" section:

```markdown
## Code Review Results

**Review Date:** {date}
**Overall Assessment:** {rating}
**Issues Found:** CRITICAL: {n}, HIGH: {n}, MEDIUM: {n}, LOW: {n}

**Key Findings:**
1. {Finding 1}
2. {Finding 2}
3. {Finding 3}

**Report:** docs/code-review/{ticket}-review.md
```

### 7. Present Summary

Show user:
- Files reviewed
- Overall assessment
- Critical issues (if any)
- Top optimizations
- Report location

HALT and await user for next steps.
