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

When a `Blocked` case blocks dependent later cases, do not silently skip them. Ask the user one question (rendered per the interactive-questions convention in `SKILL.md` — options: resolve/remove the blocker / skip the dependents as Not Run):

> "Case `TC-{key}-{n}` is Blocked ({reason}), and cases {list} depend on it. Resolve/remove the blocker, or skip the dependents as Not Run?"

Halt until they answer. Skipped dependents are `Not Run` with a comment naming the blocking case.

## 4. Evidence Capture

- **Every executed case** (`Pass`, `Fail`, `Partly Pass`) gets at least one screenshot, taken at the moment the expected result — or its absence — is visible on screen (success message, flag, end state). The screenshot is visible proof that the case was truly driven, backing the §1 integrity rule. `Blocked` and `Not Run` cases get no screenshot — nothing was executed.
- Path: `{test_artifacts}/stella/{key}/evidence/{datetime}/tc-{n}.png`, where `{datetime}` is this run's `YYYY-MM-DD-HHmm` stamp and `{n}` is the final sequence number of the case ID (`TC-{key}-{n}`), without leading zeros.
- When one case yields several screenshots (any status), name them `tc-{n}-step-{m}.png`. With viewports, the viewport comes before the step: `tc-{n}-{viewport}-step-{m}.png`.
- Every `Fail` / `Partly Pass` case carries in the report: steps to reproduce, embedded screenshot evidence, and expected vs actual.
- **Marking is mandatory (hard rule).** Every executed-case screenshot follows this capture sequence, in order:
  1. **Decide the verdict first.** Observe the result and settle `Pass` / `Fail` / `Partly Pass` before shooting. A screenshot taken before the verdict was decided is **re-taken** with the mark.
  2. **Mark.** Outline the element that carries the result — `outline: 3px solid green` for `Pass`, `outline: 3px solid red` for `Fail` / `Partly Pass` — via `browser_highlight`; when that tool is missing on the connected Playwright MCP server, inject the same outline via `browser_evaluate`. When no single element carries the result (aggregate data, a region, missing content), inject an **arrow of the same color** via `browser_evaluate` (absolutely positioned overlay) pointing at the relevant region — a missing box target never means "no mark".
  3. **Shoot** the screenshot.
  4. **Remove the mark** (`browser_hide_highlight`, or remove the injected node) before driving on.

  Only a whole-page state with no locatable element or region at all (blank page, crash page, wrong redirect) may go unmarked — and then the case notes record the reason in one line.

- **Reports embed screenshots, never link them:** every screenshot appears in reports as a rendered image — `![...](...)` in markdown, inlined base64 in HTML/PDF. Reports live in `{test_artifacts}/{key}/` while screenshots stay in `{test_artifacts}/stella/{key}/evidence/`, so markdown reports embed via the relative path `../stella/{key}/evidence/{datetime}/...`.

## 5. Login and Credentials

- Test cases address users by role: "login as admin", "as customer". Resolve the role through `{workflow.environments.{environment}.users.{role}}` from the merged workflow block.
- Password resolution order: `{project-root}/_bmad/custom/stella-tea-live-testing.secrets.env` (key named by the user's `password_env`) → OS environment variable of the same name → ask the user.
- 🚫 Never write a credential value into any file under `{test_artifacts}` or into any report, brief, or checkpoint. Output folders are deliverables that get shared.
- 🚫 **Never instruct the user to handle a credential themselves** — no "run `$env:...=...`", no "set this environment variable", no command to execute. When resolution ends at "ask the user" and they supply the password, the **skill writes it into `stella-tea-live-testing.secrets.env` itself** after the explicit save-yes (section 6) and continues the run with it. Declining the save is fine — then the value is used for this run only, held in memory, written nowhere.
- Set authenticated users up **before** the test body of a case, not as an in-body improvisation.

## 6. Config Ask-Fallback

When any value a run needs is missing from config (environment, base URL, user, password), **ask the user instead of failing** (every such ask renders per the interactive-questions convention in `SKILL.md`), then **save the non-secret answer automatically** to `{project-root}/_bmad/custom/stella-tea-live-testing.user.toml` (create it from `{skill-root}/config/stella-tea-live-testing.user.toml.example` when absent) — no save question; state it in one line: "saved `{key}` to `.user.toml` — future runs skip this". The user's answer is the consent; the file is personal and gitignored. **Secrets are the exception:** writing a credential value into `stella-tea-live-testing.secrets.env` (from its `.example`) still requires an explicit yes first — never into TOML, never silently. `password_env` **names** are non-secret and autosave. A wiped `_bmad/custom/` self-heals this way on the next run.

## 7. Viewports and Devices (On Request Only)

- Default: one desktop browser on the user's machine. Nothing runs beyond desktop unless the user names viewports or devices for this run.
- When named: use Playwright MCP resize for viewport sizes (e.g. `desktop-1920` = 1920×1080, `tablet-768` = 768×1024, `mobile-390` = 390×844) and Playwright device descriptors (viewport + user agent + touch; WebKit approximates iOS Safari) for mobile web.
- Each case then reports a status **per combination**, and evidence filenames gain the combination: `tc-{n}-{viewport}.png`, or `tc-{n}-{viewport}-step-{m}.png` for step-level shots (viewport before step, always).

## 8. Run Order and Reporting Duty

- Execute cases one by one, in file order, top to bottom. Announce each case ID and title before driving it.
- The locked `test-cases.md` is **never modified by a run**. All results go into the timestamped report.
- Every run report ends with the count summary line: `Pass x, Fail y, Partly Pass z, Blocked b, Not Run n` — counts must sum to the total number of cases (times combinations when viewports were requested).

## 9. No Redundant Questions

A value already supplied this run (invocation, config, or checkpoint) is resolved — never re-ask it. Ask only when a needed value is absent from invocation, config, and checkpoint. This rule removes redundant asks; it never shrinks a gate — the execution-integrity halts above, the blocked cascade (section 3), and any approval gate stay in force regardless of how talkative the user has been.
