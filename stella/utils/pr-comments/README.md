# pr-comments

Posts `*pr-review` findings as line comments on a GitHub PR. Used by the reviewer agent after the findings file is written and the user says yes.

```
node .bmad-core/utils/pr-comments <bmad-docs/reviewer/<folder>/findings.json>              preview, posts nothing
node .bmad-core/utils/pr-comments <findings.json> --post                   pending review (only you see it)
node .bmad-core/utils/pr-comments <findings.json> --post --submit          submitted as a "Comment" review
```

What it can do: create one review with line comments. Nothing else — no approve, no request-changes, no merge, no edits to the PR. One `POST …/pulls/{n}/reviews` call in the whole file.

Each comment is `what — why`, plain text, max 220 chars / 2 sentences. Longer ones are flagged `LONG` and block `--post` until shortened in the JSON. Findings whose line is not in the diff go into the review summary. Already-posted findings (hidden `<!-- bmad:SHA7:ID -->` marker, scoped to the reviewed commit) are skipped.

Exit codes: 0 ok · 2 usage · 3 long comments · 4 pending review exists · 5 PR head changed · 6 gh error · 7 nothing to post.
