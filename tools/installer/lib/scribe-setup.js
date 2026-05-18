const path = require('node:path');
const fs = require('fs-extra');
const chalk = require('chalk').default || require('chalk');

class ScribeSetup {
  constructor() {}

  /**
   * Get the path to the bmad-notes directory in the install target.
   * @param {string} installDir
   * @returns {string}
   */
  getNotesDir(installDir) {
    return path.join(installDir, 'bmad-docs', 'bmad-notes');
  }

  /**
   * Get the path to the notes.md file in the install target.
   * @param {string} installDir
   * @returns {string}
   */
  getNotesFile(installDir) {
    return path.join(this.getNotesDir(installDir), 'notes.md');
  }

  /**
   * Create the notes skeleton.
   * Idempotent: skips creation if notes.md already exists.
   *
   * Layout:
   *   bmad-docs/
   *   └── bmad-notes/
   *       └── notes.md       (append-only NOTE entries)
   *
   * @param {string} installDir - Project root where bmad-docs/bmad-notes/ should live
   * @returns {Promise<{created: boolean, skipped: boolean, error: string|null}>}
   */
  async setup(installDir) {
    const result = { created: false, skipped: false, error: null };

    try {
      const notesDir = this.getNotesDir(installDir);
      const notesPath = this.getNotesFile(installDir);

      // Skip if notes file already exists (idempotent)
      if (await fs.pathExists(notesPath)) {
        result.skipped = true;
        return result;
      }

      // Create directory and seed notes.md
      await fs.ensureDir(notesDir);
      await fs.writeFile(notesPath, this.buildNotesSeed(), 'utf8');

      result.created = true;
      return result;
    } catch (error) {
      result.error = error.message;
      return result;
    }
  }

  /**
   * Build the seed content for notes.md.
   * @returns {string}
   */
  buildNotesSeed() {
    return '<!-- BMAD scribe notes. Append-only. Edit existing entries only via supersession/revoke marker. -->\n';
  }

  /**
   * Print one-line success summary.
   * @param {object} result - Result from setup()
   */
  showSummary(result) {
    if (result.error) {
      console.log(chalk.yellow(`⚠️  Could not initialize notes: ${result.error}`));
      return;
    }

    if (result.created) {
      console.log(chalk.green('✓ notes initialized'));
    }
    // skipped → silent (already there, no need to spam)
  }
}

module.exports = new ScribeSetup();
