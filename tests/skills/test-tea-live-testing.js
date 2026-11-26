'use strict';

// stella-tea-live-testing — text contract of the v3 rules.
// Mode: the skill never asks which mode to run; `qa` when nothing decides; the dev
// flow, the spec auto-detect and the SQ/SD presets stay; the resolved mode is saved
// only when none is saved. Code exploration: asked once (Yes / No), saved with the
// code folder, a custom folder is checked, "invalid" stops later asks, and step-03
// follows the saved answer. The impacted-areas question can be skipped.

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const SKILL = path.join(REPO, 'stella', 'skills', 'stella-tea-live-testing');
const read = (...p) => fs.readFileSync(path.join(SKILL, ...p), 'utf8');

let fails = 0;
let total = 0;
const ok = (c, m) => {
  total++;
  if (!c) {
    fails++;
    console.log('FAIL ' + m);
  }
};

// The numbered rules of section 1, as { number: text }.
const rulesOf = (md) => {
  const start = md.indexOf('## 1. Resolve `flow_mode`');
  const end = md.indexOf('## 2. Route Dev Flow Now');
  const rules = {};
  if (start === -1 || end === -1) return rules;
  for (const m of md.slice(start, end).matchAll(/^(\d)\. \*\*(.+?)\*\*(.*)$/gm)) {
    rules[m[1]] = `${m[2]} ${m[3]}`;
  }
  return rules;
};

// --- Mode ---------------------------------------------------------------
{
  const detect = read('steps-c', 'step-01-detect-mode.md');
  const rules = rulesOf(detect);

  ok(Object.keys(rules).length === 5, `mode: five priority rules (${Object.keys(rules).length})`);
  ok(/`SQ` → `flow_mode = qa`/.test(rules[1] || ''), 'mode: SQ still presets qa');
  ok(/`SD` → `flow_mode = dev`/.test(rules[1] || ''), 'mode: SD still presets dev');
  ok(/QA checkpoint/.test(rules[2] || ''), 'mode: rule 2 is still the QA checkpoint');
  ok(/auto-detect/.test(rules[3] || ''), 'mode: rule 3 is still input auto-detect');
  ok(
    /implementation spec[^\n]*→ `flow_mode = dev`/.test(detect),
    'mode: a spec input still auto-detects dev',
  );
  ok(/workflow\.defaults\.flow_mode/.test(rules[4] || ''), 'mode: rule 4 uses the saved default');
  ok(/`flow_mode = qa`/.test(rules[5] || ''), 'mode: rule 5 defaults to qa');
  ok(/Never ask the user which mode/.test(rules[5] || ''), 'mode: rule 5 forbids the question');
  ok(
    !/Dev bug hunt"\)/.test(detect) && !/\(A\) a \*\*QA run\*\*/.test(detect),
    'mode: no QA/dev question left',
  );
  ok(
    /When `\[workflow\.defaults\] flow_mode` is empty or missing, save the resolved/.test(detect),
    'mode: saved when no default exists',
  );
  ok(/a `SD` run included/.test(detect), 'mode: the SD run saves too');
  ok(/already saved is never overwritten/.test(detect), 'mode: a saved default is kept');
  ok(/Overwriting a saved `flow_mode`/.test(detect), 'mode: overwrite listed as a failure');
  ok(/Asking the user which mode to run/.test(detect), 'mode: asking listed as a failure');
  ok(
    /Which Jira ticket key or module name is this run for\?/.test(detect),
    'mode: a run without input asks for the ticket or module',
  );

  const skill = read('SKILL.md');
  ok(/then `qa` — the skill never asks which mode to run/.test(skill), 'SKILL: summary matches');
  ok(!/then one question/.test(skill), 'SKILL: old "then one question" is gone');
  ok(!/What would you like to do\?/.test(skill), 'SKILL: no operation menu question');
  ok(/with no input at all starts Create/.test(skill), 'SKILL: a bare run starts Create');
  for (const op of ['[R] Resume', '[V] Validate', '[E] Edit']) {
    ok(skill.includes(op), `SKILL: ${op} still reachable`);
  }
  ok(
    fs.existsSync(path.join(SKILL, 'steps-dev', 'step-01-spec-intake.md')),
    'dev flow still ships',
  );
}

