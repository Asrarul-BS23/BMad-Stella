'use strict';

// BMad Builder skill install, after the TEA steps: the skills a developer uses to
// build a custom skill, workflow or agent (report:
// bmb-module/bmad-builder-adoption-report.md, section 11). Only the listed skills
// are installed — `bmad-bmb-setup` is left out on purpose, its cleanup removes
// parts of `_bmad/`; `bmad-eval-runner` is left out until a Stella version exists.
// Fail-hard like the TEA step (the caller decides that).

const { BUILDER_SKILL_PACKAGE, BUILDER_SKILL_INSTALL_FLAGS } = require('./constants');
const skillsCli = require('./skills-cli-installer');

module.exports = skillsCli.create({
  pkg: BUILDER_SKILL_PACKAGE,
  flags: BUILDER_SKILL_INSTALL_FLAGS,
  label: 'Builder',
});
