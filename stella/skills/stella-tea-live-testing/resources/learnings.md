# Learnings

Loaded by the QA flow (`steps-c/step-03-scenarios.md`, `step-04-approve-scenarios.md`, `step-05-generate-cases.md`, `step-07-report.md`) and the dev flow (`steps-dev/step-02-hunt-scenarios.md`, `step-03-execute-triage.md`). Both flows follow these rules; neither may override them.

## 1. What a Learning Is

A learning is a correction the user gave that holds beyond one ticket: a kind of scenario that should not be designed, a priority the skill got wrong, a failure that is known and can be ignored, a fact about the app. The skill saves it once and follows it in later runs, so the user does not repeat the same correction.

- **File:** `{project-root}/_bmad/custom/stella-tea-live-testing.learnings.md` — per project, personal, gitignored like everything under `_bmad/custom/`. The skill creates it on the first save.
- **Loading:** the file is a `persistent_facts` entry in `customize.toml`, so activation loads it. A missing file means there are no learnings yet — not an error.
- **Weight:** learnings are rules the user confirmed. Follow them. They are not project memory, which stays background only.
- A correction that fits one ticket only is an edit, not a learning. Never save it.

## 2. Shape of an Entry

One entry per line, in this form:

```markdown
- **LR-{n}** · {type} · {scope} — {rule} _Why:_ {reason} _Source:_ {date}, {key}
```

Example:

```markdown
- **LR-3** · skip · module: Lead Management — Do not design browser-back scenarios. _Why:_ the team never tests browser navigation. _Source:_ 2026-11-26, LEADRSC-4901
```

- `LR-{n}` ids count up and are never reused; a removed entry leaves a gap.
- **Rule:** one sentence a later run can check. Write it one level more general than the user's words — general enough to match again, never wider than what the user meant.
- **Reason:** why the user said it. A later run uses it to judge a border case instead of applying the rule blindly.

| Type          | What it changes                                                          |
| ------------- | ------------------------------------------------------------------------ |
| `skip`        | A kind of scenario or case is not designed.                              |
| `priority`    | A kind of scenario, case, or failure ranks higher or lower (severity).   |
| `known-issue` | A failure is known; it is labeled as known wherever it is reported.      |
| `fact`        | Something true about the app or environment that scenarios must respect. |

| Scope                  | Applies to                                                |
| ---------------------- | --------------------------------------------------------- |
| `project`              | Every run in this project.                                |
| `module: {name}`       | Runs that touch this module.                              |
| `feature-type: {kind}` | A kind of screen or flow, e.g. read-only lists.           |
| `environment: {name}`  | Runs on this environment — `known-issue` and `fact` only. |

There is no ticket-level scope.

## 3. A Learning Never Changes a Verdict

The execution integrity rule (`execution-rules.md` section 1) stands above every learning.

- 🚫 A learning never turns a `Fail` or `Partly Pass` into anything else, and never hides a failed case from a report or from the trace record.
- A `known-issue` failure is still executed, still `Fail` / `Partly Pass`, still has its evidence and its severity. It only gains the label "Known issue: {rule}".
- A `skip` learning acts at design time only — the scenario or case is not written. It never skips an approved case at execution.
- 🚫 No credential value ever goes into a learning.

## 4. Capture — One Question

### When to Propose a Rule

- The user's words are general ("we never test this", "always ignore that") → propose.
- The same kind of correction appears a second time in this run → propose.
- A single edit that is neither general nor repeated → apply it and propose nothing.
- Never ask in the middle of a refine loop. Collect the candidates and ask once, after the user approved (QA flow) or when the triage loop ended (dev flow).
- Several candidates go into one interactive question event (one `AskUserQuestion` call).

The dev flow proposes a learning only from a triage answer "B — wrong scenario".

### Compare First, Then Ask

Before asking, compare each candidate with the saved entries. A contradiction is settled **inside the same question** — never with a second one.

| What the comparison finds                               | What to do                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The same rule is already saved                          | Save nothing, ask nothing; say so in one line.                                                      |
| No saved entry touches it                               | Ask the save question.                                                                              |
| A saved entry with a **wider** scope says the opposite  | Not a contradiction — the new rule is an exception. Ask the save question and name the older entry. |
| A saved entry with the **same** scope says the opposite | Contradiction. Ask the contradiction question, showing both rules.                                  |

**Save question** — show the entry exactly as it would be saved, then the options:

- "Save for {proposed scope}" (recommended — the one scope you judge best)
- "Save for {the other sensible scope}" (one step wider or narrower)
- "Do not save"

**Contradiction question** — show the old entry and the new rule, then the options:

- "Replace the old rule" (recommended — the user's newest word wins)
- "Keep the old rule, save the new one for {narrower scope} only"
- "Do not save"

Write the file only after the answer, and confirm in one line: "saved `LR-{n}` — later runs follow it".

## 5. Reuse in Later Runs

- Take the entries whose scope matches this run (its project, module, feature types, environment), then follow their rules.
- Two matching entries that disagree: the narrower scope wins (`module` over `project`, `feature-type` over `module`).
- Scenario and case summaries **in chat** carry one line — "Applied {n} learnings" — followed by each applied entry's id and rule, so the user can object. This line never goes into a report file.
- A `known-issue` entry whose case passed in this run: offer once to remove the entry (interactive: "Remove" / "Keep").

## 6. Forgetting

When the user asks to forget or change a learning, do it at once — remove or rewrite the entry and confirm in one line. No question. The user may also edit the file by hand.
