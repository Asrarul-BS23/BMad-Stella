const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('fs-extra');
const chalk = require('chalk').default || require('chalk');
const inquirer = require('inquirer').default || require('inquirer');
const cjson = require('comment-json');
const resourceLocator = require('./resource-locator');

// Each plugin is a subfolder of bmad-hooks/ with its own index.js and optional package.json
const PLUGINS = [
  {
    name: 'notification',
    files: ['index.js', 'package.json', 'claude-icon.png'],
    events: {
      PermissionRequest: { matcher: '' },
      Stop: {},
    },
  },
  {
    name: 'personalization',
    files: ['index.js', 'package.json'],
    events: {
      SessionEnd: {},
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
    return path.join(this.getUserClaudeDir(), 'bmad-hooks');
  }

  getUserSettingsPath() {
    return path.join(this.getUserClaudeDir(), 'settings.json');
  }

  getHooksSourceDir() {
    return path.join(resourceLocator.getBmadCorePath(), 'bmad-hooks', 'user');
  }

  getManifestPath() {
    return path.join(this.getHooksDestDir(), '.install-manifest.json');
  }

  /**
   * Content hash of a plugin's source files. Used instead of package.json version
   * so plugin edits are detected without anyone remembering to bump a version.
   * Returns null when the plugin source is missing.
   */
  async hashPlugin(plugin, baseDir = this.getHooksSourceDir()) {
    const pluginSrcDir = path.join(baseDir, plugin.name);
    if (!(await fs.pathExists(pluginSrcDir))) return null;

    const hash = crypto.createHash('sha256');
    for (const file of [...plugin.files].sort()) {
      const filePath = path.join(pluginSrcDir, file);
      hash.update(file);
      if (await fs.pathExists(filePath)) {
        hash.update(await fs.readFile(filePath));
      }
    }
    // Registered events are part of the installed state — a change means settings.json is stale
    hash.update(JSON.stringify(plugin.events));
    return hash.digest('hex').slice(0, 16);
  }

  async getSourceState() {
    const state = {};
    for (const plugin of PLUGINS) {
      const hash = await this.hashPlugin(plugin);
      if (hash) state[plugin.name] = hash;
    }
    return state;
  }

  /** Hash of what is actually sitting in ~/.claude/bmad-hooks/ right now. */
  async getInstalledState() {
    const state = {};
    for (const plugin of PLUGINS) {
      const hash = await this.hashPlugin(plugin, this.getHooksDestDir());
      if (hash) state[plugin.name] = hash;
    }
    return state;
  }

  async readManifest() {
    try {
      const manifestPath = this.getManifestPath();
      if (!(await fs.pathExists(manifestPath))) return null;
      return JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    } catch {
      return null;
    }
  }

  async writeManifest(manifest) {
    await fs.ensureDir(this.getHooksDestDir());
    await fs.writeFile(this.getManifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
  }

  /** True when settings.json still registers this plugin for every event it declares. */
  isPluginRegistered(settings, plugin) {
    const hooks = settings && settings.hooks;
    if (!hooks || typeof hooks !== 'object') return false;

    const command = this.buildPluginCommand(plugin.name);
    return Object.keys(plugin.events).every((event) => {
      const entries = hooks[event];
      if (!Array.isArray(entries)) return false;
      return entries.some(
        (entry) =>
          Array.isArray(entry.hooks) &&
          entry.hooks.length > 0 &&
          entry.hooks[0].command === command,
      );
    });
  }

  /**
   * Decide whether the user-level hooks need attention at all.
   *   current   - installed, up to date, still registered -> stay silent
   *   declined  - user said no to this exact version -> stay silent
   *   outdated  - installed but plugin sources changed -> offer an update
   *   missing   - never installed here -> offer a first-time setup
   */
  async getHooksStatus() {
    const sourceState = await this.getSourceState();
    const manifest = await this.readManifest();

    if (!manifest || !manifest.plugins) {
      // No manifest — either a first install, or hooks installed before manifests existed.
      // Fall back to comparing the files actually on disk so an existing, current install
      // is adopted silently instead of re-prompting.
      const installedState = await this.getInstalledState();
      const settings = await this.readUserSettings();
      const adoptable =
        Object.keys(sourceState).length > 0 &&
        JSON.stringify(installedState) === JSON.stringify(sourceState) &&
        PLUGINS.every(
          (plugin) => !sourceState[plugin.name] || this.isPluginRegistered(settings, plugin),
        );

      if (adoptable) {
        // Record it so later installs take the cheap path
        try {
          await this.writeManifest({
            declined: false,
            plugins: sourceState,
            updatedAt: new Date().toISOString(),
            adopted: true,
          });
        } catch {
          // Non-fatal
        }
        return { status: 'current', sourceState };
      }

      return {
        status: Object.keys(installedState).length > 0 ? 'outdated' : 'missing',
        sourceState,
      };
    }

    const sameVersion =
      JSON.stringify(manifest.plugins) === JSON.stringify(sourceState) &&
      Object.keys(sourceState).length > 0;

    if (!sameVersion) return { status: 'outdated', sourceState, manifest };
    if (manifest.declined) return { status: 'declined', sourceState, manifest };

    // Same version — but the user may have stripped the entries out of settings.json by hand.
    // That is a deliberate opt-out, not a reason to re-install.
    const settings = await this.readUserSettings();
    const registered = PLUGINS.every(
      (plugin) => !sourceState[plugin.name] || this.isPluginRegistered(settings, plugin),
    );

    return { status: registered ? 'current' : 'declined', sourceState, manifest };
  }

  buildPluginCommand(pluginName) {
    const scriptPath = path.join(this.getHooksDestDir(), pluginName, 'index.js');
    return `"${process.execPath}" "${scriptPath}"`;
  }

  async _runNpmInstall(pluginDestDir, spinner) {
    spinner.text = `Installing dependencies for ${path.basename(pluginDestDir)}...`;
    return new Promise((resolve, reject) => {
      const proc = spawn('npm install --omit=dev', {
        cwd: pluginDestDir,
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

    for (const plugin of PLUGINS) {
      const pluginSrcDir = path.join(sourceDir, plugin.name);
      const pluginDestDir = path.join(destDir, plugin.name);

      if (!(await fs.pathExists(pluginSrcDir))) {
        console.warn(chalk.yellow(`  Warning: Plugin source not found: ${plugin.name}`));
        continue;
      }

      spinner.text = `Copying ${plugin.name}/ to ~/.claude/bmad-hooks/...`;
      await fs.copy(pluginSrcDir, pluginDestDir, { overwrite: true });

      // Seed counters.json from initial template if not present — never overwrite existing observations
      if (plugin.name === 'personalization') {
        const countersDest = path.join(pluginDestDir, 'counters.json');
        const countersInitial = path.join(pluginDestDir, 'counters.initial.json');
        if (!(await fs.pathExists(countersDest)) && (await fs.pathExists(countersInitial))) {
          await fs.copy(countersInitial, countersDest);
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

    // Remove plugin entries from events the plugin is no longer registered for
    for (const plugin of PLUGINS) {
      const activeEvents = new Set(Object.keys(plugin.events));
      for (const [event, entries] of Object.entries(settings.hooks)) {
        if (activeEvents.has(event) || !Array.isArray(entries)) continue;
        settings.hooks[event] = entries.filter((entry) => {
          if (!Array.isArray(entry.hooks) || entry.hooks.length === 0) return true;
          const cmd = entry.hooks[0].command;
          return (
            typeof cmd !== 'string' ||
            (!cmd.includes(`${plugin.name}/index.js`) && !cmd.includes(`${plugin.name}\\index.js`))
          );
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
    const { status, sourceState } = await this.getHooksStatus();

    // Notification hooks are installed once per user (~/.claude), while BMad is installed
    // per project. Only ask when there is actually something to do.
    if (status === 'current' || status === 'declined') {
      if (spinner) {
        spinner.text = 'Claude notification hooks already up to date — skipping.';
      }
      return;
    }

    if (spinner) spinner.stop();

    const isUpdate = status === 'outdated';
    const { setupHooks } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'setupHooks',
        message: isUpdate
          ? 'Claude notification hooks have been updated. Update them now?'
          : 'Do you want to set up Notification from Claude events?',
        default: true,
      },
    ]);

    if (!setupHooks) {
      console.log(chalk.yellow('⚠️  Skipping notification hooks setup.'));
      // Remember the decline so the next project install does not re-ask for this same version
      try {
        await this.writeManifest({
          declined: true,
          plugins: sourceState,
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // Non-fatal — worst case we ask again next time
      }
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

      await this.writeManifest({
        declined: false,
        plugins: sourceState,
        updatedAt: new Date().toISOString(),
      });

      if (spinner) spinner.stop();

      console.log(
        chalk.green(
          isUpdate
            ? '✓ Claude notification hooks updated!'
            : '✓ Claude notification hooks configured!',
        ),
      );
      console.log(chalk.green(`  Hook scripts → ${this.getHooksDestDir()}`));
      console.log(chalk.green('  settings.json updated (PermissionRequest + Stop events)'));
    } catch (error) {
      if (spinner) spinner.stop();
      console.log(chalk.yellow(`⚠️  Could not configure notification hooks: ${error.message}`));
      console.log(
        chalk.dim('   You can set them up manually using the scripts in bmad-core/bmad-hooks/'),
      );
    } finally {
      if (spinner) spinner.start();
    }
  }
}

module.exports = new HooksManager();
