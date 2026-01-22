# 🔍 Code Reviewer & Optimizer Agent - ULTRA SIMPLE

**Agent:** Morgan (reviewer)
**Status:** ✅ Ready to Use
**Philosophy:** Direct action, no reports, just improvements!

---

## Files

1. **`bmad-core/agents/reviewer.md`** - Agent definition
2. **`bmad-core/tasks/review-and-improve.md`** - Review and apply improvements

**That's it! Only 2 files.**

---

## Commands

```bash
*help       # Show commands
*review     # Review and improve code
*exit       # Exit agent
```

---

## Usage

```bash
@reviewer
*review bmad-docs/impl-plan/PROJ-123-feature.md
```

---

## What It Does

**Simple workflow:**

1. Load files
2. Find improvements (time complexity, code quality)
3. Show improvement with before/after code
4. Ask user: "Apply this? (yes/no)"
5. Apply if yes, skip if no
6. Done!

**Focuses on:**

- ✅ Reducing time complexity (O(n²) → O(n))
- ✅ Using better data structures (Map/Set)
- ✅ Removing duplicate code
- ✅ Batching database queries
- ✅ Fixing variable names
- ✅ Adding error handling

**Avoids:**

- ❌ Caching layers
- ❌ Vector embeddings
- ❌ Infrastructure changes
- ❌ Complex reports

---

**Direct. Practical. Gets shit done!** 🚀
