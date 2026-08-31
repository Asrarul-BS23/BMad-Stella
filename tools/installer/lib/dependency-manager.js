const { execSync } = require('node:child_process');
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
        // Atlassian retired the SSE endpoint (mcp.atlassian.com/v1/sse) on 2026-06-30 in favor
        // of Streamable HTTP. See:
        // https://community.atlassian.com/forums/Atlassian-Remote-MCP-Server/HTTP-SSE-Deprecation-Notice/ba-p/3205484
        transport: 'http',
        url: 'https://mcp.atlassian.com/v1/mcp',
        envVars: {
          JIRA_BASE_URL: {
            description: 'Your JIRA instance URL (e.g., https://yourcompany.atlassian.net)',
            required: true,
            example: 'https://stellaint.atlassian.net',
          },
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
    let output;
    try {
      output = execSync('claude mcp list', {
        cwd: installDir,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      // `claude mcp list` exits non-zero when ANY configured server is unhealthy — e.g. a
      // server that is registered but not yet authenticated. It still prints per-server
      // status to stdout, so parse that rather than discarding every server's status
      // (otherwise one pending server would mask a healthy one like Atlassian).
      output = error.stdout ? String(error.stdout) : '';
      if (!output) {
        console.warn(chalk.yellow('Warning: Could not list MCP servers'), error.message);
        return [];
      }
    }

    // Parse the output to extract server names and status. Example line:
    //   atlassian: https://mcp.atlassian.com/v1/mcp (HTTP) - ✔ Connected
    // Detection must be robust to Claude Code's formatting: it uses ✔ (U+2714, heavy
    // check) — not ✓ (U+2713) — and capitalized "Connected". Match either check glyph,
    // or the word "connected" case-insensitively while excluding failure/disconnected text.
    const servers = [];
    const lines = output.split('\n');
    for (const line of lines) {
      const match = line.trim().match(/^(\w+):\s*(\S+)/);
      if (match && match[1]) {
        const lower = line.toLowerCase();
        const connected =
          line.includes('✔') || // ✔ heavy check mark (current Claude Code)
          line.includes('✓') || // ✓ check mark (older versions)
          (/\bconnected\b/.test(lower) && !/disconnected|not connected|fail/.test(lower));
        servers.push({ name: match[1].toLowerCase(), url: match[2], connected });
      }
    }

    return servers;
  }

  /**
   * Check whether an installed server's URL is the retired Atlassian SSE endpoint.
   * Keyed on the URL string only — never on connected status, since "not connected"
   * can just mean pending authentication and must not trigger a remove/re-add.
   * @param {string} installDir
   * @param {string} serverName
   * @returns {Promise<boolean>}
   */
  async isStaleAtlassianSseServer(installDir, serverName) {
    const installedServers = await this.getInstalledMcpServers(installDir);
    const server = installedServers.find((s) => s.name === serverName.toLowerCase());
    return Boolean(server && server.url && server.url.includes('v1/sse'));
  }

  /**
   * Remove an MCP server via `claude mcp remove`.
   * @param {string} installDir
   * @param {string} serverName
   * @returns {Promise<boolean>}
   */
  async removeMcpServer(installDir, serverName) {
    try {
      console.log(chalk.cyan(`\n🗑️  Removing outdated ${serverName} MCP server...`));
      execSync(`claude mcp remove ${serverName}`, {
        cwd: installDir,
        stdio: 'inherit',
      });
      return true;
    } catch (error) {
      console.error(chalk.red(`\n✗ Failed to remove ${serverName}:`), error.message);
      return false;
    }
  }

  /**
   * Silently remove artifacts left behind by the retired GitHub MCP integration
   * (older installer versions registered a `github` MCP server, stored a PAT in the
   * project's .env, and shipped a headers-helper script). The server is removed ONLY
   * when its definition carries the BMad fingerprint — a headersHelper pointing at
   * .bmad-core/utils/github-mcp-auth.js — which no manually-configured GitHub MCP
   * would have, so a server the user added themselves is never touched. Best-effort
   * and intentionally silent: any failure leaves things exactly as they are.
   * @param {string} installDir
   */
  async cleanupLegacyGithubMcp(installDir) {
    try {
      await this._removeLegacyGithubServer(installDir);
    } catch {
      // silent — leave the server as-is
    }
    try {
      await this._removeLegacyGithubEnvBlock(installDir);
    } catch {
      // silent — leave the .env as-is
    }
    try {
      await this._removeLegacyGithubAuthHelper(installDir);
    } catch {
      // silent — leave the helper file as-is
    }
  }

  /**
   * Remove the BMad-registered `github` MCP server for this project, identified by
   * its headersHelper fingerprint in ~/.claude.json. No fingerprint → no removal.
   * @param {string} installDir
   */
  async _removeLegacyGithubServer(installDir) {
    if (!this.isClaudeCLIInstalled()) return;

    const fsp = require('node:fs/promises');
    const os = require('node:os');

    let config;
    try {
      config = JSON.parse(await fsp.readFile(path.join(os.homedir(), '.claude.json'), 'utf8'));
    } catch {
      return; // no config or unparseable → nothing provably ours to remove
    }

    const normalize = (p) => {
      const resolved = path.resolve(String(p));
      return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    };
    const target = normalize(installDir);

    let serverDef = null;
    for (const [projectPath, project] of Object.entries(config.projects || {})) {
      if (normalize(projectPath) === target) {
        serverDef = project && project.mcpServers ? project.mcpServers.github : null;
        break;
      }
    }
    if (!serverDef) return;

    // Only the BMad installer ever registered the server with a headersHelper
    // pointing into .bmad-core — a user-added GitHub MCP fails this check and stays.
    const helper = String(serverDef.headersHelper || '').replaceAll('\\', '/');
    if (!helper.includes('.bmad-core/utils/github-mcp-auth.js')) return;

    execSync('claude mcp remove github', { cwd: installDir, stdio: 'pipe' });
  }

  /**
   * Strip the BMad-written GitHub managed block (and the PAT inside it) from the
   * project's .env. Lines outside the markers — including a GITHUB_PERSONAL_ACCESS_TOKEN
   * the user added themselves — are preserved byte-for-byte.
   * @param {string} installDir
   */
  async _removeLegacyGithubEnvBlock(installDir) {
    const fsp = require('node:fs/promises');
    const envPath = path.join(installDir, 'bmad-docs', '.bmad-tokens', '.env');

    let contents;
    try {
      contents = await fsp.readFile(envPath, 'utf8');
    } catch {
      return;
    }

    const START_MARKER = '# --- BMad-Stella GitHub managed (do not edit) ---';
    const END_MARKER = '# --- end BMad-Stella GitHub managed ---';
    if (!contents.includes(START_MARKER)) return;

    const kept = [];
    let insideBlock = false;
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === START_MARKER) {
        insideBlock = true;
        continue;
      }
      if (trimmed === END_MARKER) {
        insideBlock = false;
        continue;
      }
      if (insideBlock) continue;
      kept.push(line);
    }
    while (kept.length > 0 && kept[0].trim() === '') kept.shift();
    while (kept.length > 0 && kept.at(-1).trim() === '') kept.pop();

    const output = kept.length > 0 ? `${kept.join('\n')}\n` : '';
    // temp + rename so mode is enforced before the data lands at envPath
    const tmpPath = `${envPath}.${process.pid}.${Date.now()}.tmp`;
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
  }

  /**
   * Delete the orphaned headers-helper script from an upgraded install
   * (upgrades overwrite copied files but never remove ones dropped from bmad-core).
   * @param {string} installDir
   */
  async _removeLegacyGithubAuthHelper(installDir) {
    const fsp = require('node:fs/promises');
    await fsp.rm(path.join(installDir, '.bmad-core', 'utils', 'github-mcp-auth.js'), {
      force: true,
    });
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

    // Silently clean up leftovers from the retired GitHub MCP integration on
    // upgraded installs (fingerprinted server registration, stored PAT, helper script).
    await this.cleanupLegacyGithubMcp(installDir);

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
            name: 'Atlassian (for JIRA & Confluence integration)',
            value: 'atlassian',
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
      let isInstalled = await this.isMcpServerInstalled(installDir, serverName);

      // Atlassian retired the SSE endpoint in favor of Streamable HTTP (v1/mcp). If the
      // existing entry still points at the old v1/sse URL, remove it so it gets re-added
      // below with the current URL — regardless of its connected/auth status.
      if (isInstalled && (await this.isStaleAtlassianSseServer(installDir, serverName))) {
        const removed = await this.removeMcpServer(installDir, serverName);
        isInstalled = removed ? false : isInstalled;
      }

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
            message: 'Enter MCP server URL (e.g., https://mcp.example.com/v1/mcp):',
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
        if (serverConfig) {
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
