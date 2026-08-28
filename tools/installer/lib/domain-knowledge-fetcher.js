const path = require('node:path');
const fsp = require('node:fs/promises');
const chalk = require('chalk').default || require('chalk');
const confluence = require('./confluence-client');

class DomainKnowledgeFetcher {
  // Fetch the Domain-Knowledge subtree from Confluence and persist as markdown.
  // Returns { fetched, skipped, error } — never throws.
  // Construct Error messages without including the auth token or any value
  // derived from it. result.error is printed to the user.
  async fetchAndPersist({
    installDir,
    architectureFolderUrl,
    domainKnowledgePageName = 'Domain-Knowledge',
  }) {
    const result = { fetched: 0, skipped: false, error: null };

    try {
      const targetDir = path.join(installDir, 'bmad-docs', 'domain-knowledge');

      if (await confluence.dirHasFiles(targetDir)) {
        result.skipped = true;
        return result;
      }

      const creds = await confluence.readCreds(installDir);
      if (!creds) {
        result.error = 'no Atlassian credentials in .env';
        return result;
      }

      const root = confluence.resolveRoot(architectureFolderUrl, creds);
      if (root.error) {
        result.error = root.error;
        return result;
      }
      const { baseUrl, rootPageId, auth } = root;

      const domainPage = await confluence.findChild(
        baseUrl,
        rootPageId,
        domainKnowledgePageName,
        auth,
      );
      if (!domainPage) {
        result.error = `no '${domainKnowledgePageName}' child page found under project root`;
        return result;
      }

      const descendants = await confluence.listDescendants(baseUrl, domainPage.id, auth);
      if (descendants.length === 0) {
        result.error = `'${domainKnowledgePageName}' page has no descendants`;
        return result;
      }

      const projectSuffix = confluence.deriveProjectSuffix(architectureFolderUrl);
      await fsp.mkdir(targetDir, { recursive: true });
      const usedSlugs = new Set();

      for (const page of descendants) {
        const content = confluence.pageToMarkdown(page, baseUrl);
        if (content === null) continue;
        const slug = confluence.uniqueSlug(
          confluence.slugify(page.title, projectSuffix),
          usedSlugs,
        );
        const written = await confluence.writePageFile(targetDir, slug, content);
        if (written) result.fetched++;
      }

      return result;
    } catch (error) {
      result.error = error.message;
      return result;
    }
  }

  showSummary(result) {
    if (result.skipped) return;
    if (result.error) {
      console.log(chalk.yellow(`⚠ Domain knowledge prefetch skipped: ${result.error}`));
      console.log(chalk.dim('   Sage will fetch on first activation.'));
      return;
    }
    if (result.fetched > 0) {
      console.log(chalk.green(`✓ Fetched ${result.fetched} domain knowledge page(s)`));
    }
  }
}

module.exports = new DomainKnowledgeFetcher();
