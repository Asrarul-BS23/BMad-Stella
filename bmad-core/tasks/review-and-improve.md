<!-- Powered by Stella Development Team -->

# Review and Improve Code Task

## Purpose

Review code and apply practical improvements directly. Focus on reducing time complexity, fixing inefficiencies, and improving code quality. No reports, just action.

## Task Execution

### 1. Load Files

**If story file:** Extract files from "Dev Agent Record" → "File List"
**If specific files:** Use provided paths

### 2. Review Each File

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
