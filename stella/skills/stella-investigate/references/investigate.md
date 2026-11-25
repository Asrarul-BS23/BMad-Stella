# Investigate

Find the cause of a problem, or explain an area nobody on the team knows. The result is a case file another engineer can act on without this chat.

## Case file

`_bmad-output/stella/investigations/{slug}/case.md`, created from `[[bmad-snapshot:case-template.md]]`.

- `{slug}` is the ticket key as written. With no ticket, propose a name of two to four words: lowercase letters, digits and hyphens.
- Create it right after the user confirms the opening message, not before.
- It is the memory of the case across sessions. Update it each time a finding, a hypothesis status or the conclusion changes, before you read further.
- Write what a reader needs to act. Do not narrate what you tried. Leave out a section that has nothing in it.
- Query files for this case go in `{slug}/queries/`.
- Never put a secret or personal data in it: the file is handed to other people. Describe an image in words; do not copy it.

## Opening message

A new case adds two things to the opening message of the workflow, in the same message:

- the problem as you understood it, in one or two sentences;
- the case file path, with the proposed name when there is no ticket key.

Then HALT for a yes or a correction. This is the only stop before work begins: do not ask about the name separately.

## Continuing a case

The folder already exists → read `case.md` first. Tell the user, in this order:

1. each hypothesis that is still Open, with what would settle it;
2. the evidence that is still missing;
3. the last conclusion and its confidence.

Then ask which point to take up, and HALT.

Pin the environment again. Its commit differs from the one in the case file → say so before anything else: the earlier findings were read on older code and may no longer hold. New work goes under a new `## Follow-up: {YYYY-MM-DD}` heading, with the commit it was read at. Never change the earlier text.

## Outcomes

Reach all five. Take them in this order. Go back to an earlier one when new evidence changes it.

**1. The problem is stated and has a starting fact.** Write down what was reported, in the reporter's words, as a claim. Then find one thing you can read directly that ties the report to the code: the error text, the screen, an endpoint, a status value. Start from that fact and work outward. Never start from a theory and look for support. The user came with a theory → record it as the first Open hypothesis and test it like any other.

**2. The evidence is listed.** Fill the Evidence table once, from what you already have: client message, image, logs, ticket, version history, tests, database. Mark each Available, Partial or Missing. Do not go looking for more evidence at this point.

**3. The cause is reasoned out.**

- Work backward from the symptom to the conditions that produce it. For an area with no symptom, work backward from what the code outputs.
- Write each hypothesis with what would prove it and what would disprove it. Then read the code or run the query that tests it.
- Before you mark a hypothesis Confirmed, look for evidence against it. Write in the case file what you looked for and what you found.
- A hypothesis is never deleted. Mark it Open, Confirmed or Refuted and write what settled it. Closed paths save the next person the same work.
- The problem began at a known time, or "used to work" → read the version history: `git log` on the affected files shows what changed and when.
- It works in one environment and not in another → read the second environment as described in `[[bmad-snapshot:references/compare.md]]` and record the result in this case file.

**4. The code path is traced.** Name where the problem starts (`path:line`), what triggers that code, and what state produces the wrong result. Where the flow crosses a boundary (another process, service or language, or a config value), read both sides. Never assume what the other side does. The fix is a change to one line and needs no design choice → write the suggested line in the case file. Never make the change.

**5. The case is closed or parked.** Write the conclusion and its confidence:

- **High** — the cause is Confirmed, and every step from the trigger to the symptom is read in the code, shown by a query result, or reported by a person who followed the steps below.
- **Medium** — the cause is Confirmed or Deduced, but at least one step on the way to the symptom is not read or shown. Name that step.
- **Low** — the cause is Hypothesized; name the missing evidence.

Write "reproduced" only when a person followed the steps and told you the result; say who and when. A path read in the code is "shown in code", never "reproduced".

Then write what must change and why.

Then write the steps to reproduce, for a PM or QA person who works in the product, not in the code:

- **Start:** the environment, the user role, and the data that must exist (for example "an order with status Open and no delivery date").
- **Steps:** numbered actions, one per line. Use the names the user sees: the screen title, the button label, the field label. Take them from the view or resource file at the pinned commit, never from memory.
- **Expected:** what the product must do.
- **Actual:** what it does, as the code shows it.
- **Data check:** when the cause shows in data, the query that returns the bad rows, and its result if you ran it.

Cannot tell how to reach the code from the product (a job, an import, an API with no screen) → write that, and name what triggers it.

When the confidence is not High, ask the user to follow the steps and tell you the result. Go on to close the case without waiting; record the result in a follow-up when it comes.

Last, rewrite the three lines at the top of the case file so they are true for a reader who reads nothing else. Set the status: Concluded, Active, or Blocked on evidence.

## When to HALT

Only at these three points:

- After the opening message, before the first code read.
- When no Open hypothesis can be tested from the code or a query you can run. Ask for one thing: the one that would settle the most Open hypotheses. Say what it would settle. Then HALT.
- At the end, with the conclusion.

Thin evidence alone is not a reason to stop. Keep reading code until the second point applies.

## The case is done when

One of these is true:

- the cause is Confirmed;
- the cause is Hypothesized and the missing evidence is named;
- for an area with no symptom: the user's question about the area is answered with citations;
- every Open hypothesis needs evidence nobody can get;
- the user says so.
