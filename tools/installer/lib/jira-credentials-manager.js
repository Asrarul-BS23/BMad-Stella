const fsp = require('node:fs/promises');
const path = require('node:path');
const chalk = require('chalk').default || require('chalk');
const inquirer = require('inquirer').default || require('inquirer');

const TRACKED_KEYS = Object.freeze(['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN']);
const DEFAULT_ATLASSIAN_BASE_URL = 'https://stellaint.atlassian.net/';
const TOKEN_HELP_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';
const VERIFY_TIMEOUT_MS = 10_000;
const MAX_VERIFY_ATTEMPTS = 3;

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

    const haveAll = Boolean(
      prefilled.JIRA_BASE_URL && prefilled.JIRA_EMAIL && prefilled.JIRA_API_TOKEN,
    );
    const nonInteractive = this._isNonInteractive();

    console.log(chalk.cyan('\n🔐 Jira Attachment Helper — API Access Setup'));
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
        console.log(
          chalk.dim('   Set them as env vars or in an existing .env file to enable automation.'),
        );
        result.skipped = true;
        return result;
      }
      // Verify, but never block a non-interactive install — failures are warnings only.
      const verification = await this._verifyCredentials(prefilled);
      this._reportNonInteractiveVerification(verification);
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

    // When the reuse check finds dead credentials we skip straight to fresh entry
    // instead of re-asking "Enter fresh details?" — the user has already been told.
    let forceFresh = false;

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
        const verification = await this._verifyCredentials(prefilled);
        if (verification.classification === 'auth' || verification.classification === 'notfound') {
          console.log(
            chalk.yellow(
              `⚠️  Detected credentials no longer work (${this._verifyFailureReason(verification)}). Let's re-enter them.`,
            ),
          );
          forceFresh = true;
        } else {
          this._reportVerificationSuccessOrWarning(verification, 'Verified existing credentials');
          const envPath = path.join(installDir, '.env');
          try {
            await this._writeEnv(envPath, { ...existingEnv, ...prefilled });
            result.ok = true;
            result.written = true;
            result.envPath = envPath;
            result.source = processEnv.JIRA_API_TOKEN ? 'process-env' : 'existing-.env';
            console.log(
              chalk.green(
                `✓ Reused existing credentials → ${path.relative(installDir, envPath) || '.env'}`,
              ),
            );
          } catch (error) {
            result.error = error.message;
            console.log(chalk.red(`✗ Failed to write .env: ${error.message}`));
          }
          return result;
        }
      }
    }

    if (!forceFresh) {
      const { wantsToConfigure } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'wantsToConfigure',
          message: haveAll
            ? 'Enter fresh Jira API access details instead?'
            : 'Configure Jira API access to auto-fetch ticket attachments? (Recommended)',
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
    }

    const answers = await this._collectFreshCredentials(prefilled);
    if (!answers) {
      console.log(
        chalk.yellow(
          '⚠️  Skipping Jira credential setup — attachment fetching will require manual paste.',
        ),
      );
      result.skipped = true;
      return result;
    }

    const merged = { ...existingEnv, ...answers };
    const envPath = path.join(installDir, '.env');
    result.source = 'interactive';

    try {
      await this._writeEnv(envPath, merged);
      result.ok = true;
      result.written = true;
      result.envPath = envPath;
      console.log(
        chalk.green(
          `\n✓ Wrote Jira credentials to ${path.relative(installDir, envPath) || '.env'}`,
        ),
      );
      console.log(chalk.dim(`  Tracked keys: ${TRACKED_KEYS.join(', ')}`));
    } catch (error) {
      result.error = error.message;
      console.log(chalk.red(`\n✗ Failed to write .env: ${error.message}`));
      console.log(
        chalk.yellow(
          '  You can configure credentials manually later by creating a .env file with:',
        ),
      );
      for (const key of TRACKED_KEYS) {
        console.log(chalk.dim(`    ${key}=...`));
      }
    }

    return result;
  }

  /**
   * Live-validate credentials against Jira's /myself endpoint before they are persisted.
   * Never throws — returns a classification the caller decides how to act on.
   *
   * @param {{JIRA_BASE_URL:string, JIRA_EMAIL:string, JIRA_API_TOKEN:string}} creds
   * @returns {Promise<{classification:'ok'|'auth'|'notfound'|'network'|'skipped', status:number|null, displayName:string|null, error:string|null}>}
   */
  async _verifyCredentials(creds) {
    const out = { classification: 'network', status: null, displayName: null, error: null };
    if (this._shouldSkipVerify()) {
      out.classification = 'skipped';
      return out;
    }

    const baseUrl = String(creds.JIRA_BASE_URL || '')
      .trim()
      .replace(/\/+$/, '');
    const email = String(creds.JIRA_EMAIL || '').trim();
    const token = String(creds.JIRA_API_TOKEN || '').trim();
    if (!baseUrl || !email || !token) {
      out.error = 'incomplete credentials';
      return out;
    }

    // Never send credentials over a non-HTTPS or unparseable URL — base64 Basic auth is
    // not encryption, so plaintext http (or an attacker-controlled host reached via a
    // planted/typo'd .env on the reuse path) would leak the token. Mirrors the posture in
    // bmad-core/utils/jira-attachments/lib/config.js (http allowed only for localhost tests).
    let endpoint;
    try {
      endpoint = new URL(`${baseUrl}/rest/api/3/myself`);
    } catch {
      out.classification = 'notfound';
      out.error = 'invalid site URL';
      return out;
    }
    const isLocalhost = endpoint.hostname === 'localhost' || endpoint.hostname === '127.0.0.1';
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && isLocalhost)) {
      out.classification = 'notfound';
      out.error =
        'refusing to send credentials over a non-HTTPS URL — set JIRA_BASE_URL to https://…';
      return out;
    }

    const url = endpoint.href;
    const authHeader = `Basic ${Buffer.from(`${email}:${token}`, 'utf8').toString('base64')}`;
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(VERIFY_TIMEOUT_MS)
        : undefined;

    try {
      // global fetch is available on the project's supported runtime (Node >=20.10); the
      // lint rule is conservative about the >=20.0.0 engines floor.
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
          'User-Agent': 'bmad-stella-installer/1.0',
        },
        redirect: 'follow',
        signal,
      });
      out.status = response.status;
      if (response.ok) {
        out.classification = 'ok';
        try {
          const me = await response.json();
          out.displayName = me.displayName || me.emailAddress || null;
        } catch {
          // body parse is best-effort; a 2xx already proves the creds work
        }
        return out;
      }
      if (response.status === 401 || response.status === 403) {
        out.classification = 'auth';
        return out;
      }
      if (response.status === 404) {
        out.classification = 'notfound';
        return out;
      }
      // 5xx / rate-limit / anything else transient — treat as unverifiable, not invalid.
      out.error = `HTTP ${response.status}`;
      return out;
    } catch (error) {
      // Timeouts, DNS failures, offline/VPN — classify as network so we warn-and-proceed
      // rather than trapping a user whose credentials may actually be fine.
      out.error = error.message || String(error);
      return out;
    }
  }

  _shouldSkipVerify() {
    const flag = String(process.env.BMAD_SKIP_JIRA_VERIFY || '').toLowerCase();
    return flag === '1' || flag === 'true' || flag === 'yes';
  }

  _verifyFailureReason(verification) {
    if (verification.classification === 'auth') {
      return `authentication failed${verification.status ? ` (${verification.status})` : ''}`;
    }
    if (verification.classification === 'notfound') {
      // A concrete error (e.g. the HTTPS refusal or an unparseable URL) is clearer than "site not found".
      if (verification.error) return verification.error;
      return `site not found${verification.status ? ` (${verification.status})` : ''}`;
    }
    return verification.error || 'unknown error';
  }

  /**
   * Print a "✓ verified" line on success, or a soft warning when the credentials could
   * not be reached (network/skipped). Callers handle auth/notfound separately.
   */
  _reportVerificationSuccessOrWarning(verification, successLabel) {
    if (verification.classification === 'ok') {
      const who = verification.displayName ? ` (authenticated as ${verification.displayName})` : '';
      console.log(chalk.green(`✓ ${successLabel}${who}`));
    } else if (verification.classification === 'skipped') {
      console.log(chalk.dim('  Skipping live verification (BMAD_SKIP_JIRA_VERIFY set).'));
    } else {
      console.log(
        chalk.yellow(
          '⚠️  Could not reach Jira to verify (network/VPN) — proceeding. Verify later with `node .bmad-core/utils/jira-attachments --self-test`.',
        ),
      );
    }
  }

  _reportNonInteractiveVerification(verification) {
    if (verification.classification === 'ok') {
      const who = verification.displayName ? ` (${verification.displayName})` : '';
      console.log(chalk.green(`✓ Verified Jira credentials${who}`));
    } else if (
      verification.classification === 'auth' ||
      verification.classification === 'notfound'
    ) {
      console.log(
        chalk.yellow(
          `⚠️  Jira credential verification failed (${this._verifyFailureReason(verification)}) — writing anyway (non-interactive).`,
        ),
      );
    } else if (verification.classification !== 'skipped') {
      console.log(chalk.dim('  Could not reach Jira to verify; writing credentials as provided.'));
    }
  }

  /**
   * Prompt for credentials and live-verify them, up to MAX_VERIFY_ATTEMPTS times.
   * Returns the accepted credential object, or null if the user declines to save.
   * URL/email defaults carry over between attempts; the token is always re-entered.
   *
   * @param {object} prefilled
   * @returns {Promise<object|null>}
   */
  async _collectFreshCredentials(prefilled) {
    let last = null;
    for (let attempt = 1; attempt <= MAX_VERIFY_ATTEMPTS; attempt += 1) {
      const defaults = last || prefilled;
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'JIRA_BASE_URL',
          message: `Atlassian site URL (e.g., ${DEFAULT_ATLASSIAN_BASE_URL}):`,
          default: defaults.JIRA_BASE_URL || DEFAULT_ATLASSIAN_BASE_URL,
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
          default: defaults.JIRA_EMAIL,
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
            if (input.trim().length < 16)
              return 'That token looks too short — please paste the full token';
            return true;
          },
          filter: (input) => (input ? input.trim() : input),
        },
      ]);

      const verification = await this._verifyCredentials(answers);

      if (verification.classification === 'ok' || verification.classification === 'skipped') {
        this._reportVerificationSuccessOrWarning(verification, 'Verified');
        return answers;
      }
      if (verification.classification === 'network') {
        this._reportVerificationSuccessOrWarning(verification, 'Verified');
        return answers;
      }

      // auth / notfound — blocking failures, retry within the attempt budget.
      last = answers;
      console.log(chalk.red(`✗ ${this._verifyFailureReason(verification)}.`));
      if (attempt < MAX_VERIFY_ATTEMPTS) {
        console.log(
          chalk.dim(`  Attempt ${attempt}/${MAX_VERIFY_ATTEMPTS} failed — let's try again.`),
        );
      }
    }

    const { saveAnyway } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'saveAnyway',
        message: `Could not verify after ${MAX_VERIFY_ATTEMPTS} attempts. Save these credentials anyway?`,
        default: false,
      },
    ]);
    return saveAnyway ? last : null;
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
    const START_MARKER = '# --- BMad-Stella Jira managed (do not edit keys below manually) ---';
    const END_MARKER = '# --- end BMad-Stella Jira managed ---';
    // Legacy markers from before the block was renamed to "Jira"; treated as the same
    // block so an existing .env migrates cleanly (no leftover comment lines on rewrite).
    const LEGACY_START_MARKER = '# --- BMad-Stella managed (do not edit keys below manually) ---';
    const LEGACY_END_MARKER = '# --- end BMad-Stella managed ---';
    const preservedLines = [];
    let insideManagedBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === START_MARKER || trimmed === LEGACY_START_MARKER) {
        insideManagedBlock = true;
        continue;
      }
      if (trimmed === END_MARKER || trimmed === LEGACY_END_MARKER) {
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
      START_MARKER,
      ...TRACKED_KEYS.map((key) => `${key}=${this._quoteIfNeeded(values[key])}`),
      END_MARKER,
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
      return `"${str.replaceAll('"', '\\"')}"`;
    }
    return str;
  }
}

module.exports = new JiraCredentialsManager();
module.exports.TRACKED_KEYS = TRACKED_KEYS;
