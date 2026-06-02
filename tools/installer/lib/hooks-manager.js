const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('fs-extra');
const chalk = require('chalk').default || require('chalk');
const inquirer = require('inquirer').default || require('inquirer');
const cjson = require('comment-json');
const resourceLocator = require('./resource-locator');

const HOOK_SCRIPTS = ['claude_hook.js', 'package.json', 'claude-icon.png'];

const HOOK_EVENT_MAP = {
  Notification: 'claude_hook.js',
  Stop: 'claude_hook.js',
};

// PS1 filenames written by the old Windows-only implementation — removed on re-install
const STALE_PS1_NAMES = ['claude_notify.ps1', 'claude_stop_notify.ps1', 'claude_toast.ps1'];

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

  buildHookCommand() {
    const scriptPath = path.join(this.getHooksDestDir(), 'claude_hook.js');
    return `node "${scriptPath}"`;
  }

  async _runNpmInstall(destDir, spinner) {
    spinner.text = 'Installing node-notifier...';
    return new Promise((resolve, reject) => {
      const proc = spawn('npm', ['install', '--omit=dev'], {
        cwd: destDir,
        stdio: 'ignore',
        shell: true,
      });
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`npm install exited with code ${code}`));
        }
      });
      proc.on('error', reject);
    });
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

    if (!this.isWindows()) {
      const hookScript = path.join(destDir, 'claude_hook.js');
      if (await fs.pathExists(hookScript)) {
        await fs.chmod(hookScript, 0o755);
      }
    }

    await this._runNpmInstall(destDir, spinner);
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

    // Remove stale PS1 entries left by the old Windows-only implementation
    for (const event of Object.keys(settings.hooks)) {
      if (Array.isArray(settings.hooks[event])) {
        settings.hooks[event] = settings.hooks[event].filter((entry) => {
          if (!Array.isArray(entry.hooks) || entry.hooks.length === 0) return true;
          const cmd = entry.hooks[0].command;
          return typeof cmd !== 'string' || !STALE_PS1_NAMES.some((name) => cmd.includes(name));
        });
      }
    }

    const command = this.buildHookCommand();

    for (const event of Object.keys(HOOK_EVENT_MAP)) {
      if (!Array.isArray(settings.hooks[event])) {
        settings.hooks[event] = [];
      }

      const eventArray = settings.hooks[event];
      const newEntry = {
        hooks: [
          {
            type: 'command',
            command,
          },
        ],
      };

      // Find existing BMAD-managed entry by claude_hook.js in the command string
      const existingIndex = eventArray.findIndex(
        (entry) =>
          Array.isArray(entry.hooks) &&
          entry.hooks.length > 0 &&
          typeof entry.hooks[0].command === 'string' &&
          entry.hooks[0].command.includes('claude_hook.js'),
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
