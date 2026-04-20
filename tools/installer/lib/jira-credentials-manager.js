const fsp = require('node:fs/promises');
const path = require('node:path');
const chalk = require('chalk').default || require('chalk');
const inquirer = require('inquirer').default || require('inquirer');

const TRACKED_KEYS = Object.freeze(['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN']);
const DEFAULT_ATLASSIAN_BASE_URL = 'https://stellaint.atlassian.net/';
const TOKEN_HELP_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';

class JiraCredentialsManager {
  /**
   * Prompt for the credentials the jira-attachments helper needs and persist them
   * to a .env file alongside the installation. Installer.updateGitignore() handles
   * the .gitignore entries under the existing "# BMad directories" section.
   *
   * @param {string} installDir - Target installation directory (project root in user repo)
   * @param {object} [options]
   * @param {string} [options.knownBaseUrl] - JIRA_BASE_URL already collected by MCP prompt
   * @returns {Promise<{ok: boolean, skipped: boolean, written: boolean, envPath: string|null, error: string|null}>}
   */
  async promptAndPersist(installDir, { knownBaseUrl } = {}) {
    const result = {
      ok: false,
      skipped: false,
      written: false,
      envPath: null,
      source: null,
      error: null,
    };

    const existingEnv = await this._readExistingEnv(installDir);
    const processEnv = this._readProcessEnv();

    // Precedence: CLI process env > existing .env. knownBaseUrl (just collected by MCP step)
    // fills JIRA_BASE_URL if none of the other sources have one.
    const prefilled = {
      JIRA_BASE_URL: processEnv.JIRA_BASE_URL || existingEnv.JIRA_BASE_URL || knownBaseUrl || '',
      JIRA_EMAIL: processEnv.JIRA_EMAIL || existingEnv.JIRA_EMAIL || '',
      JIRA_API_TOKEN: processEnv.JIRA_API_TOKEN || existingEnv.JIRA_API_TOKEN || '',
    };

    const haveAll = Boolean(prefilled.JIRA_BASE_URL && prefilled.JIRA_EMAIL && prefilled.JIRA_API_TOKEN);
    const nonInteractive = this._isNonInteractive();

    console.log(chalk.cyan('\n🔐 Jira Attachment Helper — API Credentials'));
    console.log(
      chalk.dim(
        'The planner needs your Atlassian email + API token to download ticket attachments (images, PDFs).',
      ),
    );

    if (nonInteractive) {
      if (!haveAll) {
        const missing = Object.keys(prefilled).filter((k) => !prefilled[k]);
        console.log(
          chalk.yellow(
            `⚠️  Non-interactive mode detected (CI / non-TTY / BMAD_NON_INTERACTIVE=1) but credentials are missing: ${missing.join(', ')}.`,
          ),
        );
        console.log(chalk.dim('   Set them as env vars or in an existing .env file to enable automation.'));
        result.skipped = true;
        return result;
      }
      const envPath = path.join(installDir, '.env');
      try {
        await this._writeEnv(envPath, { ...existingEnv, ...prefilled });
        result.ok = true;
        result.written = true;
        result.envPath = envPath;
        result.source = processEnv.JIRA_API_TOKEN ? 'process-env' : 'existing-.env';
        console.log(
          chalk.green(
            `✓ Wrote Jira credentials to ${path.relative(installDir, envPath) || '.env'} (non-interactive, source: ${result.source})`,
          ),
        );
      } catch (error) {
        result.error = error.message;
        console.log(chalk.red(`✗ Failed to write .env: ${error.message}`));
      }
      return result;
    }

    // Interactive path.
    console.log(chalk.dim(`Create an API token at: ${TOKEN_HELP_URL}`));
    console.log(chalk.dim('Credentials are stored in a local .env file (git-ignored).\n'));

    if (haveAll) {
      console.log(
        chalk.green(
          `✓ Detected existing credentials (${prefilled.JIRA_EMAIL} → ${prefilled.JIRA_BASE_URL}).`,
        ),
      );
      const { reuse } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'reuse',
          message: 'Use the detected credentials as-is?',
          default: true,
        },
      ]);
      if (reuse) {
        const envPath = path.join(installDir, '.env');
        try {
          await this._writeEnv(envPath, { ...existingEnv, ...prefilled });
          result.ok = true;
          result.written = true;
          result.envPath = envPath;
          result.source = processEnv.JIRA_API_TOKEN ? 'process-env' : 'existing-.env';
          console.log(
            chalk.green(`✓ Reused existing credentials → ${path.relative(installDir, envPath) || '.env'}`),
          );
        } catch (error) {
          result.error = error.message;
          console.log(chalk.red(`✗ Failed to write .env: ${error.message}`));
        }
        return result;
      }
    }

    const { wantsToConfigure } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'wantsToConfigure',
        message: haveAll
          ? 'Enter fresh credentials instead?'
          : 'Configure Jira API credentials now? (Recommended)',
        default: true,
      },
    ]);

    if (!wantsToConfigure) {
      console.log(
        chalk.yellow(
          '⚠️  Skipping Jira credential setup — attachment fetching will require manual paste.',
        ),
      );
      result.skipped = true;
      return result;
    }

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'JIRA_BASE_URL',
        message: `Atlassian site URL (e.g., ${DEFAULT_ATLASSIAN_BASE_URL}):`,
        default: prefilled.JIRA_BASE_URL || DEFAULT_ATLASSIAN_BASE_URL,
        validate: (input) => {
          if (!input || !input.trim()) return 'Required';
          try {
            const url = new URL(input.trim());
            return url.protocol === 'https:' || url.protocol === 'http:'
              ? true
              : 'Must be an http(s) URL';
          } catch {
            return `Enter a valid URL, e.g. ${DEFAULT_ATLASSIAN_BASE_URL}`;
          }
        },
        filter: (input) => (input ? input.trim().replace(/\/+$/, '') : input),
      },
      {
        type: 'input',
        name: 'JIRA_EMAIL',
        message: 'Atlassian account email:',
        default: prefilled.JIRA_EMAIL,
        validate: (input) => {
          if (!input || !input.trim()) return 'Required';
          return /.+@.+\..+/.test(input.trim()) ? true : 'Enter a valid email address';
        },
        filter: (input) => (input ? input.trim() : input),
      },
      {
        type: 'password',
        name: 'JIRA_API_TOKEN',
        mask: '*',
        message: `Atlassian API token (create one at ${TOKEN_HELP_URL}):`,
        validate: (input) => {
          if (!input || !input.trim()) return 'Required';
          if (input.trim().length < 16) return 'That token looks too short — please paste the full token';
          return true;
        },
        filter: (input) => (input ? input.trim() : input),
      },
    ]);

    const merged = { ...existingEnv, ...answers };
    const envPath = path.join(installDir, '.env');
    result.source = 'interactive';

    try {
      await this._writeEnv(envPath, merged);
      result.ok = true;
      result.written = true;
      result.envPath = envPath;
      console.log(chalk.green(`\n✓ Wrote Jira credentials to ${path.relative(installDir, envPath) || '.env'}`));
      console.log(chalk.dim(`  Tracked keys: ${TRACKED_KEYS.join(', ')}`));
    } catch (error) {
      result.error = error.message;
      console.log(chalk.red(`\n✗ Failed to write .env: ${error.message}`));
      console.log(
        chalk.yellow('  You can configure credentials manually later by creating a .env file with:'),
      );
      for (const key of TRACKED_KEYS) {
        console.log(chalk.dim(`    ${key}=...`));
      }
    }

    return result;
  }

  _readProcessEnv() {
    const out = {};
    for (const key of TRACKED_KEYS) {
      const value = process.env[key];
      if (typeof value === 'string' && value.trim()) {
        out[key] = value.trim();
      }
    }
    return out;
  }

  _isNonInteractive() {
    const flag = String(process.env.BMAD_NON_INTERACTIVE || '').toLowerCase();
    if (flag === '1' || flag === 'true' || flag === 'yes') return true;
    if (String(process.env.CI || '').toLowerCase() === 'true') return true;
    if (process.stdin && process.stdin.isTTY === false) return true;
    return false;
  }

  async _readExistingEnv(installDir) {
    const envPath = path.join(installDir, '.env');
    try {
      const contents = await fsp.readFile(envPath, 'utf8');
      return this._parseDotenv(contents);
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
  }

  _parseDotenv(contents) {
    const result = {};
    const lines = contents.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key) result[key] = value;
    }
    return result;
  }

  async _writeEnv(envPath, values) {
    let existing = '';
    try {
      existing = await fsp.readFile(envPath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    const lines = existing.split(/\r?\n/);
    const managedKeys = new Set(TRACKED_KEYS);
    const preservedLines = [];
    let insideManagedBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '# --- BMad-Stella managed (do not edit keys below manually) ---') {
        insideManagedBlock = true;
        continue;
      }
      if (trimmed === '# --- end BMad-Stella managed ---') {
        insideManagedBlock = false;
        continue;
      }
      if (insideManagedBlock) continue;
      if (trimmed.startsWith('#') || !trimmed) {
        preservedLines.push(line);
        continue;
      }
      const eq = trimmed.indexOf('=');
      if (eq === -1) {
        preservedLines.push(line);
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      if (managedKeys.has(key)) continue;
      preservedLines.push(line);
    }

    while (preservedLines.length > 0 && preservedLines.at(-1).trim() === '') {
      preservedLines.pop();
    }

    const managedBlock = [
      '# --- BMad-Stella managed (do not edit keys below manually) ---',
      ...TRACKED_KEYS.map((key) => `${key}=${this._quoteIfNeeded(values[key])}`),
      '# --- end BMad-Stella managed ---',
    ];

    const output = [...preservedLines, '', ...managedBlock, ''].join('\n');

    await fsp.mkdir(path.dirname(envPath), { recursive: true });
    // Write via a temp file + rename so we can enforce mode before the data lands at envPath.
    // fsp.writeFile's mode option only applies when creating a new file, not on overwrite.
    const tmpPath = `${envPath}.${process.pid}.${Date.now()}.tmp`;
    await fsp.writeFile(tmpPath, output, { encoding: 'utf8', mode: 0o600 });
    try {
      await fsp.chmod(tmpPath, 0o600);
    } catch {
      // chmod is best-effort on Windows — file is still protected via ACLs by default
    }
    await fsp.rename(tmpPath, envPath);
    try {
      await fsp.chmod(envPath, 0o600);
    } catch {
      // best-effort on Windows
    }
  }

  _quoteIfNeeded(value) {
    const str = String(value ?? '');
    if (!str) return '';
    if (/[\s#"'=]/.test(str)) {
      return `"${str.replace(/"/g, '\\"')}"`;
    }
    return str;
  }

}

module.exports = new JiraCredentialsManager();
module.exports.TRACKED_KEYS = TRACKED_KEYS;
