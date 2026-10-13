<!-- Powered by Stella AI Team -->

# Backend Security Checklist

Execute this checklist against the backend files listed in the implementation plan's Dev Agent Record → File List.

[[LLM: INITIALIZATION INSTRUCTIONS - BACKEND SECURITY AUDIT

You are auditing backend files scoped to an implementation plan. Mark each item [PASS], [FAIL], or [N/A].

- [PASS] only after reading the code and confirming the condition is met — never assume
- [FAIL] requires: file path, line number, exact offending snippet, severity (CRITICAL / HIGH / MEDIUM / LOW), and required fix
- [N/A] requires a one-sentence reason why the item structurally cannot apply to the scoped files — do not use N/A to avoid difficult checks

Work through each section in order. No item may be left unevaluated.]]

## 1. AUTHORIZATION COVERAGE

[[LLM: Check every endpoint, handler, and CQRS request declaration in scope. Look for an explicit permission or role gate — not just an authentication marker with no role or permission attached.]]

- [ ] Every endpoint and handler has an explicit permission or role check — authentication-only (e.g., `[Authorize]` with no role/permission) does not satisfy this for privileged operations.
- [ ] No endpoint or handler has its authorization attribute commented out.
- [ ] Every intentionally public endpoint has an explicit anonymous-access marker with a documented reason — no silent unauthenticated access.
- [ ] No CQRS handler or equivalent request object performing a privileged operation is missing a permission or role attribute — absence of an attribute must not mean open access.

---

## 2. ROLE & PERMISSION CORRECTNESS

[[LLM: For each auth attribute in scope, verify the permission or role value exists in the project's registry, enum, or role store. Evaluate AND vs. OR logic and ownership enforcement against the operation type.]]

- [ ] Privileged role checks use a strongly-typed value, enum constant, or explicit policy name — not substring or naming convention matching (e.g., `role.Contains("Admin")`).
- [ ] Read operations accessing other users' records require a broader or distinct permission from write operations on own records.
- [ ] Write, update, and delete operations on user-owned resources enforce ownership verification in addition to the permission check.
- [ ] AND vs. OR logic in multi-permission combinations matches the business rule — OR where any single permission suffices, AND where all are required.
- [ ] Every permission or role value referenced in the scoped files exists in the project's permission registry, enum, or role store.

---

## 3. AUTH PIPELINE INTEGRITY

[[LLM: Trace the auth execution path for each handler in scope. Check for direct service or repository calls that bypass the auth gate, multiple auth systems, and how auth exceptions are mapped in the global error handler.]]

- [ ] Every execution path to sensitive business logic or data access passes through the centralized auth gate — no direct service or repository call bypasses it.
- [ ] If multiple auth systems coexist, both read from the same permission source and evaluate permissions with identical logic — a permission granted in one system is not denied in another.
- [ ] Authorization failures return HTTP 403 Forbidden — they are not caught by a generic exception handler and surfaced as HTTP 500.

---

## 4. AUTH CONTEXT INTEGRITY

[[LLM: Inspect all code in scope that extracts user identity, roles, or permissions from a token, session, or header. Check for null/missing-value guards and for session or token invalidation logic.]]

- [ ] Every auth context value extracted from a token, session, or header (user ID, tenant ID, role, etc.) is guarded against null or missing values — a missing value must fail authorization, not silently default to zero, empty, or anonymous.
- [ ] Permission and role changes are reflected within a bounded session window — the auth context (token, session, or cache) has an explicit expiry or invalidation mechanism and does not persist stale access indefinitely.

---

## Final Assessment

[[LLM: FINAL SECURITY AUDIT SUMMARY

After completing all checklist items:

1. Count totals: PASS, FAIL, N/A across all 4 sections
2. List every FAIL grouped by section with severity, location, and required fix
3. State the highest severity level found (CRITICAL / HIGH / MEDIUM / LOW / NONE)
4. Confirm: "All checklist items evaluated. No item skipped."
5. Do not write to the plan file — the task will handle that

Every PASS must be based on having read the code, not assumed.]]

- [ ] I, the Security Agent, confirm that every checklist item above has been evaluated against the scoped files, no item has been silently skipped, and every FAIL includes an exact file:line location and severity classification.
