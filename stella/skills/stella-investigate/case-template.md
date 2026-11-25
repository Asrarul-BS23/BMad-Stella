# Investigation: {title}

1. **What happened.** {one sentence, with its grade}
2. **Where the case stands.** {status, last finding, what would unblock it}
3. **What is needed next.** {one recommended action, with the reason}

## Case info

| Field       | Value                                                                         |
| ----------- | ----------------------------------------------------------------------------- |
| Ticket      | {key or "none"}                                                               |
| Opened      | {YYYY-MM-DD}                                                                  |
| Status      | {Active / Concluded / Blocked on evidence}                                    |
| Environment | {name}                                                                        |
| Source      | {branch, tag or folder, one line per source}                                  |
| Commit      | {full commit id per source; "uncommitted changes: yes/no" for a working tree} |
| Pinned on   | {YYYY-MM-DD}                                                                  |

## Reported problem

{The reporter's words, exactly. This is a claim; the findings below confirm it or correct it.}

## Evidence

| Source   | Status                          | Notes                             |
| -------- | ------------------------------- | --------------------------------- |
| {source} | {Available / Partial / Missing} | {what it is, or how to obtain it} |

## Confirmed findings

### {title}

**Where:** {environment} at `{commit}` — `{path:line}`, log line, or query read at {time}

{what was read}

## Deductions

### {title}

**From:** {which Confirmed findings}

{the steps, then what follows}

## Hypotheses

### {title}

**Status:** {Open / Confirmed / Refuted}

**Would prove it:** {specific evidence}

**Would disprove it:** {specific evidence}

**Settled by:** {the evidence that closed it, once the status is no longer Open}

## Code path

| Element         | Detail                                     |
| --------------- | ------------------------------------------ |
| Starts at       | `{path:line}`, {function}                  |
| Triggered by    | {what makes this code run}                 |
| Goes wrong when | {the state that produces the wrong result} |
| Related files   | {other files on the same path}             |

## Environment comparison

{Only when a second environment was read: one line per environment with its commit, what differs, the kind of difference (code, config, data), and what could not be compared.}

## Conclusion

**Confidence:** {High / Medium / Low}

{What is Confirmed and what is still Hypothesized. The cause, or the most likely paths and what would settle them.}

## Next steps

**Fix direction:** {what needs to change and why}

**To reproduce or verify:** {setup, action, expected result}

## Follow-up: {YYYY-MM-DD}

**Read at:** {environment} at `{commit}`

{New evidence, new findings, changed hypotheses, updated conclusion. Earlier text stays as it is.}
