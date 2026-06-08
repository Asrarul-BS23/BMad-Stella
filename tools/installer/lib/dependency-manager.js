const { execSync } = require('node:child_process');
const fs = require('fs-extra');
const path = require('node:path');
const chalk = require('chalk');
const inquirer = require('inquirer');

class DependencyManager {
  constructor() {
    this.requiredMcpServers = {
      atlassian: {
        name: 'Atlassian MCP Server',
        description:
          'Required for JIRA integration (retrieve-ticket-information, comment-plan commands)',
        transport: 'sse',
        url: 'https://mcp.atlassian.com/v1/sse',
        envVars: {
          JIRA_BASE_URL: {
            description: 'Your JIRA instance URL (e.g., https://yourcompany.atlassian.net)',
            required: true,
            example: 'https://stellaint.atlassian.net',
          },
        },
      },
      github: {
        name: 'GitHub MCP Server',
        description:
          'GitHub integration for repository, issue, and pull request operations (authenticates with a GitHub personal access token)',
        transport: 'http',
        url: 'https://api.githubcopilot.com/mcp/',
        envVars: {},
        // GitHub's remote MCP server authenticates with a Personal Access Token sent as
        // 'Authorization: Bearer <token>' — not OAuth. To keep the token out of Claude's
        // config, the installer stores it in the project's git-ignored .env and registers
        // the server with a `headersHelper` that reads it at connection time. See:
        // https://code.claude.com/docs/en/mcp  and
        // https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-claude.md
        tokenAuth: {
          prompt:
            'GitHub Personal Access Token (fine-grained, create at https://github.com/settings/personal-access-tokens):',
          envVar: 'GITHUB_PERSONAL_ACCESS_TOKEN',
          helpUrl: 'https://github.com/settings/personal-access-tokens',
          // Relative to the installed project root; the helper is copied here from bmad-core/utils/.
          helperRelPath: '.bmad-core/utils/github-mcp-auth.js',
        },
      },
    };
  }