// --- Code exploration ----------------------------------------------------
{
  const intake = read('steps-c', 'step-02-intake.md');

  ok(
    /"Do you want me to explore code\?" Options: "Yes" \/ "No"/.test(intake),
    'code: Yes / No question',
  );
  ok(
    /only when `\{workflow\.defaults\.explore_code\}` is not saved/.test(intake),
    'code: asked only when not saved',
  );
  ok(/a saved answer is never asked again/.test(intake), 'code: saved answer is final');
  ok(/save `explore_code = false`/.test(intake), 'code: No is saved');
  ok(/save `explore_code = true`/.test(intake), 'code: Yes is saved');
  ok(/"Where is the code\?"/.test(intake), 'code: folder question after Yes');
  ok(
    /"This project folder" \(recommended\)/.test(intake),
    'code: project folder is the first option',
  );
  ok(/save `code_path = ""`/.test(intake), 'code: project folder saved as empty path');
  ok(
    /saved only when it holds a project — it exists and contains source code/.test(intake),
    'code: custom folder checked before save',
  );
  ok(/no code in that folder and ask once more/.test(intake), 'code: first bad folder asks again');
  ok(
    /moves on without code and save `code_path = "invalid"`/.test(intake),
    'code: second bad folder saves invalid',
  );
  ok(
    /`code_path = "invalid"` → no code exploration and no question/.test(intake),
    'code: invalid stops exploration and asks',
  );
  ok(
    /no longer exists → say so in one line and run without code this time; keep the saved value/.test(
      intake,
    ),
    'code: a vanished folder keeps the saved value',
  );
  ok(/QA flow only/.test(intake), 'code: applies to the QA flow only');
  ok(/"No other areas" and "Skip"/.test(intake), 'impact: Skip option');
  ok(/may skip it or give no input/.test(intake), 'impact: empty answer accepted');
  ok(/only when this run does not explore code/.test(intake), 'impact: tied to the saved answer');
  ok(
    !/no git repo at `\{project-root\}` and no link to the code/.test(intake),
    'impact: old condition gone',
  );

  const scen = read('steps-c', 'step-03-scenarios.md');
  const first = scen.indexOf('1. **This run does not explore code');
  const branch = scen.indexOf('2. **Resolve the environment');
  ok(first !== -1 && branch > first, 'step-03: the skip check comes before the branch question');
  ok(
    /never look for code in another folder/.test(scen),
    'step-03: no search outside the saved folder',
  );
  ok(/In the code folder, run `git log/.test(scen), 'step-03: git runs in the code folder');
  ok(
    /no code is read at all — not here and not inside test-design/.test(scen),
    'step-03: no code read on No',
  );
  ok(/Reading code when the saved answer says not to/.test(scen), 'step-03: listed as a failure');

  // The dev flow does not depend on the saved code answer.
  for (const f of [
    'step-01-spec-intake.md',
    'step-02-hunt-scenarios.md',
    'step-03-execute-triage.md',
  ]) {
    ok(!/explore_code|code_path/.test(read('steps-dev', f)), `dev: ${f} ignores the code answer`);
  }
}

// --- Config surface ------------------------------------------------------
{
  for (const f of [
    'customize.toml',
    path.join('config', 'stella-tea-live-testing.user.toml.example'),
  ]) {
    const src = read(f);
    for (const key of ['flow_mode', 'explore_code', 'code_path']) {
      ok(new RegExp(`^#\\s+${key}\\s*=`, 'm').test(src), `${f}: documents ${key}`);
    }
    ok(/"invalid"/.test(src), `${f}: documents the invalid code_path`);
    // Still commented out: the skill saves these, the template must not preset them.
    ok(!/^\s*(flow_mode|explore_code|code_path)\s*=/m.test(src), `${f}: keys are not preset`);
  }
  ok(
    /flow_mode, explore_code, code_path/.test(read('SKILL.md')),
    'SKILL: activation lists the new default keys',
  );
}

