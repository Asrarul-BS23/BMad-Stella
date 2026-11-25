'use strict';

// Stella defaults for the BMad Builder skills, written right after the Builder
// skill step. Without them a built skill lands in `{project-root}/skills`, a
// folder Claude Code does not load skills from.
//   _bmad/bmb/config.yaml                    the folders the Builder skills read on
//                                            activation (what `bmad-bmb-setup` would
//                                            ask; that skill is never installed)
//   _bmad/custom/bmad-<x>-builder.toml       team override, standing facts: a user-level
//                                            skill goes to ~/.claude/skills/, and no
//                                            evals are offered (no eval runner installed)
// A file that already exists is never overwritten: the _bmad/custom/ ones are the
// team's to edit and survive a re-install and a template refresh.

const fs = require('node:fs');
const path = require('node:path');
const {
  BMAD_DIR,
  BUILDER_OUTPUT_FOLDER,
  BUILDER_REPORTS_FOLDER,
  BUILDER_PERSISTENT_FACTS,
} = require('./constants');

const tomlString = (value) => `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

const CONFIG_YAML = [
  '# BMad Builder settings for BMad-Stella (written by the installer).',
  `bmad_builder_output_folder: "${BUILDER_OUTPUT_FOLDER}"`,
  `bmad_builder_reports: "${BUILDER_REPORTS_FOLDER}"`,
  '',
].join('\n');

const overrideToml = (table) =>
  [
    '# BMad-Stella default (written by the installer). Edit freely: it is kept on re-install.',
    `[${table}]`,
    'persistent_facts = [',
    ...BUILDER_PERSISTENT_FACTS.map((fact) => `  ${tomlString(fact)},`),
    ']',
    '',
  ].join('\n');

// [file relative to _bmad/, content]; the table name is the key each builder resolves.
const FILES = [
  ['bmb/config.yaml', CONFIG_YAML],
  ['custom/bmad-workflow-builder.toml', overrideToml('workflow')],
  ['custom/bmad-agent-builder.toml', overrideToml('agent')],
];

/**
 * @param {string} root project folder (or the master copy being built)
 * @returns {{written:string[], present:string[]}} paths relative to the root
 */
function apply(root) {
  const result = { written: [], present: [] };
  for (const [rel, content] of FILES) {
    const file = path.join(root, BMAD_DIR, ...rel.split('/'));
    const label = `${BMAD_DIR}/${rel}`;
    if (fs.existsSync(file)) {
      result.present.push(label);
      continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    result.written.push(label);
  }
  return result;
}

module.exports = { apply, FILES };
