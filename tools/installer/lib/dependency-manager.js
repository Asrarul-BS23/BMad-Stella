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
