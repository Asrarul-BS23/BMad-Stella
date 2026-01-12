<!-- Powered by Stella Development Team -->

# Optimize Code Task

## Purpose

Analyze code for performance optimization opportunities and provide specific recommendations with expected impact.

## Task Execution

### 1. Load Files

Extract files to analyze (from story or specific paths provided).

### 2. Identify Performance Issues

**Algorithm Complexity:**
- O(n²) or worse algorithms
- Nested loops
- Inefficient sorting/searching

**Database:**
- N+1 query problems
- Missing indexes
- Large queries without pagination

**Memory:**
- Memory leaks
- Large allocations
- Inefficient data structures

**Network:**
- Sequential API calls (should be parallel)
- Large payloads
- Missing caching

**Frontend (if applicable):**
- Unnecessary re-renders
- Large bundle sizes
- Missing lazy loading

### 3. Suggest Optimizations

For each optimization:
- **Location:** file:line
- **Issue:** Current performance problem
- **Impact:** Expected improvement (%)
- **Effort:** High/Medium/Low
- **Fix:** Specific optimization approach
- **Example:** Before/after code

### 4. Prioritize

**CRITICAL:** >50% improvement, affects all users
**HIGH:** 20-50% improvement, significant impact
**MEDIUM:** 5-20% improvement
**LOW:** <5% improvement

### 5. Generate Report

Save to: `docs/code-review/{ticket-or-file}-optimization.md`

Include:
- Potential performance gain
- Optimization count by priority
- Top 3 high-impact optimizations
- Implementation recommendations

### 6. Present Summary

Show user:
- Files analyzed
- Potential improvement percentage
- Top optimizations
- Report location

HALT for user decision.
