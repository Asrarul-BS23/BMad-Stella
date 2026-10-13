const fs = require('fs-extra');
const path = require('node:path');
const chalk = require('chalk').default || require('chalk');
const inquirer = require('inquirer').default || require('inquirer');
const cjson = require('comment-json');

class ClaudePermissionsManager {
  constructor() {
    // Define BMAD required permissions for Claude Code
    // Define the permissions Stella needs in Claude Code (BMad v6 layout).
    // Allow rules are narrow on purpose: each names one tool shape. Anything not
    // listed falls back to Claude Code's normal prompt.
    this.bmadPermissions = [
      // Atlassian — the claude.ai connector (JIRA ticket text, Confluence pages, completion comment)
      'mcp__claude_ai_Atlassian__getJiraIssue',
      'mcp__claude_ai_Atlassian__searchJiraIssuesUsingJql',
      'mcp__claude_ai_Atlassian__addCommentToJiraIssue',
      'mcp__claude_ai_Atlassian__getConfluencePage',
      'mcp__claude_ai_Atlassian__getConfluencePageDescendants',
      'mcp__claude_ai_Atlassian__fetch',

      'WebFetch(domain:stellaint.atlassian.net)',

      // Stella helpers (zero-dep Node scripts installed under _bmad/custom/stella/utils/)
      'Bash(node _bmad/custom/stella/utils/jira-attachments)',
      'Bash(node _bmad/custom/stella/utils/jira-attachments *)',
      'Bash(node _bmad/custom/stella/utils/jira-attachments/index.js)',
      'Bash(node _bmad/custom/stella/utils/jira-attachments/index.js *)',
      'Bash(node _bmad/custom/stella/utils/pr-comments *)',
      'Bash(node _bmad/custom/stella/utils/pr-comments/index.js *)',

      // BMad + Stella files the agent reads every session
      'Read(_bmad/**)',
      'Read(*/_bmad/**)',
      'Read(_bmad-output/**)',
      'Read(**/_bmad-output/**)',
      'Read(AGENTS.md)',

      // Source and config files (project code the skills investigate)
      'Read(**.cs)',
      'Read(**.js)',
      'Read(**.ts)',
      'Read(**.tsx)',
      'Read(**.jsx)',
      'Read(**.py)',
      'Read(**.java)',
      'Read(**.go)',
      'Read(**.cshtml)',
      'Read(**.html)',
      'Read(**.css)',
      'Read(**.scss)',
      'Read(**.md)',
      'Read(**.json)',
      'Read(**.yaml)',
      'Read(**.yml)',
      'Read(**.xml)',
      'Read(**.csproj)',
      'Read(**.sln)',
      'Read(**.toml)',

      // Stella output folder: specs, reviews, memory, logs (gitignored)
      'Edit(_bmad-output/**)',
      'Edit(*_bmad-output*)',
      'Bash(mkdir -p _bmad-output/**)',
      'Bash(mkdir -p **/_bmad-output/**)',
      'Bash(mkdir _bmad-output/**)',
      'Bash(mkdir **/_bmad-output/**)',
      'Bash(ls _bmad-output/**)',
      'Bash(ls **/_bmad-output/**)',
      'Bash(test -f _bmad-output/**)',
      'Bash(test -f **/_bmad-output/**)',
      'Bash(test -d _bmad-output/**)',
      'Bash(test -d **/_bmad-output/**)',

      // Read-only shell helpers
      'Bash(find *)',
      'Bash(grep *)',
      'Bash(tree)',
      'Bash(tree *)',
      'Bash(dir)',
      'Bash(dir *)',
      'Bash(ls)',
      'Bash(ls *)',
      'Bash(findstr)',
      'Bash(findstr *)',
      'Bash(head)',
      'Bash(head *)',
      'Bash(tail)',
      'Bash(tail *)',
      'Bash(wc)',
      'Bash(wc *)',
      'Bash(cut)',
      'Bash(cut *)',

      // Claude Code built-in search tools
      'Grep(*)',
      'Glob(*)',

      // BMad v6 skills run their render / config scripts through uv
      'Bash(uv run *)',

      // PR review (stella-pr-review) — GitHub CLI read commands for PR metadata, diff and CI status
      'Bash(gh auth status)',
      'Bash(gh auth status *)',
      'Bash(gh pr view *)',
      'Bash(gh pr diff *)',
      'Bash(gh pr checks *)',

      // PR review — local git READ commands at the PR head SHA. `git fetch origin pull/N/head`
      // only downloads objects into .git (no working-tree or branch change).
      'Bash(git fetch origin pull/*)',
      'Bash(git cat-file *)',
      'Bash(git show *)',
      'Bash(git grep *)',
      'Bash(git log *)',
      'Bash(git diff *)',

      // `cd` changes nothing by itself. Agents prefix commands with `cd <root> &&` when the
      // shell cwd drifts; Claude Code splits compound commands and checks each part, so
      // without this rule the harmless `cd` part sends the whole command to a prompt/classifier.
      'Bash(cd *)',

      // Same rules for the PowerShell tool (Windows sessions may use it instead of Bash).
      'PowerShell(cd *)',
      'PowerShell(Set-Location *)',
      'PowerShell(uv run *)',
      'PowerShell(gh auth status)',
      'PowerShell(gh auth status *)',
      'PowerShell(gh pr view *)',
      'PowerShell(gh pr diff *)',
      'PowerShell(gh pr checks *)',
      'PowerShell(git fetch origin pull/*)',
      'PowerShell(git cat-file *)',
      'PowerShell(git show *)',
      'PowerShell(git grep *)',
      'PowerShell(git log *)',
      'PowerShell(git diff *)',
      'PowerShell(node _bmad/custom/stella/utils/pr-comments *)',
      'PowerShell(node _bmad/custom/stella/utils/pr-comments/index.js *)',
      'PowerShell(node _bmad/custom/stella/utils/jira-attachments)',
      'PowerShell(node _bmad/custom/stella/utils/jira-attachments *)',
      'PowerShell(node _bmad/custom/stella/utils/jira-attachments/index.js)',
      'PowerShell(node _bmad/custom/stella/utils/jira-attachments/index.js *)',
    ];

    // Hard-blocked commands (settings.permissions.deny — deny wins over allow in Claude Code).
    // The *pr-review task is read-only; these are the gh commands that would mutate a PR or
    // reach arbitrary GitHub endpoints. No BMad agent needs any of them. Git write commands
    // (commit/push/checkout…) are intentionally NOT denied: they stay on Claude Code's default
    // prompt so developers can still commit from the same session.
    this.bmadDenyPermissions = [
      'Bash(gh api)',
      'Bash(gh api *)',
      'Bash(gh pr comment *)',
      'Bash(gh pr review *)',
      'Bash(gh pr edit *)',
      'Bash(gh pr merge *)',
      'Bash(gh pr close *)',
      'Bash(gh pr reopen *)',
      'Bash(gh pr ready *)',
      'Bash(gh pr lock *)',
      'Bash(gh pr unlock *)',
      'Bash(gh pr revert *)',
      'Bash(gh pr update-branch *)',
      'Bash(gh pr checkout *)',
      // PowerShell tool equivalents — the block must hold in either shell.
      'PowerShell(gh api)',
      'PowerShell(gh api *)',
      'PowerShell(gh pr comment *)',
      'PowerShell(gh pr review *)',
      'PowerShell(gh pr edit *)',
      'PowerShell(gh pr merge *)',
      'PowerShell(gh pr close *)',
      'PowerShell(gh pr reopen *)',
      'PowerShell(gh pr ready *)',
      'PowerShell(gh pr lock *)',
      'PowerShell(gh pr unlock *)',
      'PowerShell(gh pr revert *)',
      'PowerShell(gh pr update-branch *)',
      'PowerShell(gh pr checkout *)',
    ];

    // Rules previously generated by older installer versions that are either
    // ineffective (Write/Glob path rules the permission checker doesn't match) or
    // unsafe (a wildcard before the rest of the Bash command). Also includes the
    // bmad-notes/bmad-ledger scribe-feature entries removed when scribe was dropped.
    // checkAndSetupPermissions() prunes these from existing settings.local.json files.
    // Also includes the GitHub MCP entries removed when the GitHub MCP integration
    // was retired from the installer.
    this.deprecatedPermissions = [
      'mcp__github__pull_request_read',
      'mcp__github__get_file_contents',
      'Write(bmad-docs/**)',
      'Write(*bmad-docs*)',
      'Glob(.bmad-core/**)',
      'Glob(bmad-docs/**)',
      'Bash([ -f bmad-docs/** ])',
      'Bash([ -d bmad-docs/** ])',
      'Write(bmad-docs/bmad-notes/**)',
      'Write(*bmad-notes*)',
      'Glob(bmad-docs/bmad-notes/**)',
      'Bash([ -f bmad-docs/bmad-notes/** ])',
      'Bash([ -d bmad-docs/bmad-notes/** ])',
      'Write(bmad-ledger/**)',
      'Write(*bmad-ledger*)',
      'Glob(bmad-ledger/**)',
      'Bash([ -f bmad-ledger/** ])',
      'Bash([ -d bmad-ledger/** ])',
      // v4 layout rules (bmad-docs/, .bmad-core/) and the old project-level Atlassian MCP server,
      // retired in the v6 migration — pruned from existing settings.local.json on re-install.
      String.raw`Bash(if exist *bmad-docs\architecture* rmdir /s /q *bmad-docs\architecture*)`,
      'mcp__atlassian__getConfluencePage',
      'mcp__atlassian__getConfluencePageDescendants',
      'mcp__atlassian__getJiraIssue',
      'mcp__atlassian__searchJiraIssuesUsingJql',
      'mcp__atlassian__fetch',
      'mcp__atlassian__addCommentToJiraIssue',
      'Bash(node .bmad-core/utils/jira-attachments)',
      'Bash(node .bmad-core/utils/jira-attachments *)',
      'Bash(node .bmad-core/utils/jira-attachments/index.js)',
      'Bash(node .bmad-core/utils/jira-attachments/index.js *)',
      'Bash(node .bmad-core/utils/pr-comments *)',
      'Bash(node .bmad-core/utils/pr-comments/index.js *)',
      'Read(.bmad-core/**)',
      'Read(*/.bmad-core/**)',
      'Read(bmad-docs/**)',
      'Read(**/bmad-docs/**)',
      'Edit(bmad-docs/**)',
      'Edit(*bmad-docs*)',
      'Bash(mkdir -p bmad-docs/**)',
      'Bash(mkdir -p **/bmad-docs/**)',
      'Bash(mkdir bmad-docs/**)',
      'Bash(mkdir **/bmad-docs/**)',
      'Bash(rm -rf *bmad-docs*)',
      'Bash(rm -rf */bmad-docs/architecture*)',
      'Bash(rm *bmad-docs*)',
      'Bash(rm */bmad-docs/architecture*)',
      'Bash(rm bmad-docs/temporary/*.md)',
      'Bash(rm **/bmad-docs/temporary/*.md)',
      'Bash(if exist *bmad-docs* rmdir /s /q *bmad-docs*)',
      'Bash(mkdir *bmad-docs*)',
      'Bash(ls bmad-docs/**)',
      'Bash(ls **/bmad-docs/**)',
      'Bash(ls *bmad-docs*)',
      'Bash(ls "*bmad-docs*"*)',
      'Bash(test -f bmad-docs/**)',
      'Bash(test -f **/bmad-docs/**)',
      'Bash(test -d bmad-docs/**)',
      'Bash(test -d **/bmad-docs/**)',
      'Bash(dir bmad-docs/**)',
      'Bash(dir **/bmad-docs/**)',
      'Bash(dir *bmad-docs*)',
      'Grep(.bmad-core/**)',
      'Grep(bmad-docs/**)',
      'PowerShell(node .bmad-core/utils/pr-comments *)',
      'PowerShell(node .bmad-core/utils/pr-comments/index.js *)',
      'PowerShell(node .bmad-core/utils/jira-attachments)',
      'PowerShell(node .bmad-core/utils/jira-attachments *)',
      'PowerShell(node .bmad-core/utils/jira-attachments/index.js)',
      'PowerShell(node .bmad-core/utils/jira-attachments/index.js *)',
    ];
  }