  /**
   * Check if Claude CLI is installed
   * @returns {boolean}
   */
  isClaudeCLIInstalled() {
    try {
      execSync('claude --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of installed MCP servers with their status
   * @param {string} installDir - Target installation directory
   * @returns {Promise<Array<{name: string, connected: boolean}>>} - Array of MCP servers with status
   */
  async getInstalledMcpServers(installDir) {
    try {
      const output = execSync('claude mcp list', {
        cwd: installDir,
        encoding: 'utf8',
        stdio: 'pipe',
      });

      // Parse the output to extract server names and status
      const servers = [];
      const lines = output.split('\n');
      for (const line of lines) {
        // Look for lines that contain server names
        // Check if line indicates connected status (✓, connected, etc.)
        const match = line.trim().match(/^(\w+)/);
        if (match && match[1]) {
          servers.push({
            name: match[1].toLowerCase(),
            connected: line.includes('connected') || line.includes('✓'),
          });
        }
      }

      return servers;
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not list MCP servers'), error.message);
      return [];
    }
  }

  /**
   * Check if a specific MCP server is installed
   * @param {string} installDir - Target installation directory
   * @param {string} serverName - MCP server name to check
   * @returns {Promise<boolean>}
   */
  async isMcpServerInstalled(installDir, serverName) {
    try {
      const installedServers = await this.getInstalledMcpServers(installDir);
      return installedServers.some((s) => s.name === serverName.toLowerCase());
    } catch {
      return false;
    }
  }

  /**
   * Check if a specific MCP server is connected/authenticated
   * @param {string} installDir - Target installation directory
   * @param {string} serverName - MCP server name to check
   * @returns {Promise<boolean>}
   */
  async isMcpServerConnected(installDir, serverName) {
    try {
      const installedServers = await this.getInstalledMcpServers(installDir);
      const server = installedServers.find((s) => s.name === serverName.toLowerCase());
      return server ? server.connected : false;
    } catch {
      return false;
    }
  }

  /**
   * Add MCP server using Claude CLI
   * @param {string} installDir - Target installation directory
   * @param {string} serverName - MCP server name
   * @param {object} serverConfig - Server configuration
   * @param {object} envValues - Environment variable values
   * @returns {Promise<boolean>}
   */
  async addMcpServer(installDir, serverName, serverConfig, envValues = {}) {
    try {
      // Build the command
      let command = `claude mcp add --transport ${serverConfig.transport} ${serverName} ${serverConfig.url}`;

      // Add environment variables
      for (const [envVar, value] of Object.entries(envValues)) {
        if (value) {
          command += ` --env ${envVar}=${value}`;
        }
      }

      console.log(chalk.cyan(`\n📦 Adding ${serverConfig.name || serverName}...`));
      console.log(chalk.dim(`   Command: ${command}`));

      execSync(command, {
        cwd: installDir,
        stdio: 'inherit',
      });

      console.log(chalk.green(`✓ Successfully added ${serverConfig.name || serverName}`));

      return true;
    } catch (error) {
      console.error(
        chalk.red(`\n✗ Failed to add ${serverConfig.name || serverName}:`),
        error.message,
      );
      return false;
    }
  }

  /**
   * Register an MCP server from a full JSON definition via `claude mcp add-json`.
   * Used for servers that need fields the `--transport/--env/--header` flags can't
   * express — e.g. GitHub's `headersHelper`. The JSON is passed as a single shell
   * argument, platform-quoted so embedded quotes/backslashes survive intact.
   * @param {string} installDir
   * @param {string} serverName
   * @param {object} serverDef - the server entry object (type, url, headersHelper, …)
   * @returns {Promise<boolean>}
   */
  async addMcpServerJson(installDir, serverName, serverDef) {
    try {
      const json = JSON.stringify(serverDef);
      const command = `claude mcp add-json ${serverName} ${this._shellQuoteArg(json)}`;

      console.log(chalk.cyan(`\n📦 Adding ${serverName} (JSON config)...`));
      console.log(chalk.dim(`   Command: claude mcp add-json ${serverName} '${json}'`));

      execSync(command, { cwd: installDir, stdio: 'inherit' });

      console.log(chalk.green(`✓ Successfully added ${serverName}`));
      return true;
    } catch (error) {
      console.error(chalk.red(`\n✗ Failed to add ${serverName}:`), error.message);
      return false;
    }
  }

  /**
   * Quote a single argument for the platform shell that execSync uses
   * (cmd.exe on Windows, /bin/sh elsewhere) so JSON survives unmangled.
   *
   * On Windows the naive `"` → `\"` substitution breaks when the value contains
   * backslashes (e.g. file paths), because the MSVCRT argv parser counts the
   * backslash run that precedes a quote. We follow the documented rules: double a
   * run of N backslashes to 2N (and 2N+1) only when it precedes a `"` or the
   * closing quote. JSON has no cmd metacharacters (& | < > ^) so cmd-level escaping
   * isn't needed here.
   * @param {string} arg
   * @returns {string}
   */
  _shellQuoteArg(arg) {
    const str = String(arg);
    if (process.platform !== 'win32') {
      // POSIX sh: single-quote (JSON contains no single quotes); handle any defensively.
      return `'${str.replaceAll("'", `'\\''`)}'`;
    }
    let out = '"';
    let backslashes = 0;
    for (const ch of str) {
      if (ch === '\\') {
        backslashes += 1;
      } else if (ch === '"') {
        out += '\\'.repeat(backslashes * 2 + 1) + '"';
        backslashes = 0;
      } else {
        out += '\\'.repeat(backslashes) + ch;
        backslashes = 0;
      }
    }
    // Trailing backslashes precede the closing quote, so they must be doubled.
    out += '\\'.repeat(backslashes * 2) + '"';
    return out;
  }

  /**
   * Prompt (masked) for a token, returning the trimmed token or null if the user
   * leaves it blank (caller should skip that server).
   * @param {object} tokenAuth - serverConfig.tokenAuth ({prompt})
   * @returns {Promise<string|null>}
   */
  async promptForToken(tokenAuth) {
    const { token } = await inquirer.prompt([
      {
        type: 'password',
        name: 'token',
        mask: '*',
        message: tokenAuth.prompt || 'Enter access token:',
        validate: (input) => {
          if (!input || !input.trim()) return true; // allow blank → caller skips
          if (input.trim().length < 8)
            return 'That token looks too short — paste the full token, or leave blank to skip';
          return true;
        },
        // Strip a pasted 'Bearer ' prefix and surrounding whitespace; we add the scheme ourselves.
        filter: (input) => (input ? input.trim().replace(/^Bearer\s+/i, '') : input),
      },
    ]);

    return token && token.trim() ? token.trim() : null;
  }

  /**
   * Upsert a single KEY=value into the project's git-ignored .env (mode 0600),
   * preserving all other lines. Used to store the GitHub PAT that the
   * github-mcp-auth headersHelper reads at connection time.
   * @param {string} installDir
   * @param {string} key
   * @param {string} value
   * @returns {Promise<{ok: boolean, envPath: string, error: string|null}>}
   */
  async persistEnvVar(installDir, key, value) {
    const fsp = require('node:fs/promises');
    const envPath = path.join(installDir, '.env');
    const out = { ok: false, envPath, error: null };

    try {
      let existing = '';
      try {
        existing = await fsp.readFile(envPath, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }

      const quoted = /[\s#"'=]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
      const lines = existing.split(/\r?\n/);
      let replaced = false;
      const next = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        const eq = trimmed.indexOf('=');
        if (eq !== -1 && trimmed.slice(0, eq).trim() === key) {
          replaced = true;
          return `${key}=${quoted}`;
        }
        return line;
      });
      if (!replaced) {
        while (next.length > 0 && next.at(-1).trim() === '') next.pop();
        next.push(`${key}=${quoted}`);
      }
      const output = `${next.join('\n').replace(/\n*$/, '')}\n`;

      // temp + rename so mode is enforced before the data lands at envPath
      const tmpPath = `${envPath}.${process.pid}.${Date.now()}.tmp`;
      await fsp.mkdir(path.dirname(envPath), { recursive: true });
      await fsp.writeFile(tmpPath, output, { encoding: 'utf8', mode: 0o600 });
      try {
        await fsp.chmod(tmpPath, 0o600);
      } catch {
        // best-effort on Windows (ACLs apply)
      }
      await fsp.rename(tmpPath, envPath);
      try {
        await fsp.chmod(envPath, 0o600);
      } catch {
        // best-effort on Windows
      }
      out.ok = true;
    } catch (error) {
      out.error = error.message;
    }
    return out;
  }

  /**
   * Prompt user for environment variables
   * @param {object} envVarsConfig - Environment variables configuration
   * @returns {Promise<object>} - Object with environment variable values
   */
  async promptForEnvVars(envVarsConfig) {
    const envValues = {};

    for (const [envVar, config] of Object.entries(envVarsConfig)) {
      const { value } = await inquirer.prompt([
        {
          type: 'input',
          name: 'value',
          message: `Enter ${config.description}:`,
          default: config.example || '',
          validate: (input) => {
            if (config.required && !input.trim()) {
              return 'This value is required';
            }
            // Validate URL format for JIRA_BASE_URL
            if (envVar === 'JIRA_BASE_URL' && input.trim()) {
              try {
                new URL(input);
                return true;
              } catch {
                return 'Please enter a valid URL (e.g., https://yourcompany.atlassian.net)';
              }
            }
            return true;
          },
        },
      ]);

      envValues[envVar] = value;
    }

    return envValues;
  }

  /**
   * Check and install all required MCP servers
   * @param {string} installDir - Target installation directory
   * @param {object} spinner - Ora spinner instance
   * @returns {Promise<object>} - Object with installation results
   */
  async checkAndInstallMcpServers(installDir, spinner = null) {
    const results = {
      checked: [],
      installed: [],
      failed: [],
      skipped: [],
      alreadyConfigured: [],
    };

    // Check if Claude CLI is installed
    if (!this.isClaudeCLIInstalled()) {
      console.log(
        chalk.yellow(
          '\n⚠️  Claude CLI is not installed. MCP servers cannot be configured automatically.',
        ),
      );
      console.log(
        chalk.dim('   Install Claude CLI from: https://github.com/anthropics/claude-cli'),
      );
      console.log(
        chalk.dim('   You can configure MCP servers manually later using the Claude CLI.'),
      );
      return results;
    }

    if (spinner) {
      spinner.stop();
    }

    console.log(chalk.cyan('\n🔧 MCP Server Configuration'));
    console.log(
      chalk.bold.yellow.bgRed(
        ' ⚠️  IMPORTANT: This is a MULTISELECT! Use SPACEBAR to toggle each option! ',
      ),
    );
    console.log(chalk.bold.magenta('🔸 Use arrow keys to navigate'));
    console.log(chalk.bold.magenta('🔸 Use SPACEBAR to select/deselect MCP servers'));
    console.log(chalk.bold.magenta('🔸 Press ENTER when finished selecting\n'));

    // Ask which MCP servers to configure
    const { selectedMcpServers } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedMcpServers',
        message:
          'Which MCP servers do you want to configure? (Select with SPACEBAR, confirm with ENTER):',
        choices: [
          {
            name: 'Atlassian (for JIRA integration)',
            value: 'atlassian',
            checked: true,
          },
          {
            name: 'GitHub (for repository, issue, and PR integration)',
            value: 'github',
            checked: true,
          },
          {
            name: 'Other (custom MCP server)',
            value: 'other',
          },
        ],
      },
    ]);

    // If no MCP servers selected
    if (selectedMcpServers.length === 0) {
      console.log(chalk.yellow('\n⚠️  No MCP servers selected for configuration.'));
      console.log(
        chalk.yellow(
          'Some features (retrieve-ticket-information, comment-plan) may not work without MCP servers.',
        ),
      );
      if (spinner) spinner.start();
      return results;
    }

    // Process Atlassian if selected
    let atlassianBaseUrl = null;
    if (selectedMcpServers.includes('atlassian')) {
      const serverName = 'atlassian';
      const serverConfig = this.requiredMcpServers[serverName];
      results.checked.push(serverName);

      console.log(chalk.cyan(`\n📦 Configuring ${serverConfig.name}...`));

      // Check if server is already configured
      const isInstalled = await this.isMcpServerInstalled(installDir, serverName);

      if (isInstalled) {
        console.log(chalk.green(`✓ ${serverConfig.name} is already configured`));
        results.alreadyConfigured.push(serverName);
      } else {
        // Prompt for environment variables
        console.log(chalk.dim(`   ${serverConfig.description}\n`));
        const envValues = await this.promptForEnvVars(serverConfig.envVars);
        atlassianBaseUrl = envValues.JIRA_BASE_URL || null;

        // Add the MCP server
        const installSuccess = await this.addMcpServer(
          installDir,
          serverName,
          serverConfig,
          envValues,
        );

        if (installSuccess) {
          results.installed.push(serverName);
        } else {
          results.failed.push(serverName);
        }
      }
      // Jira attachment-helper credentials are collected after ALL MCP servers are
      // configured (see below), so the credential prompts don't interrupt the
      // server-by-server setup. atlassianBaseUrl captured above is reused there.
    }

    // Process GitHub if selected. GitHub's remote MCP server authenticates with a
    // Personal Access Token. We keep the token out of Claude's config: it's written to
    // the project's git-ignored .env, and the server is registered with a `headersHelper`
    // that reads it at connection time (see .bmad-core/utils/github-mcp-auth.js).
    if (selectedMcpServers.includes('github')) {
      const serverName = 'github';
      const serverConfig = this.requiredMcpServers[serverName];
      const { tokenAuth } = serverConfig;
      results.checked.push(serverName);

      console.log(chalk.cyan(`\n📦 Configuring ${serverConfig.name}...`));
      console.log(chalk.dim(`   ${serverConfig.description}\n`));

      // Check if server is already configured
      const isInstalled = await this.isMcpServerInstalled(installDir, serverName);

      if (isInstalled) {
        console.log(chalk.green(`✓ ${serverConfig.name} is already configured`));
        results.alreadyConfigured.push(serverName);
      } else {
        console.log(
          chalk.dim(
            `   Create a fine-grained token at ${tokenAuth.helpUrl} with access to the repositories you want Claude to work with.`,
          ),
        );
        const token = await this.promptForToken(tokenAuth);

        if (token) {
          // 1. Persist the PAT to the git-ignored .env (the headersHelper reads it).
          const envResult = await this.persistEnvVar(installDir, tokenAuth.envVar, token);
          if (envResult.ok) {
            console.log(
              chalk.green(
                `✓ Stored ${tokenAuth.envVar} in ${path.relative(installDir, envResult.envPath) || '.env'} (git-ignored)`,
              ),
            );

            // 2. Register the server with a headersHelper that reads the token at connect time.
            //    Absolute path → local scope in ~/.claude.json; no token is stored in config.
            const helperPath = path.join(installDir, tokenAuth.helperRelPath);
            const serverDef = {
              type: 'http',
              url: serverConfig.url,
              headersHelper: `node "${helperPath}"`,
            };
            const installSuccess = await this.addMcpServerJson(installDir, serverName, serverDef);

            if (installSuccess) {
              results.installed.push(serverName);
              console.log(
                chalk.dim(
                  '   Note: on first connect Claude Code will ask you to trust this workspace (the helper runs a local command). Accept it, then run /mcp.',
                ),
              );
            } else {
              results.failed.push(serverName);
            }
          } else {
            console.log(
              chalk.red(`✗ Could not write ${tokenAuth.envVar} to .env: ${envResult.error}`),
            );
            results.failed.push(serverName);
          }
        } else {
          console.log(chalk.yellow('⚠️  No token provided — skipping GitHub MCP setup.'));
          console.log(
            chalk.cyan(
              `      Add ${tokenAuth.envVar} to .env later, then re-run the installer to register the GitHub MCP server.`,
            ),
          );
          results.skipped.push(serverName);
        }
      }
    }

    // Process Other (custom) MCP servers if selected
    if (selectedMcpServers.includes('other')) {
      let addAnother = true;
      let customServerCount = 0;

      while (addAnother) {
        console.log(chalk.cyan(`\n📦 Adding Custom MCP Server ${customServerCount + 1}...`));

        // Prompt for custom MCP server details
        const customMcpDetails = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Enter MCP server name (e.g., atlassian, custom-server):',
            validate: (input) => {
              if (!input.trim()) {
                return 'Server name is required';
              }
              // Check if name is valid (alphanumeric and hyphens only)
              if (!/^[a-z0-9-]+$/.test(input)) {
                return 'Server name must contain only lowercase letters, numbers, and hyphens';
              }
              return true;
            },
          },
          {
            type: 'input',
            name: 'url',
            message: 'Enter MCP server URL (e.g., https://mcp.example.com/v1/sse):',
            validate: (input) => {
              if (!input.trim()) {
                return 'Server URL is required';
              }
              try {
                new URL(input);
                return true;
              } catch {
                return 'Please enter a valid URL';
              }
            },
          },
        ]);

        const customServerName = customMcpDetails.name.toLowerCase();
        results.checked.push(customServerName);

        // Check if server is already configured
        const isInstalled = await this.isMcpServerInstalled(installDir, customServerName);

        if (isInstalled) {
          console.log(chalk.green(`✓ ${customServerName} is already configured`));
          results.alreadyConfigured.push(customServerName);
        } else {
          // Create custom server config
          const customServerConfig = {
            name: customServerName,
            description: 'Custom MCP Server',
            transport: 'sse',
            url: customMcpDetails.url,
            envVars: {},
          };

          // Add the custom MCP server
          const installSuccess = await this.addMcpServer(
            installDir,
            customServerName,
            customServerConfig,
            {},
          );

          if (installSuccess) {
            results.installed.push(customServerName);
          } else {
            results.failed.push(customServerName);
          }
        }

        customServerCount++;

        // Ask if user wants to add another custom MCP server
        const { addMore } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'addMore',
            message: 'Would you like to add another custom MCP server?',
            default: false,
          },
        ]);

        addAnother = addMore;
      }
    }

    // Collect Jira API credentials for the attachment helper (complements MCP's text-only fetch).
    // Runs only when Atlassian was selected, and AFTER all MCP servers are configured so the
    // credential prompts come at the end rather than interrupting server-by-server setup.
    if (selectedMcpServers.includes('atlassian')) {
      try {
        const jiraCredentialsManager = require('./jira-credentials-manager');
        results.jiraCredentials = await jiraCredentialsManager.promptAndPersist(installDir, {
          knownBaseUrl: atlassianBaseUrl,
        });
      } catch (error) {
        console.log(
          chalk.yellow(`⚠️  Jira credential setup skipped due to error: ${error.message}`),
        );
        results.jiraCredentials = { ok: false, skipped: true, error: error.message };
      }
    }

    if (spinner) spinner.start();
    return results;
  }

  /**
   * Show MCP server installation summary
   * @param {object} results - Installation results
   * @param {string} installDir - Target installation directory
   */
  async showInstallationSummary(results, installDir) {
    // Combine all servers that need status checking
    const allConfiguredServers = [...results.installed, ...results.alreadyConfigured];

    if (allConfiguredServers.length > 0) {
      if (results.installed.length > 0) {
        console.log(chalk.green(`\n✅ Configured ${results.installed.length} MCP server(s):`));
        for (const server of results.installed) {
          console.log(chalk.green(`   - ${server}`));
        }
      }

      if (results.alreadyConfigured.length > 0) {
        console.log(
          chalk.green(`\n✅ Already configured ${results.alreadyConfigured.length} MCP server(s):`),
        );
        for (const server of results.alreadyConfigured) {
          console.log(chalk.green(`   - ${server}`));
        }
      }

      // Check connection status for all configured servers
      console.log(chalk.cyan('\n🔐 Checking authentication status...'));
      const unauthenticatedServers = [];

      for (const server of allConfiguredServers) {
        const isConnected = await this.isMcpServerConnected(installDir, server);
        if (isConnected) {
          console.log(chalk.green(`   ✓ ${server} is connected and authenticated`));
        } else {
          console.log(chalk.yellow(`   ⚠️  ${server} is not authenticated`));
          unauthenticatedServers.push(server);
        }
      }

      // Show authentication instructions for unauthenticated servers
      if (unauthenticatedServers.length > 0) {
        console.log(chalk.yellow('\n⚠️  Authentication Required:'));
        console.log(
          chalk.yellow(
            `   ${unauthenticatedServers.length} MCP server(s) need authentication to work properly`,
          ),
        );
        console.log(chalk.cyan('\n   To authenticate:'));
        console.log(chalk.cyan('   1. Open Claude Code CLI in your project directory'));
        console.log(chalk.cyan('   2. Run: /mcp'));
        console.log(chalk.cyan('   3. Follow the browser authentication flow for each server'));
        console.log(chalk.dim('\n   Unauthenticated servers:'));
        for (const server of unauthenticatedServers) {
          console.log(chalk.dim(`      - ${server}`));
        }
      } else {
        console.log(chalk.green('\n✨ All MCP servers are authenticated and ready to use!\n'));
      }
    }

    if (results.failed.length > 0) {
      console.log(chalk.red(`\n❌ Failed to configure ${results.failed.length} MCP server(s):`));
      for (const server of results.failed) {
        console.log(chalk.red(`   - ${server}`));
      }
      console.log(chalk.yellow('\n⚠️  Some features may not work without these MCP servers.'));
      console.log(chalk.yellow('   You can configure them manually later using:'));
      for (const server of results.failed) {
        const serverConfig = this.requiredMcpServers[server];
        if (serverConfig && serverConfig.tokenAuth) {
          // Token-auth servers (e.g. GitHub) are registered via .env + headersHelper,
          // which is awkward to type by hand — point the user back at the installer.
          console.log(
            chalk.cyan(
              `      Set ${serverConfig.tokenAuth.envVar} in .env, then re-run the installer to register ${server}.`,
            ),
          );
        } else if (serverConfig) {
          let command = `claude mcp add --transport ${serverConfig.transport} ${server} ${serverConfig.url}`;
          if (serverConfig.envVars && Object.keys(serverConfig.envVars).length > 0) {
            for (const [envVar] of Object.entries(serverConfig.envVars)) {
              command += ` --env ${envVar}=<${envVar.toLowerCase()}>`;
            }
          }
          console.log(chalk.cyan(`      ${command}`));
        } else {
          // Custom server that failed
          console.log(
            chalk.cyan(
              `      claude mcp add --transport sse ${server} <url> # Re-run installer to configure`,
            ),
          );
        }
      }
    }

    if (
      results.checked.length === 0 ||
      (results.installed.length === 0 &&
        results.alreadyConfigured.length === 0 &&
        results.failed.length === 0)
    ) {
      console.log(chalk.yellow('\n⚠️  No MCP servers were configured.'));
      console.log(
        chalk.yellow(
          '   Some features (retrieve-ticket-information, comment-plan) may not work without MCP servers.',
        ),
      );
      console.log(
        chalk.yellow('\n   You can configure them later by running the installer again.'),
      );
    }
  }
}

module.exports = new DependencyManager();
