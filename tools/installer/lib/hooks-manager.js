const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('fs-extra');
const chalk = require('chalk').default || require('chalk');
const inquirer = require('inquirer').default || require('inquirer');
const cjson = require('comment-json');
const resourceLocator = require('./resource-locator');

// Each plugin is a subfolder of custom_hooks/ with its own index.js and optional package.json
const PLUGINS = [
  {
    name: 'notification',
    files: ['index.js', 'package.json', 'claude-icon.png'],
    events: {
      PermissionRequest: { matcher: '' },
      Stop: {},
    },
  },
];

// Hook event names no longer managed — matching entries removed from settings.json on re-install
const STALE_HOOK_EVENTS = ['Notification'];

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

  buildPluginCommand(pluginName) {
    const scriptPath = path.join(this.getHooksDestDir(), pluginName, 'index.js');
    return `node "${scriptPath}"`;
  }

  async _runNpmInstall(pluginDestDir, spinner) {
    spinner.text = `Installing dependencies for ${path.basename(pluginDestDir)}...`;
    return new Promise((resolve, reject) => {
      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const proc = spawn(npmCmd, ['install', '--omit=dev'], {
        cwd: pluginDestDir,
        stdio: 'ignore',
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

    for (const plugin of PLUGINS) {
      const pluginSrcDir = path.join(sourceDir, plugin.name);
      const pluginDestDir = path.join(destDir, plugin.name);

      await fs.ensureDir(pluginDestDir);

      for (const file of plugin.files) {
        const src = path.join(pluginSrcDir, file);
        const dest = path.join(pluginDestDir, file);

        if (await fs.pathExists(src)) {
          spinner.text = `Copying ${plugin.name}/${file} to ~/.claude/custom_hooks/...`;
          await fs.copy(src, dest, { overwrite: true });
        } else {
          console.warn(chalk.yellow(`  Warning: Hook file not found: ${plugin.name}/${file}`));
        }
      }

      if (!this.isWindows()) {
        const entry = path.join(pluginDestDir, 'index.js');
        if (await fs.pathExists(entry)) {
          await fs.chmod(entry, 0o755);
        }
      }

      if (plugin.files.includes('package.json')) {
        await this._runNpmInstall(pluginDestDir, spinner);
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

    // Remove claude_hook.js entries from events we no longer manage
    for (const event of STALE_HOOK_EVENTS) {
      if (Array.isArray(settings.hooks[event])) {
        settings.hooks[event] = settings.hooks[event].filter((entry) => {
          if (!Array.isArray(entry.hooks) || entry.hooks.length === 0) return true;
          const cmd = entry.hooks[0].command;
          return typeof cmd !== 'string' || !cmd.includes('claude_hook.js');
        });
        if (settings.hooks[event].length === 0) delete settings.hooks[event];
      }
    }

    for (const plugin of PLUGINS) {
      const command = this.buildPluginCommand(plugin.name);

      for (const [event, extra] of Object.entries(plugin.events)) {
        if (!Array.isArray(settings.hooks[event])) {
          settings.hooks[event] = [];
        }

        const eventArray = settings.hooks[event];
        const newEntry = {
          ...extra,
          hooks: [{ type: 'command', command }],
        };

        // Match existing entry for this plugin by its index.js path
        const existingIndex = eventArray.findIndex(
          (entry) =>
            (Array.isArray(entry.hooks) &&
              entry.hooks.length > 0 &&
              typeof entry.hooks[0].command === 'string' &&
              entry.hooks[0].command.includes(`${plugin.name}/index.js`)) ||
            entry.hooks[0].command.includes(`${plugin.name}\\index.js`),
        );

        if (existingIndex === -1) {
          eventArray.push(newEntry);
        } else {
          eventArray[existingIndex] = newEntry;
        }
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
      console.log(chalk.green('  settings.json updated (PermissionRequest + Stop events)'));
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
