const os = require('node:os');
const path = require('node:path');
const fs = require('fs-extra');
const chalk = require('chalk').default || require('chalk');
const inquirer = require('inquirer').default || require('inquirer');
const cjson = require('comment-json');
const resourceLocator = require('./resource-locator');

const HOOK_SCRIPTS = ['claude_notify.ps1', 'claude_stop_notify.ps1', 'claude_toast.ps1'];

const HOOK_EVENT_MAP = {
  Notification: 'claude_notify.ps1',
  Stop: 'claude_stop_notify.ps1',
};

class HooksManager {
  isWindows() {
    return process.platform === 'win32';
  }

  getUserClaudeDir() {
    return path.join(os.homedir(), '.claude');
  }

  getHooksDestDir() {
    return path.join(this.getUserClaudeDir(), 'custom_hooks');
  }

  getUserSettingsPath() {
    return path.join(this.getUserClaudeDir(), 'settings.json');
  }

  getHooksSourceDir() {
    return path.join(resourceLocator.getBmadCorePath(), 'custom_hooks');
  }

  buildHookCommand(scriptName) {
    const scriptPath = path.join(this.getHooksDestDir(), scriptName);
    return `powershell -NoProfile -NonInteractive -File "${scriptPath}"`;
  }

  async copyHookScripts(spinner) {
    const sourceDir = this.getHooksSourceDir();
    const destDir = this.getHooksDestDir();

    await fs.ensureDir(destDir);

    for (const script of HOOK_SCRIPTS) {
      const src = path.join(sourceDir, script);
      const dest = path.join(destDir, script);

      if (await fs.pathExists(src)) {
        spinner.text = `Copying ${script} to ~/.claude/custom_hooks/...`;
        await fs.copy(src, dest, { overwrite: true });
      } else {
        console.warn(chalk.yellow(`  Warning: Hook script not found in source: ${script}`));
      }
    }
  }

  async readUserSettings() {
    const settingsPath = this.getUserSettingsPath();

    try {
      if (!(await fs.pathExists(settingsPath))) {
        return {};
      }

      const content = await fs.readFile(settingsPath, 'utf8');

      try {
        return cjson.parse(content);
      } catch {
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn(
        chalk.yellow(`  Warning: Could not read ~/.claude/settings.json: ${error.message}`),
      );
      return {};
    }
  }

  async writeUserSettings(settings) {
    const claudeDir = this.getUserClaudeDir();
    const settingsPath = this.getUserSettingsPath();

    await fs.ensureDir(claudeDir);
    await fs.writeFile(settingsPath, cjson.stringify(settings, null, 2), 'utf8');
  }

  mergeHooks(settings) {
    if (!settings.hooks || typeof settings.hooks !== 'object') {
      settings.hooks = {};
    }

    for (const [event, scriptName] of Object.entries(HOOK_EVENT_MAP)) {
      const command = this.buildHookCommand(scriptName);
      const newEntry = {
        hooks: [
          {
            type: 'command',
            command,
          },
        ],
      };

      if (!Array.isArray(settings.hooks[event])) {
        settings.hooks[event] = [];
      }

      const eventArray = settings.hooks[event];

      // Find existing BMAD-managed entry by script filename in command string
      const existingIndex = eventArray.findIndex(
        (entry) =>
          Array.isArray(entry.hooks) &&
          entry.hooks.length > 0 &&
          typeof entry.hooks[0].command === 'string' &&
          entry.hooks[0].command.includes(scriptName),
      );

      if (existingIndex === -1) {
        eventArray.push(newEntry);
      } else {
        // Replace in-place, preserving position; leave all other entries untouched
        eventArray[existingIndex] = newEntry;
      }
    }
  }

  async setupCustomHooks(spinner) {
    if (!this.isWindows()) {
      if (spinner) spinner.stop();
      console.log(chalk.dim('  Notification hooks are Windows-only — skipping.'));
      if (spinner) spinner.start();
      return;
    }

    if (spinner) spinner.stop();

    const { setupHooks } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'setupHooks',
        message: 'Do you want to set up Notification from Claude events?',
        default: true,
      },
    ]);

    if (!setupHooks) {
      console.log(chalk.yellow('⚠️  Skipping notification hooks setup.'));
      if (spinner) spinner.start();
      return;
    }

    try {
      if (spinner) spinner.start('Copying Claude notification hook scripts...');

      await this.copyHookScripts(spinner);

      if (spinner) spinner.text = 'Updating ~/.claude/settings.json with notification hooks...';

      const settings = await this.readUserSettings();
      this.mergeHooks(settings);
      await this.writeUserSettings(settings);

      if (spinner) spinner.stop();

      console.log(chalk.green('✓ Claude notification hooks configured!'));
      console.log(chalk.green(`  Hook scripts → ${this.getHooksDestDir()}`));
      console.log(chalk.green('  settings.json updated (Notification + Stop events)'));
    } catch (error) {
      if (spinner) spinner.stop();
      console.log(chalk.yellow(`⚠️  Could not configure notification hooks: ${error.message}`));
      console.log(
        chalk.dim('   You can set them up manually using the scripts in bmad-core/custom_hooks/'),
      );
    } finally {
      if (spinner) spinner.start();
    }
  }
}

module.exports = new HooksManager();
