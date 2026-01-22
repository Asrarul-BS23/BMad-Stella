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
      let command = `claude mcp add ${serverName} --transport ${serverConfig.transport} ${serverConfig.url}`;

      // Add environment variables
      for (const [envVar, value] of Object.entries(envValues)) {
        if (value) {
          command += ` --env ${envVar}=${value}`;
        }
      }

      console.log(chalk.cyan(`\n📦 Adding ${serverConfig.name}...`));
      console.log(chalk.dim(`   Command: ${command}`));

      execSync(command, {
        cwd: installDir,
        stdio: 'inherit',
      });

      console.log(chalk.green(`✓ Successfully added ${serverConfig.name}`));

      // Show authentication instructions for servers that require it
      if (serverName === 'atlassian') {
        console.log(chalk.yellow('\n⚠️  Authentication Required:'));
        console.log(chalk.cyan('   1. Open Claude Code CLI in your project directory'));
        console.log(chalk.cyan('   2. Run: /mcp'));
        console.log(chalk.cyan('   3. Follow the browser authentication flow for Atlassian'));
        console.log(chalk.dim('   Note: You must authenticate to use JIRA integration features\n'));
      }

      return true;
    } catch (error) {
      console.error(chalk.red(`\n✗ Failed to add ${serverConfig.name}:`), error.message);
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

    console.log(chalk.cyan('\n🔍 Checking required MCP servers...'));

    for (const [serverName, serverConfig] of Object.entries(this.requiredMcpServers)) {
      results.checked.push(serverName);

      if (spinner) {
        spinner.text = `Checking ${serverConfig.name}...`;
        spinner.stop();
      }

      // Check if server is already configured
      const isInstalled = await this.isMcpServerInstalled(installDir, serverName);

      if (isInstalled) {
        console.log(chalk.green(`✓ ${serverConfig.name} is already configured`));
        results.alreadyConfigured.push(serverName);
        if (spinner) spinner.start();
        continue;
      }

      // Ask user if they want to install
      console.log(chalk.yellow(`\n⚠️  ${serverConfig.name} is not configured`));
      console.log(chalk.dim(`   ${serverConfig.description}`));

      const { shouldInstall } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldInstall',
          message: `Would you like to configure ${serverConfig.name} now?`,
          default: true,
        },
      ]);

      if (shouldInstall) {
        // Prompt for environment variables
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
      } else {
        console.log(chalk.yellow(`   Skipping ${serverName}`));
        results.skipped.push(serverName);
      }

      if (spinner) spinner.start();
    }

    return results;
  }

  /**
   * Show MCP server installation summary
   * @param {object} results - Installation results
   * @param {string} installDir - Target installation directory
   */
  async showInstallationSummary(results, installDir) {
    if (results.installed.length > 0) {
      console.log(chalk.green(`\n✓ Configured ${results.installed.length} MCP server(s):`));
      for (const server of results.installed) {
        console.log(chalk.green(`  - ${server}`));
      }

      // Check connection status for installed servers
      console.log(chalk.cyan('\n🔐 Checking authentication status...'));
      for (const server of results.installed) {
        const isConnected = await this.isMcpServerConnected(installDir, server);
        if (isConnected) {
          console.log(chalk.green(`✓ ${server} is authenticated`));
        } else {
          const serverConfig = this.requiredMcpServers[server];
          console.log(chalk.yellow(`\n⚠️  ${serverConfig.name} is not authenticated yet`));
          console.log(chalk.cyan('   To authenticate:'));
          console.log(chalk.cyan('   1. Open Claude Code CLI in your project directory'));
          console.log(chalk.cyan('   2. Run: /mcp'));
          console.log(
            chalk.cyan(`   3. Follow the browser authentication flow for ${serverConfig.name}`),
          );
        }
      }
    }

    if (results.failed.length > 0) {
      console.log(chalk.red(`\n✗ Failed to configure ${results.failed.length} MCP server(s):`));
      for (const server of results.failed) {
        const serverConfig = this.requiredMcpServers[server];
        console.log(chalk.red(`  - ${server}`));
      }
      console.log(chalk.yellow('\n⚠️  Some features may not work without these MCP servers.'));
      console.log(chalk.yellow('You can configure them manually later using:'));
      for (const server of results.failed) {
        const serverConfig = this.requiredMcpServers[server];
        let command = `claude mcp add ${server} --transport ${serverConfig.transport} ${serverConfig.url}`;
        for (const [envVar, config] of Object.entries(serverConfig.envVars)) {
          command += ` --env ${envVar}=<${envVar.toLowerCase()}>`;
        }
        console.log(chalk.cyan(`  ${command}`));
      }
    }

    if (
      results.skipped.length > 0 &&
      results.installed.length === 0 &&
      results.alreadyConfigured.length === 0
    ) {
      console.log(chalk.yellow('\n⚠️  No MCP servers were configured.'));
      console.log(
        chalk.yellow(
          'Some features (retrieve-ticket-information, comment-plan) may not work without Atlassian MCP.',
        ),
      );
      console.log(chalk.yellow('\nYou can configure them later using:'));
      for (const server of results.skipped) {
        if (this.requiredMcpServers[server]) {
          const serverConfig = this.requiredMcpServers[server];
          let command = `claude mcp add ${server} --transport ${serverConfig.transport} ${serverConfig.url}`;
          for (const [envVar, config] of Object.entries(serverConfig.envVars)) {
            command += ` --env ${envVar}=<${envVar.toLowerCase()}>`;
          }
          console.log(chalk.cyan(`  ${command}`));
          console.log(chalk.dim(`  Then run '/mcp' in Claude Code CLI to authenticate\n`));
        }
      }
    }

    // Check for already configured servers that might not be authenticated
    if (results.alreadyConfigured.length > 0) {
      console.log(chalk.cyan('\n🔐 Checking authentication status for existing servers...'));
      for (const server of results.alreadyConfigured) {
        if (this.requiredMcpServers[server]) {
          const isConnected = await this.isMcpServerConnected(installDir, server);
          if (isConnected) {
            console.log(chalk.green(`✓ ${server} is authenticated`));
          } else {
            const serverConfig = this.requiredMcpServers[server];
            console.log(
              chalk.yellow(`\n⚠️  ${serverConfig.name} is configured but not authenticated`),
            );
            console.log(chalk.cyan('   To authenticate:'));
            console.log(chalk.cyan('   1. Open Claude Code CLI in your project directory'));
            console.log(chalk.cyan('   2. Run: /mcp'));
            console.log(
              chalk.cyan(`   3. Follow the browser authentication flow for ${serverConfig.name}`),
            );
          }
        }
      }
    }
  }
}

module.exports = new DependencyManager();
