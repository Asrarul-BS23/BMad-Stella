const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('fs-extra');
const chalk = require('chalk').default || require('chalk');
const cjson = require('comment-json');
// User-level hook sources now live in the repo's stella/ folder (v6 layout).
const USER_HOOKS_SOURCE_DIR = path.join(__dirname, '..', '..', '..', 'stella', 'hooks', 'user');

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
    return USER_HOOKS_SOURCE_DIR;
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
   * Decide whether the user-level hooks need attention.
   *   current   - installed, up to date, still registered -> nothing to do
   *   outdated  - installed but sources or registration changed -> reinstall
   *   missing   - never installed on this machine -> install
   * Installation is silent (no prompt) — user decision, v6 migration.
   */
  async getHooksStatus() {
    const sourceState = await this.getSourceState();
    const installedState = await this.getInstalledState();
    const settings = await this.readUserSettings();

    const sameFiles =
      Object.keys(sourceState).length > 0 &&
      JSON.stringify(installedState) === JSON.stringify(sourceState);
    const registered = PLUGINS.every(
      (plugin) => !sourceState[plugin.name] || this.isPluginRegistered(settings, plugin),
    );

    if (sameFiles && registered) return { status: 'current', sourceState };
    return {
      status: Object.keys(installedState).length > 0 ? 'outdated' : 'missing',
      sourceState,
    };
  }

  buildPluginCommand(pluginName) {
    const scriptPath = path.join(this.getHooksDestDir(), pluginName, 'index.js');
    return `"${process.execPath}" "${scriptPath}"`;
  }

  async _runNpmInstall(pluginDestDir, spinner) {
    if (spinner) spinner.text = `Installing dependencies for ${path.basename(pluginDestDir)}...`;
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

      if (spinner) spinner.text = `Copying ${plugin.name}/ to ~/.claude/bmad-hooks/...`;
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

  // `quiet` suppresses the console lines (the v6 installer prints its own step line).
  async setupCustomHooks(spinner, { quiet = false } = {}) {
    const { status, sourceState } = await this.getHooksStatus();

    // User-level hooks live in ~/.claude and are shared by every project on this machine.
    if (status === 'current') {
      if (spinner) spinner.text = 'User-level Claude hooks already up to date.';
      return { status, changed: false };
    }

    const isUpdate = status === 'outdated';
    try {
      if (spinner) spinner.text = 'Copying user-level Claude hook scripts...';
      await this.copyHookScripts(spinner);

      if (spinner) spinner.text = 'Registering user-level hooks in ~/.claude/settings.json...';
      const settings = await this.readUserSettings();
      this.mergeHooks(settings);
      await this.writeUserSettings(settings);

      await this.writeManifest({ plugins: sourceState, updatedAt: new Date().toISOString() });

      if (!quiet) {
        console.log(
          chalk.green(
            isUpdate ? '✓ User-level Claude hooks updated' : '✓ User-level Claude hooks installed',
          ),
        );
        console.log(chalk.green(`  Hook scripts → ${this.getHooksDestDir()}`));
        console.log(
          chalk.green('  settings.json updated (PermissionRequest + Stop + SessionEnd events)'),
        );
      }
      return { status, changed: true };
    } catch (error) {
      if (!quiet) {
        console.log(chalk.yellow(`⚠️  Could not configure user-level hooks: ${error.message}`));
        console.log(chalk.dim('   You can set them up manually from stella/hooks/user/'));
      }
      return { status, changed: false, error };
    }
  }
}

module.exports = new HooksManager();
