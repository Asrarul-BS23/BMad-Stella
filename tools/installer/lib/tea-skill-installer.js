'use strict';

// TEA skill install, right after the BMad step (plan: tea-module/integration-steps.md).
// Fail-hard: a non-zero exit here aborts the whole install, same mechanism as the
// BMad step itself (the caller decides that, not this module). The `npx skills add`
// mechanics are in skills-cli-installer.js.

const { TEA_SKILL_PACKAGE, TEA_SKILL_INSTALL_FLAGS } = require('./constants');
const skillsCli = require('./skills-cli-installer');

module.exports = skillsCli.create({
  pkg: TEA_SKILL_PACKAGE,
  flags: TEA_SKILL_INSTALL_FLAGS,
  label: 'TEA',
});
