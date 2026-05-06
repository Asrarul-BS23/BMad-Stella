const path = require('node:path');
const fs = require('fs-extra');
const chalk = require('chalk').default || require('chalk');

class ScribeSetup {
  constructor() {}

  /**
   * Get the path to the bmad-ledger directory in the install target.
   * @param {string} installDir
   * @returns {string}
   */
  getLedgerRoot(installDir) {
    return path.join(installDir, 'bmad-ledger');
  }

  /**
   * Create the ledger skeleton + seed files.
   * Idempotent: skips creation if structure already exists.
   *
   * Layout:
   *   bmad-ledger/
   *   ├── decisions.md       (append-only DEC entries)
   *   ├── actions.md         (append-only ACT entries)
   *   ├── index.yaml         (metadata for fast filter)
   *   └── .meta/
   *       └── version.yaml   (schema version)
   *
   * @param {string} installDir - Project root where bmad-ledger/ should live
   * @returns {Promise<{created: boolean, skipped: boolean, error: string|null}>}
   */
  async setup(installDir) {
    const result = { created: false, skipped: false, error: null };

    try {
      const ledgerRoot = this.getLedgerRoot(installDir);
      const metaDir = path.join(ledgerRoot, '.meta');
      const decisionsPath = path.join(ledgerRoot, 'decisions.md');
      const actionsPath = path.join(ledgerRoot, 'actions.md');
      const indexPath = path.join(ledgerRoot, 'index.yaml');
      const versionPath = path.join(metaDir, 'version.yaml');

      // Skip if already exists (idempotent)
      if (await fs.pathExists(ledgerRoot)) {
        result.skipped = true;
        return result;
      }

      // Create directory structure
      await fs.ensureDir(metaDir);

      // Seed empty decisions.md and actions.md
      await fs.writeFile(decisionsPath, this.buildLedgerSeed('decisions'), 'utf8');
      await fs.writeFile(actionsPath, this.buildLedgerSeed('actions'), 'utf8');

      // Seed index.yaml
      await fs.writeFile(indexPath, this.buildIndexSeed(), 'utf8');

      // Seed .meta/version.yaml
      await fs.writeFile(versionPath, this.buildVersionSeed(), 'utf8');

      result.created = true;
      return result;
    } catch (error) {
      result.error = error.message;
      return result;
    }
  }

  /**
   * Build the seed content for a ledger markdown file.
   * @param {string} kind - "decisions" or "actions"
   * @returns {string}
   */
  buildLedgerSeed(kind) {
    return `<!-- BMAD scribe ledger — ${kind}. Append-only. Edit existing entries only via supersession/revoke marker. -->\n`;
  }

  /**
   * Build the seed content for bmad-ledger/index.yaml.
   * @returns {string}
   */
  buildIndexSeed() {
    const timestamp = new Date().toISOString();
    return `version: ${this.schemaVersion}
generated: ${timestamp}
entries: {}
stats:
  total: 0
  decisions: 0
  actions: 0
  active: 0
  superseded: 0
  revoked: 0
`;
  }

  /**
   * Build the seed content for bmad-ledger/.meta/version.yaml.
   * @returns {string}
   */
  buildVersionSeed() {
    return `version: ${this.schemaVersion}\n`;
  }

  /**
   * Print one-line success summary.
   * @param {object} result - Result from setup()
   */
  showSummary(result) {
    if (result.error) {
      console.log(chalk.yellow(`⚠️  Could not initialize ledger: ${result.error}`));
      return;
    }

    if (result.created) {
      console.log(chalk.green('✓ ledger initialized'));
    }
    // skipped → silent (already there, no need to spam)
  }

  schemaVersion = 2;
}

module.exports = new ScribeSetup();
