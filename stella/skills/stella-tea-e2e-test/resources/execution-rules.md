# Shared Execution Rules

Loaded by `steps-c/step-06-execute.md` (QA flow) and `steps-dev/step-03-execute-triage.md` (dev flow). Both flows execute under these rules; neither flow may override them.

## 1. Execution Integrity Rule (Master Rule)

A test case receives a verdict status (`Pass`, `Fail`, `Partly Pass`) **only if every one of its steps was actually driven through Playwright MCP in this run**. Anything not performed is `Not Run`.

- 🚫 Never claim a result from reading the code.
- 🚫 Never infer a result from a similar case that did run.
- 🚫 Never mark a case from a previous run's outcome.
- 🚫 If Playwright MCP is unavailable or disconnects mid-run, every unfinished case is `Not Run` — stop and tell the user; do not continue "from memory".
- 🚫 Never suggest writing automation code or an `automate` handoff — in any flow, at any step, including after the report. Automation code writing is not part of the QA or dev flow.

Fabricating or inferring a status is the single worst failure of this workflow. When unsure whether a step truly executed, the status is `Not Run`.

## 2. Status Definitions

| Status        | Meaning                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Pass`        | Every step executed and every expected result observed.                                                                             |
| `Fail`        | None of the case's **expected results** was met. Setup and navigation steps passing does not split the verdict.                     |
| `Partly Pass` | Some of the case's **expected results** were observed and others were not. Record per-step results.                                 |
| `Blocked`     | A precondition or environment failure prevented the case from being attempted properly (login broken, env down, missing seed data). |
| `Not Run`     | The case was never attempted in this run.                                                                                           |

Boundary rules, applied exactly:

- Precondition/environment failure = `Blocked`. Never attempted = `Not Run`. App misbehaves during steps = `Fail` or `Partly Pass`.
- The verdict splits on **expected results**, never on steps as such: a case whose only expected result is missed is `Fail`, no matter how many preparatory steps "worked".
- `Partly Pass` and `Fail` cases record **per-step results**: each step's action, expected, and observed outcome.

## 3. Blocked Cascade

When a `Blocked` case blocks dependent later cases, do not silently skip them. Ask the user one question:

> "Case `TC-{key}-{n}` is Blocked ({reason}), and cases {list} depend on it. Resolve/remove the blocker, or skip the dependents as Not Run?"

Halt until they answer. Skipped dependents are `Not Run` with a comment naming the blocking case.

## 4. Evidence Capture

- Screenshots are taken **only** for `Fail` and `Partly Pass` cases. Passing cases produce no screenshot.
- Path: `{test_artifacts}/stella/{key}/evidence/{datetime}/tc-{n}.png`, where `{datetime}` is this run's `YYYY-MM-DD-HHmm` stamp and `{n}` is the final sequence number of the case ID (`TC-{key}-{n}`), without leading zeros.
- When one case yields several step-level screenshots (Partly Pass detail), name them `tc-{n}-step-{m}.png`. With viewports, the viewport comes before the step: `tc-{n}-{viewport}-step-{m}.png`.
- Every `Fail` / `Partly Pass` case carries in the report: steps to reproduce, screenshot evidence links, and expected vs actual.

## 5. Login and Credentials

- Test cases address users by role: "login as admin", "as customer". Resolve the role through `{workflow.environments.{environment}.users.{role}}` from the merged workflow block.
- Password resolution order: `{project-root}/_bmad/custom/stella-tea-testing.secrets.env` (key named by the user's `password_env`) → OS environment variable of the same name → ask the user.
- 🚫 Never write a credential value into any file under `{test_artifacts}` or into any report, brief, or checkpoint. Output folders are deliverables that get shared.
- Set authenticated users up **before** the test body of a case, not as an in-body improvisation.

## 6. Config Ask-Fallback

When any value a run needs is missing from config (environment, base URL, user, password), **ask the user instead of failing**, then offer to save the non-secret answer back to `{project-root}/_bmad/custom/stella-tea-testing.user.toml` (create it from `{skill-root}/config/stella-tea-testing.user.toml.example` when absent). Secrets are offered into `stella-tea-testing.secrets.env` (from its `.example`) — never into TOML. A wiped `_bmad/custom/` self-heals this way on the next run.

## 7. Viewports and Devices (On Request Only)

- Default: one desktop browser on the user's machine. Nothing runs beyond desktop unless the user names viewports or devices for this run.
- When named: use Playwright MCP resize for viewport sizes (e.g. `desktop-1920` = 1920×1080, `tablet-768` = 768×1024, `mobile-390` = 390×844) and Playwright device descriptors (viewport + user agent + touch; WebKit approximates iOS Safari) for mobile web.
- Each case then reports a status **per combination**, and evidence filenames gain the combination: `tc-{n}-{viewport}.png`, or `tc-{n}-{viewport}-step-{m}.png` for step-level shots (viewport before step, always).

## 8. Run Order and Reporting Duty

- Execute cases one by one, in file order, top to bottom. Announce each case ID and title before driving it.
- The locked `test-cases.md` is **never modified by a run**. All results go into the timestamped report.
- Every run report ends with the count summary line: `Pass x, Fail y, Partly Pass z, Blocked b, Not Run n` — counts must sum to the total number of cases (times combinations when viewports were requested).
