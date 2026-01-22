<!-- Powered by Stella Development Team -->

# Task Definition of Done (DoD) Checklist

## Instructions for Developer Agent

Before marking an implementation plan as 'Under Review', please go through each item in this checklist. Report the status of each item (e.g., [x] Done, [ ] Not Done, [N/A] Not Applicable) and provide brief comments if necessary.

[[LLM: INITIALIZATION INSTRUCTIONS - TASK DOD VALIDATION

This checklist is for DEVELOPER AGENTS to self-validate their work before marking an implementation plan complete.

IMPORTANT: This is a self-assessment. Be honest about what's actually done vs what should be done. It's better to identify issues now than have them found in review.

EXECUTION APPROACH:

1. Go through each section systematically
2. Mark items as [x] Done, [ ] Not Done, or [N/A] Not Applicable
3. Add brief comments explaining any [ ] or [N/A] items
4. Be specific about what was actually implemented
5. Flag any concerns or technical debt created

The goal is quality delivery, not just checking boxes.]]

## Checklist Items

1. **Requirements Met:**

   [[LLM: Be specific - list each requirement and whether it's complete]]
   - [ ] All functional requirements specified in the implementation plan are implemented.
   - [ ] All acceptance criteria defined in the plan are met.

2. **Coding Standards & Project Structure:**

   [[LLM: Code quality matters for maintainability. Check each item carefully]]
   - [ ] All new/modified code strictly adheres to `Operational Guidelines` from architecture docs.
   - [ ] All new/modified code aligns with `Project Structure` (file locations, naming, etc.) as specified in Technical Context / Dev Notes.
   - [ ] Adherence to `Tech Stack` for technologies/versions used (if task introduces or modifies tech usage).
   - [ ] Adherence to `Api Reference` and `Data Models` (if task involves API or data model changes) as specified in Technical Context.
   - [ ] Basic security best practices (e.g., input validation, proper error handling, no hardcoded secrets) applied for new/modified code.
   - [ ] No new linter errors or warnings introduced.
   - [ ] Code is well-commented where necessary (clarifying complex logic, not obvious statements).

3. **Testing:**

   [[LLM: Testing proves your code works. Be honest about test coverage]]
   - [ ] All required unit tests as per the plan and Testing Standards (in Technical Context / Dev Notes) are implemented.
   - [ ] All required integration tests (if applicable) as per the plan and Testing Standards are implemented.
   - [ ] All tests (unit, integration, E2E if applicable) pass successfully.
   - [ ] Test coverage meets project standards (if defined in Technical Context / Dev Notes).

4. **Functionality & Verification:**

   [[LLM: Did you actually run and test your code? Be specific about what you tested]]
   - [ ] Functionality has been manually verified by the developer (e.g., running the app locally, checking UI, testing API endpoints).
   - [ ] Edge cases and potential error conditions considered and handled gracefully.

5. **Implementation Plan Administration:**

   [[LLM: Documentation helps the next developer. What should they know?]]
   - [ ] All tasks and subtasks within the implementation plan are marked as complete [x].
   - [ ] Dev Agent Record section is fully populated:
     - [ ] Agent Model Used is documented
     - [ ] Debug Log References added (if applicable)
     - [ ] Completion Notes List is complete with relevant implementation notes
     - [ ] File List includes ALL new, modified, or deleted source files
   - [ ] Any clarifications or decisions made during development are documented in Completion Notes.
   - [ ] Change Log is properly updated with implementation completion entry.

6. **Dependencies, Build & Configuration:**

   [[LLM: Build issues block everyone. Ensure everything compiles and runs cleanly]]
   - [ ] Project builds successfully without errors.
   - [ ] Project linting passes.
   - [ ] Any new dependencies added were either listed in Dependencies and Risks section OR explicitly approved by the user during development (approval documented in Completion Notes).
   - [ ] If new dependencies were added, they are recorded in the appropriate project files (e.g., `package.json`, `requirements.txt`) with justification in Completion Notes.
   - [ ] No known security vulnerabilities introduced by newly added and approved dependencies.
   - [ ] If new environment variables or configurations were introduced by the task, they are documented in Completion Notes and handled securely.
   - [ ] All dependencies listed in "Dependencies and Risks" section have been validated and addressed.
   - [ ] All blockers identified in "Dependencies and Risks" section have been resolved or documented with mitigation.

7. **Technical Approach Adherence:**

   [[LLM: Did you follow the plan? Deviations should be justified]]
   - [ ] Implementation follows the Technical Approach specified in the plan.
   - [ ] Any deviations from the Technical Approach are documented in Completion Notes with justification.
   - [ ] File structure matches what was specified in Technical Context / Dev Notes (File Locations and Project Structure section).

8. **Documentation (If Applicable):**

   [[LLM: Good documentation prevents future confusion. What needs explaining?]]
   - [ ] Relevant inline code documentation (e.g., JSDoc, TSDoc, Python docstrings) for new public APIs or complex logic is complete.
   - [ ] User-facing documentation updated, if changes impact users.
   - [ ] Technical documentation (e.g., READMEs, system diagrams) updated if significant architectural changes were made.

## Final Confirmation

[[LLM: FINAL DOD SUMMARY

After completing the checklist:

1. Summarize what was accomplished in this implementation plan
2. List any items marked as [ ] Not Done with explanations
3. Identify any technical debt or follow-up work needed
4. Note any challenges or learnings for future implementation plans
5. Confirm whether the plan is truly ready for review

Be honest - it's better to flag issues now than have them discovered later.]]

- [ ] I, the Developer Agent, confirm that all applicable items above have been addressed.