  /**
   * Filter out deprecated/unsafe permission strings from an allow list.
   * @param {string[]} allowList
   * @returns {{kept: string[], removed: string[]}}
   */
  pruneDeprecatedPermissions(allowList) {
    const deprecated = new Set(this.deprecatedPermissions);
    const kept = [];
    const removed = [];
    for (const perm of allowList) {
      if (deprecated.has(perm)) {
        removed.push(perm);
      } else {
        kept.push(perm);
      }
    }
    return { kept, removed };
  }

  /**
   * Get the path to settings.local.json
   * @param {string} installDir - Target installation directory
   * @returns {string} Path to settings.local.json
   */
  getSettingsPath(installDir) {
    return path.join(installDir, '.claude', 'settings.local.json');
  }

  /**
   * Check if settings.local.json exists
   * @param {string} installDir - Target installation directory
   * @returns {Promise<boolean>}
   */
  async settingsExists(installDir) {
    const settingsPath = this.getSettingsPath(installDir);
    return fs.pathExists(settingsPath);
  }

  /**
   * Read existing settings.local.json
   * @param {string} installDir - Target installation directory
   * @returns {Promise<object|null>} Parsed settings or null if not found
   */
  async readSettings(installDir) {
    const settingsPath = this.getSettingsPath(installDir);

    try {
      if (!(await fs.pathExists(settingsPath))) {
        return null;
      }

      const content = await fs.readFile(settingsPath, 'utf8');

      try {
        // Try parsing with comment-json to preserve comments
        return cjson.parse(content);
      } catch {
        // Fallback to standard JSON
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not read settings.local.json: ${error.message}`));
      return null;
    }
  }

  /**
   * Write settings.local.json
   * @param {string} installDir - Target installation directory
   * @param {object} settings - Settings object to write
   * @returns {Promise<boolean>}
   */
  async writeSettings(installDir, settings) {
    const claudeDir = path.join(installDir, '.claude');
    const settingsPath = this.getSettingsPath(installDir);

    try {
      // Ensure .claude directory exists
      await fs.ensureDir(claudeDir);

      // Write with pretty formatting
      const output = cjson.stringify(settings, null, 2);
      await fs.writeFile(settingsPath, output, 'utf8');
      return true;
    } catch (error) {
      console.error(chalk.red(`Failed to write settings.local.json: ${error.message}`));
      return false;
    }
  }

  /**
   * Get list of missing BMAD permissions from current settings
   * @param {object} settings - Current settings object
   * @returns {string[]} Array of missing permission strings
   */
  getMissingPermissions(settings) {
    const existingPermissions = new Set(settings?.permissions?.allow || []);
    return this.bmadPermissions.filter((perm) => !existingPermissions.has(perm));
  }

  /**
   * Get list of missing BMAD deny rules from current settings
   * @param {object} settings - Current settings object
   * @returns {string[]} Array of missing deny rule strings
   */
  getMissingDenyPermissions(settings) {
    const existingDeny = new Set(settings?.permissions?.deny || []);
    return this.bmadDenyPermissions.filter((perm) => !existingDeny.has(perm));
  }

  /**
   * Check and setup Claude Code permissions
   * @param {string} installDir - Target installation directory
   * @param {object} spinner - Ora spinner instance (optional)
   * @returns {Promise<object>} Results object with status
   */
  async checkAndSetupPermissions(installDir, spinner = null) {
    const results = {
      settingsExisted: false,
      created: false,
      updated: false,
      skipped: false,
      permissionsAdded: 0,
      permissionsRemoved: 0,
      error: null,
    };

    try {
      const settingsPath = this.getSettingsPath(installDir);
      results.settingsExisted = await this.settingsExists(installDir);

      if (spinner) spinner.stop();

      // Always show permissions setup prompt
      console.log(chalk.cyan('\n🔧 Claude Code Permissions Setup'));
      console.log(
        chalk.dim('BMAD agents require certain permissions to work without repeated prompts.'),
      );
      console.log(
        chalk.dim(
          '(_bmad-output/ edits, the Atlassian connector, Stella helpers, and read-only gh/git for PR review - does NOT include source code changes)\n',
        ),
      );

      if (results.settingsExisted) {
        // Settings file exists - check for missing permissions
        const settings = await this.readSettings(installDir);

        if (!settings) {
          results.error = 'Could not parse existing settings.local.json';
          console.log(chalk.yellow(`⚠️  ${results.error}`));
          if (spinner) spinner.start();
          return results;
        }

        // Ensure permissions.allow array exists
        if (!settings.permissions) {
          settings.permissions = {};
        }
        if (!settings.permissions.allow) {
          settings.permissions.allow = [];
        }

        // Find missing permissions, and stale/unsafe ones from older installer versions
        const missingPermissions = this.getMissingPermissions(settings);
        const missingDeny = this.getMissingDenyPermissions(settings);
        const { kept, removed: stalePermissions } = this.pruneDeprecatedPermissions(
          settings.permissions.allow,
        );

        if (
          missingPermissions.length > 0 ||
          missingDeny.length > 0 ||
          stalePermissions.length > 0
        ) {
          // Ask user before changing permissions
          const parts = [];
          if (missingPermissions.length > 0) parts.push(`add ${missingPermissions.length} missing`);
          if (missingDeny.length > 0) parts.push(`add ${missingDeny.length} deny`);
          if (stalePermissions.length > 0)
            parts.push(`remove ${stalePermissions.length} stale/unsafe`);
          const { updateSettings } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'updateSettings',
              message: `${parts.join(' and ')} BMAD permission rule(s) in existing settings.local.json?`,
              default: true,
            },
          ]);

          if (!updateSettings) {
            console.log(chalk.yellow('⚠️  Skipping Claude Code permissions update.'));
            results.skipped = true;
            if (spinner) spinner.start();
            return results;
          }

          // Rebuild the allow list without the stale entries, then add missing ones
          settings.permissions.allow = [...kept, ...missingPermissions];
          if (missingDeny.length > 0) {
            settings.permissions.deny = [...(settings.permissions.deny || []), ...missingDeny];
          }

          const success = await this.writeSettings(installDir, settings);

          if (success) {
            results.updated = true;
            results.permissionsAdded = missingPermissions.length + missingDeny.length;
            results.permissionsRemoved = stalePermissions.length;
            console.log(chalk.green('✓ Updated .claude/settings.local.json with BMAD permissions'));
            if (missingPermissions.length > 0) {
              console.log(chalk.dim(`  - Added ${missingPermissions.length} new permission rules`));
            }
            if (missingDeny.length > 0) {
              console.log(
                chalk.dim(`  - Added ${missingDeny.length} deny rules (PR-mutating gh commands)`),
              );
            }
            if (stalePermissions.length > 0) {
              console.log(
                chalk.dim(`  - Removed ${stalePermissions.length} stale/unsafe permission rules`),
              );
            }
          } else {
            results.error = 'Failed to update settings file';
          }
        } else {
          console.log(chalk.green('✓ BMAD permissions already present in settings.local.json'));
        }
      } else {
        // Ask user if they want to create settings.local.json
        const { createSettings } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'createSettings',
            message: 'Grant Claude Code with BMAD related permissions? (Recommended)',
            default: true,
          },
        ]);

        if (!createSettings) {
          console.log(chalk.yellow('⚠️  Skipping Claude Code permissions setup.'));
          console.log(
            chalk.dim('   You may be prompted for permissions when using BMAD agents.\n'),
          );
          results.skipped = true;
          if (spinner) spinner.start();
          return results;
        }

        // Create new settings file
        const settings = {
          permissions: {
            allow: [...this.bmadPermissions],
            deny: [...this.bmadDenyPermissions],
          },
        };

        const success = await this.writeSettings(installDir, settings);

        if (success) {
          results.created = true;
          results.permissionsAdded = this.bmadPermissions.length + this.bmadDenyPermissions.length;
          console.log(chalk.green('✓ Created .claude/settings.local.json with BMAD permissions'));
          console.log(chalk.dim(`  - Added ${this.bmadPermissions.length} permission rules`));
          console.log(
            chalk.dim(
              `  - Added ${this.bmadDenyPermissions.length} deny rules (PR-mutating gh commands)`,
            ),
          );
        } else {
          results.error = 'Failed to create settings file';
        }
      }

      if (spinner) spinner.start();
      return results;
    } catch (error) {
      results.error = error.message;
      console.log(chalk.yellow(`⚠️  Could not setup Claude Code permissions: ${error.message}`));
      if (spinner) spinner.start();
      return results;
    }
  }

  /**
   * Show summary of permissions setup
   * @param {object} results - Results from checkAndSetupPermissions
   */
  showSetupSummary(results) {
    if (results.error) {
      console.log(chalk.red(`\n✗ Claude Code permissions setup failed: ${results.error}`));
      console.log(chalk.yellow('You may need to add BMAD permissions manually.'));
      this.showManualInstructions();
      return;
    }

    if (results.skipped) {
      console.log(chalk.yellow('\n⚠️  Claude Code permissions were not configured.'));
      console.log(chalk.dim('   Run the installer again or add permissions manually.'));
      return;
    }

    if (results.created) {
      console.log(chalk.green('\n✓ Claude Code permissions configured successfully!'));
      console.log(chalk.dim(`   ${results.permissionsAdded} permission rules added.`));
    } else if (results.updated) {
      console.log(chalk.green('\n✓ Claude Code permissions updated successfully!'));
      console.log(chalk.dim(`   ${results.permissionsAdded} new permission rules added.`));
    }
  }

  /**
   * Show manual setup instructions
   */
  showManualInstructions() {
    console.log(chalk.cyan('\n📋 Manual Setup Instructions:'));
    console.log(chalk.dim('1. Create .claude/settings.local.json in your project root'));
    console.log(chalk.dim('2. Add the following content:\n'));

    const exampleSettings = {
      permissions: {
        allow: [...this.bmadPermissions.slice(0, 5), '... (see full list in docs)'],
      },
    };

    console.log(chalk.dim(JSON.stringify(exampleSettings, null, 2)));
    console.log(
      chalk.dim('\nSee BMAD documentation for the complete list of required permissions.'),
    );
  }

  /**
   * Add custom permissions to an existing or new settings file
   * @param {string} installDir - Target installation directory
   * @param {string[]} customPermissions - Array of custom permission strings
   * @returns {Promise<boolean>}
   */
  async addCustomPermissions(installDir, customPermissions) {
    try {
      let settings = await this.readSettings(installDir);

      if (!settings) {
        settings = { permissions: { allow: [] } };
      }

      if (!settings.permissions) {
        settings.permissions = {};
      }
      if (!settings.permissions.allow) {
        settings.permissions.allow = [];
      }

      const existingPermissions = new Set(settings.permissions.allow);
      let addedCount = 0;

      for (const permission of customPermissions) {
        if (!existingPermissions.has(permission)) {
          settings.permissions.allow.push(permission);
          addedCount++;
        }
      }

      if (addedCount > 0) {
        await this.writeSettings(installDir, settings);
        console.log(chalk.green(`✓ Added ${addedCount} custom permissions`));
      }

      return true;
    } catch (error) {
      console.error(chalk.red(`Failed to add custom permissions: ${error.message}`));
      return false;
    }
  }

  /**
   * Get all BMAD permissions
   * @returns {string[]} Array of all BMAD permission strings
   */
  getAllPermissions() {
    return [...this.bmadPermissions];
  }

  /**
   * Get all BMAD deny rules
   * @returns {string[]} Array of all BMAD deny rule strings
   */
  getAllDenyPermissions() {
    return [...this.bmadDenyPermissions];
  }
}

module.exports = new ClaudePermissionsManager();
