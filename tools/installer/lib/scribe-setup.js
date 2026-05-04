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
   * Create the ledger directory skeleton + seed files.
   * Idempotent: skips creation if structure already exists.
   *
   * @param {string} installDir - Project root where bmad-ledger/ should live
   * @returns {Promise<{created: boolean, skipped: boolean, error: string|null}>}
   */
  async setup(installDir) {
    const result = { created: false, skipped: false, error: null };

    try {
      const ledgerRoot = this.getLedgerRoot(installDir);
      const sessionsDir = path.join(ledgerRoot, 'sessions');
      const archiveDir = path.join(ledgerRoot, 'archive');
      const metaDir = path.join(ledgerRoot, '.meta');
      const indexPath = path.join(ledgerRoot, 'index.yaml');
      const versionPath = path.join(metaDir, 'version.yaml');

      // Skip if already exists (idempotent)
      if (await fs.pathExists(ledgerRoot)) {
        result.skipped = true;
        return result;
      }

      // Create directory structure
      await fs.ensureDir(sessionsDir);
      await fs.ensureDir(archiveDir);
      await fs.ensureDir(metaDir);

      // Seed index.yaml
      const indexContent = this.buildIndexSeed();
      await fs.writeFile(indexPath, indexContent, 'utf8');

      // Seed .meta/version.yaml
      const versionContent = this.buildVersionSeed();
      await fs.writeFile(versionPath, versionContent, 'utf8');

      result.created = true;
      return result;
    } catch (error) {
      result.error = error.message;
      return result;
    }
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
  active: 0
  superseded: 0
  revoked: 0
  archived: 0
`;
  }

  /**
   * Build the seed content for bmad-ledger/.meta/version.yaml.
   * @returns {string}
   */
  buildVersionSeed() {
    return `version: ${this.schemaVersion}
`;
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
  schemaVersion = 1;
}

module.exports = new ScribeSetup();
