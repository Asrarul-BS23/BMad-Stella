# Ask

A cited answer about how one environment behaves. No case file is written.

## Do

1. Find the code that answers the question, at the pinned commit. Start from the environment's `layout` text, then the project context, then search.
2. Follow the call chain from the entry point (controller, endpoint, job or screen) through the logic to the data layer. Stop only when you have read the line that decides the answer. A file or function that matches by name is not that line.
3. The answer depends on data and the environment has a database entry → check it with a query. No database entry → say that the answer depends on data and name the table and column to look at. Write the query only if the user asks for it.

## Answer

Shape, in this order:

```
{environment} at {short commit}
{the direct answer, one or two sentences}
{proof: one line per claim, each with path:line}
{what is not proven, and what would settle it — only when there is something}
```

- Quote the deciding line when the answer depends on its exact wording: a condition, a message, a value. Copy it exactly.
- Mark every claim you did not read directly as Deduced or Hypothesized, and say what would settle it.
- Could not find it, or it depends on config or data you cannot see → say what is missing and where it would be. Never fill the gap with a guess.
- The question can be read in two ways → answer the more likely reading and say in one line which reading you took.
- Cite only files that carry a claim. Do not list related files.
- A related part you did not read → name it in one last line, so the user can ask for it.

## Moving on

Offer to open a case, and HALT for a yes, in two situations only:

- the code does something the user calls a defect;
- the direct answer is graded Hypothesized.

A case writes a file, so never switch by yourself.
