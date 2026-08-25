const path = require('node:path');
const fsp = require('node:fs/promises');
const chalk = require('chalk').default || require('chalk');
const confluence = require('./confluence-client');

// Architecture pages are the direct children of architectureFolderUrl, minus the
// Domain-Knowledge subtree (handled by domain-knowledge-fetcher).
//
// File naming: agents read fixed paths from core-config (devLoadAlwaysFiles /
// plannerLoadAlwaysFiles), so pages whose slug starts with one of these
// canonical names are normalized to exactly that name regardless of project
// suffix (e.g. "Tech-Stack-sls-backend" -> tech-stack.md). Anything else keeps
// its slug with the project suffix stripped.
const CANONICAL_NAMES = ['coding-standards', 'tech-stack', 'project-structure', 'git-workflow'];

// Manifest consumed by the planner's activation cache check (planner.md STEP 5).
// Shape must stay: { pages: [{ pageId, title, version, lastModified, localFile }] }
// `version` = Confluence version.number, `lastModified` = version.when (ISO 8601).
// The planner compares these against getConfluencePageDescendants output without
// fetching page bodies.
const METADATA_FILE = '.metadata.json';

class ArchitectureDocsFetcher {
  // Returns { fetched, skipped, error } — never throws.
  // result.error is printed to the user: never include the token in it.
  async fetchAndPersist({
    installDir,
    architectureFolderUrl,
    domainKnowledgePageName = 'Domain-Knowledge',
  }) {
    const result = { fetched: 0, skipped: false, error: null };

    try {
      const targetDir = path.join(installDir, 'bmad-docs', 'architecture');

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

      const children = await confluence.listChildren(
        baseUrl,
        rootPageId,
        auth,
        'body.view,version,space',
      );
      const domainPage = confluence.matchByTitle(children, domainKnowledgePageName);
      const pages = children.filter((p) => !domainPage || p.id !== domainPage.id);

      if (pages.length === 0) {
        result.error = 'no architecture pages found under project root';
        return result;
      }

      const projectSuffix = confluence.deriveProjectSuffix(architectureFolderUrl);
      await fsp.mkdir(targetDir, { recursive: true });
      const usedSlugs = new Set();
      const manifest = [];

      for (const page of pages) {
        const content = confluence.pageToMarkdown(page, baseUrl);
        if (content === null) continue;
        const slug = confluence.uniqueSlug(
          this.normalizeSlug(page.title, projectSuffix),
          usedSlugs,
        );
        const localFile = await confluence.writePageFile(targetDir, slug, content);
        if (!localFile) continue;
        result.fetched++;
        manifest.push({
          pageId: String(page.id),
          title: page.title,
          version: page.version?.number ?? null,
          lastModified: page.version?.when ?? null,
          localFile,
        });
      }

      if (result.fetched === 0) {
        result.error = 'no architecture pages could be saved';
        return result;
      }

      await fsp.writeFile(
        path.join(targetDir, METADATA_FILE),
        JSON.stringify({ pages: manifest }, null, 2) + '\n',
        'utf8',
      );

      return result;
    } catch (error) {
      result.error = error.message;
      return result;
    }
  }

  /**
   * Map a Confluence page title to the file slug agents expect.
   * "Coding-Standards-dre" -> "coding-standards"; "Tech-Stack-sls-backend" -> "tech-stack";
   * "Deployment-Guide-dre" -> "deployment-guide".
   */
  normalizeSlug(title, projectSuffix) {
    const raw = title
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-+|-+$/g, '');
    const canonical = CANONICAL_NAMES.find((name) => raw === name || raw.startsWith(`${name}-`));
    if (canonical) return canonical;
    return confluence.slugify(title, projectSuffix);
  }

  showSummary(result) {
    if (result.skipped) return;
    if (result.error) {
      console.log(chalk.yellow(`⚠ Architecture docs prefetch skipped: ${result.error}`));
      console.log(chalk.dim('   Planner will fetch on first activation.'));
      return;
    }
    if (result.fetched > 0) {
      console.log(chalk.green(`✓ Fetched ${result.fetched} architecture page(s)`));
    }
  }
}

module.exports = new ArchitectureDocsFetcher();