// --- Learnings -----------------------------------------------------------
{
  const rules = read('resources', 'learnings.md');
  const LEARNINGS = '_bmad/custom/stella-tea-live-testing.learnings.md';

  ok(rules.includes(`{project-root}/${LEARNINGS}`), 'learnings: file lives in _bmad/custom');
  ok(
    new RegExp(`^\\s*"file:\\{project-root\\}/${LEARNINGS}",?$`, 'm').test(read('customize.toml')),
    'learnings: loaded as a persistent fact',
  );
  ok(
    /A missing file means there are no learnings yet/.test(rules),
    'learnings: missing file is fine',
  );
  for (const type of ['skip', 'priority', 'known-issue', 'fact']) {
    ok(new RegExp(`^\\| \`${type}\``, 'm').test(rules), `learnings: type ${type}`);
  }
  for (const scope of [
    'project',
    'module: {name}',
    'feature-type: {kind}',
    'environment: {name}',
  ]) {
    ok(rules.includes(`| \`${scope}\``), `learnings: scope ${scope}`);
  }
  ok(/There is no ticket-level scope/.test(rules), 'learnings: no ticket scope');
  ok(/\*\*LR-\{n\}\*\* · \{type\} · \{scope\} — \{rule\}/.test(rules), 'learnings: entry shape');
  ok(
    /_Why:_ \{reason\} _Source:_ \{date\}, \{key\}/.test(rules),
    'learnings: reason and source kept',
  );
  ok(/never reused/.test(rules), 'learnings: ids are never reused');

  // Verdicts are out of reach.
  ok(
    /never turns a `Fail` or `Partly Pass` into anything else/.test(rules),
    'learnings: verdict kept',
  );
  ok(
    /never hides a failed case from a report or from the trace record/.test(rules),
    'learnings: nothing hidden',
  );
  ok(
    /never skips an approved case at execution/.test(rules),
    'learnings: skip acts at design time only',
  );
  ok(/No credential value ever goes into a learning/.test(rules), 'learnings: no credentials');

  // Friction rules.
  ok(
    /The user's words are general \("we never test this"/.test(rules),
    'capture: general words propose',
  );
  ok(/appears a second time in this run → propose/.test(rules), 'capture: a repeat proposes');
  ok(
    /neither general nor repeated → apply it and propose nothing/.test(rules),
    'capture: one-off edits do not',
  );
  ok(/Never ask in the middle of a refine loop/.test(rules), 'capture: never mid-loop');
  ok(/one interactive question event/.test(rules), 'capture: candidates are batched');
  ok(
    /only from a triage answer "B — wrong scenario"/.test(rules),
    'capture: dev writes from triage B only',
  );

  // Contradictions are settled in the same question.
  ok(
    /settled \*\*inside the same question\*\* — never with a second one/.test(rules),
    'conflict: one question',
  );
  ok(
    /Save nothing, ask nothing; say so in one line/.test(rules),
    'conflict: a duplicate asks nothing',
  );
  ok(
    /Not a contradiction — the new rule is an exception/.test(rules),
    'conflict: wider scope is an exception',
  );
  ok(/"Replace the old rule" \(recommended/.test(rules), 'conflict: replace is the first option');
  ok(
    /"Keep the old rule, save the new one for \{narrower scope\} only"/.test(rules),
    'conflict: narrow option',
  );
  ok(
    (rules.match(/^- "Do not save"$/gm) || []).length === 2,
    'conflict: both questions can decline',
  );
  ok(/"Save for \{proposed scope\}" \(recommended/.test(rules), 'save: proposed scope first');

  // Reuse.
  ok(/the narrower scope wins/.test(rules), 'reuse: narrower scope wins');
  ok(/"Applied \{n\} learnings"/.test(rules), 'reuse: applied line');
  ok(/This line never goes into a report file/.test(rules), 'reuse: applied line is chat only');
  ok(/offer once to remove the entry/.test(rules), 'reuse: a passing known issue offers removal');
  ok(/do it at once[^\n]*No question/.test(rules), 'forget: no question');

  // Every step that uses learnings names the rulebook.
  for (const f of [
    ['steps-c', 'step-03-scenarios.md'],
    ['steps-c', 'step-04-approve-scenarios.md'],
    ['steps-c', 'step-05-generate-cases.md'],
    ['steps-c', 'step-07-report.md'],
    ['steps-dev', 'step-02-hunt-scenarios.md'],
    ['steps-dev', 'step-03-execute-triage.md'],
  ]) {
    const src = read(...f);
    ok(
      /^learningsRules: '\{skill-root\}\/resources\/learnings\.md'$/m.test(src),
      `${f[1]}: frontmatter points at the rulebook`,
    );
    ok(src.includes('{learningsRules}'), `${f[1]}: uses the rulebook`);
  }
  ok(fs.existsSync(path.join(SKILL, 'resources', 'learnings.md')), 'learnings: rulebook ships');

  for (const f of ['step-04-approve-scenarios.md', 'step-05-generate-cases.md']) {
    const src = read('steps-c', f);
    ok(/never during the loop/.test(src), `${f}: proposes after approval only`);
    ok(/"Applied \{n\} learnings"/.test(src), `${f}: shows applied learnings in chat`);
  }
  const report = read('steps-c', 'step-07-report.md');
  ok(
    /keeps its status, severity, evidence, and Failure Detail unchanged/.test(report),
    'report: known issue keeps its verdict',
  );
  ok(
    /under their own `Known issues` heading[^\n]*never left out/.test(report),
    'report: known issues stay listed',
  );
  ok(/a failed case is `fail`/.test(report), 'trace: a known issue is still fail');
  ok(!/Applied \{n\} learnings/.test(report), 'report: applied line is not written to the report');
  ok(
    /only place the dev flow saves a learning/.test(read('steps-dev', 'step-03-execute-triage.md')),
    'dev: one write path',
  );
  ok(/💾 \*\*Learnings:\*\*/.test(read('SKILL.md')), 'SKILL: learnings convention');
  ok(/## 8\. Learnings/.test(read('checklist.md')), 'checklist: learnings section');
}

// --- Severity ------------------------------------------------------------
{
  const exec = read('resources', 'execution-rules.md');
  const heads = [...exec.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]));
  ok(
    heads.join(',') === '1,2,3,4,5,6,7,8,9,10',
    `rules: sections stay in order (${heads.join(',')})`,
  );
  ok(/^## 10\. Severity$/m.test(exec), 'severity: section 10');
  const sev = exec.slice(exec.indexOf('## 10. Severity'));
  for (const level of ['Critical', 'High', 'Medium', 'Low']) {
    ok(new RegExp(`^\\| \`${level}\`\\s+\\| \\S`, 'm').test(sev), `severity: ${level} is defined`);
  }
  ok((sev.match(/^\| `/gm) || []).length === 4, 'severity: exactly four levels');
  ok(
    /Every `Fail` and `Partly Pass` case gets one severity/.test(sev),
    'severity: failed cases only',
  );
  ok(
    /`Pass`, `Blocked`, and `Not Run` cases get none/.test(sev),
    'severity: none for other statuses',
  );
  ok(
    /Severity never changes a verdict: a `Low` failure is still `Fail`/.test(sev),
    'severity: verdict kept',
  );
  ok(/matching `priority` learning/.test(sev), 'severity: a priority learning can decide it');

  const HEADER = /\| Status\s+\| Severity\s+\| Evidence\/Comments\s+\|/;
  const tpl = read('templates', 'test-execution-template.md');
  ok(HEADER.test(tpl), 'template: Severity column after Status');
  ok(
    /^- \*\*Severity:\*\* \{Critical \| High \| Medium \| Low\}$/m.test(tpl),
    'template: Failure Detail severity',
  );

  const example = read('resources', 'test-execution.example.md');
  ok(HEADER.test(example), 'example: Severity column');
  // Results table only — the Blocked / Not Run table further down has the same ids.
  const rows = example
    .slice(0, example.indexOf('## Failure Detail'))
    .split('\n')
    .filter((l) => /^\| TC-STEL-123-\d\d /.test(l));
  ok(rows.length === 5, `example: five result rows (${rows.length})`);
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim());
    const [status, severity] = [cells[5], cells[6]];
    const failed = status === 'Fail' || status === 'Partly Pass';
    ok(
      failed ? /^(Critical|High|Medium|Low)$/.test(severity) : severity === '',
      `example: ${cells[1]} (${status}) severity "${severity}"`,
    );
  }
  ok(
    (example.match(/^- \*\*Severity:\*\* (Critical|High|Medium|Low)$/gm) || []).length === 2,
    'example: both failures ranked',
  );

  const css = read('resources', 'report-style.css');
  for (const level of ['critical', 'high', 'medium', 'low']) {
    ok(new RegExp(`^\\.badge\\.sev-${level} \\{`, 'm').test(css), `css: .badge.sev-${level}`);
  }

  ok(
    /a severity per `\{executionRules\}` section 10/.test(read('steps-c', 'step-06-execute.md')),
    'step-06: assigns severity',
  );
  const report = read('steps-c', 'step-07-report.md');
  ok(
    /a Severity column \(`\{executionRules\}` section 10/.test(report),
    'step-07: Severity column',
  );
  ok(/ordered by severity, highest first/.test(report), 'step-07: issues report ordered');
  ok(/`\.badge\.sev-critical`/.test(report), 'step-07: severity badge classes');
  ok(/^executionRules: /m.test(report), 'step-07: frontmatter names the rules');
  const dev = read('steps-dev', 'step-03-execute-triage.md');
  ok(/each with its severity/.test(dev), 'dev: Bugs Found carries severity');
  ok(/severity \{severity\}/.test(dev), 'dev: triage question shows severity');
  ok(
    /has a severity \(Critical, High, Medium, Low\)/.test(read('checklist.md')),
    'checklist: severity check',
  );
}

// --- Text consistency fixes ----------------------------------------------
{
  const spec = read('steps-dev', 'step-01-spec-intake.md');
  ok(
    /then autosave the answer to `\[workflow\.defaults\] spec_path`/.test(spec),
    'spec_path: saved',
  );
  ok(!/offer to save the answer/.test(spec), 'spec_path: no save question');

  const cases = read('steps-c', 'step-05-generate-cases.md');
  const report = read('steps-c', 'step-07-report.md');
  ok(
    !/step-07 does not repeat it/.test(cases),
    'publish: step-05 no longer denies the step-07 ask',
  );
  ok(
    /When nothing is published here, step-07 makes the same offer once more/.test(cases),
    'publish: steps agree',
  );
  ok(
    /nothing published yet/.test(report),
    'publish: step-07 still offers when nothing was published',
  );
  ok(!/open item 7/.test(report), 'report: no pointer to a missing design doc');

  const assess = read('steps-e', 'step-01-assess.md');
  ok(
    /`test-cases\.md` under `\{test_artifacts\}\/\*\/`/.test(assess),
    'edit: names the deliverables folder',
  );
  ok(
    /`scenarios\.md` under `\{test_artifacts\}\/stella\/\*\/`/.test(assess),
    'edit: names the internal folder',
  );

  const VALIDATION = 'validation-report-{run_timestamp}.md';
  ok(read('SKILL.md').includes(VALIDATION), 'outputs: SKILL lists the validation report');
  ok(read('workflow.yaml').includes(`stella/{key}/${VALIDATION}`), 'outputs: workflow lists it');
  ok(
    read('steps-v', 'step-01-validate.md').includes(`stella/{key}/${VALIDATION}`),
    'outputs: same path as the step',
  );

  const doc = fs.readFileSync(path.join(REPO, 'docs', 'stella-tea-live-testing.md'), 'utf8');
  ok(!/Answer `y` or `n`/.test(doc), 'doc: no y/n answer');
}

console.log(
  `tea-live-testing: ${total - fails}/${total} passed${fails ? ` — ${fails} FAILED` : ''}`,
);
process.exit(fails ? 1 : 0);
