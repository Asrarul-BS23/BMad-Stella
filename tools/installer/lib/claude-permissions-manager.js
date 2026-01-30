const fs = require('fs-extra');
const path = require('node:path');
const chalk = require('chalk').default || require('chalk');
const inquirer = require('inquirer').default || require('inquirer');
const cjson = require('comment-json');

class ClaudePermissionsManager {
  constructor() {
    // Define BMAD required permissions for Claude Code
    this.bmadPermissions = [
      // Atlassian MCP tools
      'mcp__atlassian__getConfluencePage',
      'mcp__atlassian__getConfluencePageDescendants',
      'mcp__atlassian__getJiraIssue',
      'mcp__atlassian__searchJiraIssuesUsingJql',
      'mcp__atlassian__fetch',
      'mcp__atlassian__addCommentToJiraIssue',

      'WebFetch(domain:stellaint.atlassian.net)',

      // File operations for markdown files
      'Write(bmad-docs/**)',
      'Write(**/*.md)',
      'Edit(bmad-docs/**)',
      'Edit(**/*.md)',

      // Bash commands for directory operations (Unix)
      'Bash(mkdir -p bmad-docs/**)',
      'Bash(mkdir -p **/bmad-docs/**)',
      'Bash(mkdir bmad-docs/**)',
      'Bash(mkdir **/bmad-docs/**)',
      'Bash(rm -rf bmad-docs/architecture)',
      'Bash(rm -rf bmad-docs/architecture/)',
      'Bash(rm -rf **/bmad-docs/architecture)',
      'Bash(rm -rf **/bmad-docs/architecture/)',
      'Bash(rm bmad-docs/temporary/*.md)',
      'Bash(rm **/bmad-docs/temporary/*.md)',

      // Bash commands for directory operations (Windows)
      'Bash(if exist *bmad-docs* rmdir /s /q *bmad-docs*)',
      String.raw`Bash(if exist *bmad-docs\architecture* rmdir /s /q *bmad-docs\architecture*)`,
      'Bash(mkdir *bmad-docs*)',

      // Directory listing and existence checks (Unix)
      'Bash(ls bmad-docs/**)',
      'Bash(ls **/bmad-docs/**)',
      'Bash(test -f bmad-docs/**)',
      'Bash(test -f **/bmad-docs/**)',
      'Bash(test -d bmad-docs/**)',
      'Bash(test -d **/bmad-docs/**)',
      'Bash([ -f bmad-docs/** ])',
      'Bash([ -d bmad-docs/** ])',

      // Directory listing (Windows)
      'Bash(dir bmad-docs/**)',
      'Bash(dir **/bmad-docs/**)',
      'Bash(dir *bmad-docs*)',
    ];
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
          '(Only for bmad-docs/ and Atlassian MCP - does NOT include source code changes)\n',
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

        // Find missing permissions
        const missingPermissions = this.getMissingPermissions(settings);

        if (missingPermissions.length > 0) {
          // Ask user before adding permissions
          const { updateSettings } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'updateSettings',
              message: `Add ${missingPermissions.length} missing BMAD permissions to existing settings.local.json?`,
              default: true,
            },
          ]);

          if (!updateSettings) {
            console.log(chalk.yellow('⚠️  Skipping Claude Code permissions update.'));
            results.skipped = true;
            if (spinner) spinner.start();
            return results;
          }

          // Add missing permissions
          settings.permissions.allow.push(...missingPermissions);

          const success = await this.writeSettings(installDir, settings);

          if (success) {
            results.updated = true;
            results.permissionsAdded = missingPermissions.length;
            console.log(chalk.green('✓ Updated .claude/settings.local.json with BMAD permissions'));
            console.log(chalk.dim(`  - Added ${missingPermissions.length} new permission rules`));
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
          },
        };

        const success = await this.writeSettings(installDir, settings);

        if (success) {
          results.created = true;
          results.permissionsAdded = this.bmadPermissions.length;
          console.log(chalk.green('✓ Created .claude/settings.local.json with BMAD permissions'));
          console.log(chalk.dim(`  - Added ${this.bmadPermissions.length} permission rules`));
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
}

module.exports = new ClaudePermissionsManager();
