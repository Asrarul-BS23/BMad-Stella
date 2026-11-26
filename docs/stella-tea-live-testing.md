# stella-tea-live-testing

QA testing for one Jira ticket or one module. Designs scenarios, writes test cases, runs them in a real browser, and reports with screenshots. Never writes automation code.

## Start

```
/stella-tea-live-testing LEADRSC-4901
```

The ticket, its comments and attachments are fetched and become the test input.

```
/stella-tea-live-testing Lead Management
```

A module name also works. Nothing is fetched from Jira.

## What it does

1. Confirms the scope, the environment and the login role. Asks only for what it does not know yet, and saves the answers for later runs. On the first run in a project it also asks if it may explore the code, and where the code is. Later runs follow that answer.
2. Designs test scenarios from the ticket, the code changes and the live UI, and shows them for approval.
3. Writes test cases from the approved scenarios and shows them for approval.
4. Runs each approved case in the browser, one by one, and takes a screenshot of every result.
5. Writes the run report, opens it, and offers to publish. Answer `y` or `n`.

At each approval, choose **Approved** or **Refine**. Nothing continues before you approve.

## After it ends

- Test cases and reports are under `_bmad-output/test-artifacts/<ticket or module>/`.
- Each case has a status: Pass, Fail, Partly Pass, Blocked (could not be tried) or Not Run.
- Each failed case has a severity: Critical, High, Medium or Low. Severity ranks a failure; it never changes its status.
- A run with failures also gets an issues report with the failed cases only, the most severe first.
- Ticket run: the offer is a Jira comment with the result counts. Module run: the offer is the case sheet on a Confluence page or a Jira ticket.

## Good to know

- Playwright MCP must be connected, or no case is run. Ticket runs and publishing also need the Atlassian MCP.
- A stopped run continues: start the skill again with the same ticket or module and choose resume.
- To change scenarios or test cases later, ask to edit them. The changed parts need approval again.
- To test again after a fix, resume the finished run and say `re-execute`. A new report is written and old reports are kept.
- Cases run on a desktop browser. Name other sizes to add them, for example `mobile-390`.
- Passwords are saved only after you say yes, and never appear in a report.

## It learns from your corrections

- Say a general correction, for example "we never test this" or "this failure is known", and the skill offers to save it as a rule. It asks one question, after you approve, never in the middle of a review.
- Later runs follow the saved rules and list them in chat as "Applied N learnings".
- A known failure is still run and still reported as failed. It only gets the label "Known issue".
- Rules are in `_bmad/custom/stella-tea-live-testing.learnings.md`. Edit the file, or tell the skill to forget a rule.
