const { execSync } = require('node:child_process');
const fs = require('fs-extra');
const path = require('node:path');
const chalk = require('chalk');
const inquirer = require('inquirer');

const GITHUB_API_USER_URL = 'https://api.github.com/user';
const GITHUB_VERIFY_TIMEOUT_MS = 10_000;
const MAX_GITHUB_VERIFY_ATTEMPTS = 3;

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

  /** Escape hatch to skip live GitHub verification, mirroring BMAD_SKIP_JIRA_VERIFY. */
  _shouldSkipGithubVerify() {
    const flag = String(process.env.BMAD_SKIP_GITHUB_VERIFY || '').toLowerCase();
    return flag === '1' || flag === 'true' || flag === 'yes';
  }

  /**
   * Live-validate a GitHub PAT against `GET /user`. Never throws — returns a
   * classification the caller acts on. 401 → 'auth' (expired/revoked/invalid → re-enter);
   * 403 (rate-limit or policy) → 'network' (proceed, don't trap over a transient limit);
   * 2xx → 'ok' with the resolved login.
   * @param {string} token
   * @returns {Promise<{classification:'ok'|'auth'|'network'|'skipped', status:number|null, login:string|null, error:string|null}>}
   */
  async _verifyGithubToken(token) {
    const out = { classification: 'network', status: null, login: null, error: null };
    if (this._shouldSkipGithubVerify()) {
      out.classification = 'skipped';
      return out;
    }
    const tok = String(token || '').trim();
    if (!tok) {
      out.error = 'empty token';
      return out;
    }

    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(GITHUB_VERIFY_TIMEOUT_MS)
        : undefined;

    try {
      // global fetch is available on the project's supported runtime (Node >=20.10); the
      // lint rule is conservative about the >=20.0.0 engines floor.
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      const response = await fetch(GITHUB_API_USER_URL, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tok}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'bmad-stella-installer/1.0',
        },
        redirect: 'follow',
        signal,
      });
      out.status = response.status;
      if (response.ok) {
        out.classification = 'ok';
        try {
          const body = await response.json();
          out.login = body.login || null;
        } catch {
          // a 2xx already proves the token works; body parse is best-effort
        }
        return out;
      }
      if (response.status === 401) {
        out.classification = 'auth'; // expired / revoked / invalid → re-enter
        return out;
      }
      // 403 on GitHub is usually rate-limiting (or org/SSO policy) — not proof the token is
      // bad — so treat it as unverifiable-but-proceed rather than forcing a re-enter.
      if (response.status === 403) {
        const remaining = response.headers.get('x-ratelimit-remaining');
        out.error = remaining === '0' ? 'GitHub API rate limit reached' : 'HTTP 403';
        return out; // classification stays 'network'
      }
      out.error = `HTTP ${response.status}`;
      return out; // other non-2xx → unverifiable, proceed
    } catch (error) {
      out.error = error.message || String(error); // timeout / DNS / offline
      return out;
    }
  }

  /**
   * Read an existing GitHub token from the environment or the project's .env (any line,
   * inside the managed block or not). Returns the trimmed token or null.
   * @param {string} installDir
   * @returns {Promise<string|null>}
   */
  async _readGithubTokenFromEnv(installDir) {
    const fromEnv = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    if (fromEnv && fromEnv.trim()) return fromEnv.trim();

    const fsp = require('node:fs/promises');
    let contents;
    try {
      contents = await fsp.readFile(
        path.join(installDir, 'bmad-docs', '.bmad-tokens', '.env'),
        'utf8',
      );
    } catch {
      return null;
    }
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1 || line.slice(0, eq).trim() !== 'GITHUB_PERSONAL_ACCESS_TOKEN') continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value.trim() || null;
    }
    return null;
  }

  /** Print a friendly line for a GitHub verification result. */
  _reportGithubVerification(verification, successLabel) {
    if (verification.classification === 'ok') {
      const who = verification.login ? ` (authenticated as ${verification.login})` : '';
      console.log(chalk.green(`✓ ${successLabel}${who}`));
    } else if (verification.classification === 'skipped') {
      console.log(chalk.dim('  Skipping live verification (BMAD_SKIP_GITHUB_VERIFY set).'));
    } else {
      const why = verification.error ? ` (${verification.error})` : '';
      console.log(
        chalk.yellow(
          `⚠️  Could not verify the GitHub token${why} — proceeding. It will be checked when you run /mcp.`,
        ),
      );
    }
  }

  /**
   * Prompt for a fresh GitHub token and verify it, retrying on a 401 rejection up to the
   * attempt budget. Returns the accepted token, or null if the user leaves it blank (skip).
   * @param {object} tokenAuth
   * @returns {Promise<string|null>}
   */
  async _collectFreshGithubToken(tokenAuth) {
    let last = null;
    for (let attempt = 1; attempt <= MAX_GITHUB_VERIFY_ATTEMPTS; attempt += 1) {
      const token = await this.promptForToken(tokenAuth);
      if (!token) return null; // blank → skip
      last = token;
      const verification = await this._verifyGithubToken(token);
      if (verification.classification !== 'auth') {
        // ok / network / skipped → accept (don't trap the user on a transient/unreachable check)
        this._reportGithubVerification(verification, 'Verified GitHub token');
        return token;
      }
      console.log(chalk.red('✗ That token was rejected by GitHub (expired, revoked, or invalid).'));
      if (attempt < MAX_GITHUB_VERIFY_ATTEMPTS) {
        console.log(
          chalk.dim(`  Attempt ${attempt}/${MAX_GITHUB_VERIFY_ATTEMPTS} failed — let's try again.`),
        );
      }
    }
    const { saveAnyway } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'saveAnyway',
        message: `Could not verify after ${MAX_GITHUB_VERIFY_ATTEMPTS} attempts. Save the token anyway?`,
        default: false,
      },
    ]);
    return saveAnyway ? last : null;
  }

  /**
   * Persist a single KEY=value into the project's git-ignored .env (mode 0600) inside
   * its own clearly-marked managed block, preserving every other line (including the
   * separate JIRA managed block written by jira-credentials-manager). Idempotent: an
   * existing block with the same label — or a legacy bare `KEY=` line from an earlier
   * format — is removed before the fresh block is appended, so re-runs don't duplicate.
   * Used to store the GitHub PAT that the github-mcp-auth headersHelper reads at connect time.
   * @param {string} installDir
   * @param {string} key
   * @param {string} value
   * @param {string} blockName - human label for the block header (e.g. 'GitHub')
   * @returns {Promise<{ok: boolean, envPath: string, error: string|null}>}
   */
  async persistEnvVar(installDir, key, value, blockName) {
    const fsp = require('node:fs/promises');
    // Tokens live in <project>/bmad-docs/.bmad-tokens/.env (git-ignored via bmad-docs/).
    const envPath = path.join(installDir, 'bmad-docs', '.bmad-tokens', '.env');
    const out = { ok: false, envPath, error: null };

    const startMarker = `# --- BMad-Stella ${blockName} managed (do not edit) ---`;
    const endMarker = `# --- end BMad-Stella ${blockName} managed ---`;

    try {
      let existing = '';
      try {
        existing = await fsp.readFile(envPath, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }

      // Preserve all lines except (a) our own previous block and (b) any legacy bare
      // KEY= line. The JIRA block uses different markers/keys, so it is left untouched.
      const preserved = [];
      let insideOurBlock = false;
      for (const line of existing.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === startMarker) {
          insideOurBlock = true;
          continue;
        }
        if (trimmed === endMarker) {
          insideOurBlock = false;
          continue;
        }
        if (insideOurBlock) continue;
        const eq = trimmed.indexOf('=');
        if (eq !== -1 && !trimmed.startsWith('#') && trimmed.slice(0, eq).trim() === key) {
          continue; // drop legacy bare line for this key
        }
        preserved.push(line);
      }
      while (preserved.length > 0 && preserved[0].trim() === '') preserved.shift();
      while (preserved.length > 0 && preserved.at(-1).trim() === '') preserved.pop();

      const quoted = /[\s#"'=]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
      const block = [startMarker, `${key}=${quoted}`, endMarker];
      // Prepend our block above any preserved content. This keeps the managed block at the
      // top and, when the JIRA helper later rewrites its own block at the end of the file,
      // leaves no stray leading blank line (the JIRA writer only trims trailing blanks).
      const body = preserved.length > 0 ? [...block, '', ...preserved] : block;
      const output = `${body.join('\n')}\n`;

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

      const isInstalled = await this.isMcpServerInstalled(installDir, serverName);
      const existingToken = await this._readGithubTokenFromEnv(installDir);
      let token = null;

      // 1. If a token already exists, offer to reuse it — verifying it's still live first.
      if (existingToken) {
        console.log(chalk.green('✓ Detected an existing GitHub token.'));
        const { reuse } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'reuse',
            message: 'Use the detected GitHub token as-is?',
            default: true,
          },
        ]);
        if (reuse) {
          const verification = await this._verifyGithubToken(existingToken);
          if (verification.classification === 'auth') {
            console.log(
              chalk.yellow(
                "⚠️  The detected token no longer works (expired, revoked, or invalid). Let's re-enter it.",
              ),
            );
          } else {
            // ok → verified; network/skipped → couldn't check but proceed (don't trap the user)
            this._reportGithubVerification(verification, 'Verified existing GitHub token');
            token = existingToken;
          }
        }
      }

      // 2. Otherwise (no token, declined reuse, or a dead token) prompt for a fresh one,
      //    verifying it and retrying on a 401 rejection.
      if (!token) {
        console.log(
          chalk.dim(
            `   Create a fine-grained token at ${tokenAuth.helpUrl} with access to the repositories you want Claude to work with.`,
          ),
        );
        token = await this._collectFreshGithubToken(tokenAuth);
      }

      // 3. Persist the token to .env, then register the server (or just refresh .env if the
      //    server is already registered — its headersHelper re-reads .env, so no re-add).
      if (token) {
        const envResult = await this.persistEnvVar(installDir, tokenAuth.envVar, token, 'GitHub');
        if (envResult.ok) {
          console.log(
            chalk.green(
              `✓ Stored ${tokenAuth.envVar} in ${path.relative(installDir, envResult.envPath) || '.env'} (git-ignored)`,
            ),
          );

          if (isInstalled) {
            console.log(
              chalk.green('✓ GitHub MCP server already registered; token updated in .env'),
            );
            results.alreadyConfigured.push(serverName);
          } else {
            // Register with a headersHelper that reads the token at connect time.
            // Absolute path → local scope in ~/.claude.json; no token is stored in config.
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
