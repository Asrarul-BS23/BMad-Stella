'use strict';

const path = require('node:path');
const { execSync, spawnSync } = require('node:child_process');
const os = require('node:os');
const fs = require('fs-extra');
const chalk = require('chalk').default || require('chalk');
const resourceLocator = require('./resource-locator');

const PERSONALIZATION_FILE = path.join(os.homedir(), '.claude', 'personalization.md');
const PERSONALIZATION_TEMPLATE = path.join(
  resourceLocator.getBmadCorePath(),
  'templates',
  'memories',
  'personalization.md',
);
const MEMORIES_TEMPLATE_DIR = path.join(resourceLocator.getBmadCorePath(), 'templates', 'memories');

function getGitConfig(key) {
  try {
    return execSync(`git config ${key}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

async function initMemoryFolder(installDir, spinner) {
  const memoryDest = path.join(installDir, 'bmad-docs', 'memory');

  // Idempotent — skip if MEMORY.md already exists (brownfield re-install)
  if (await fs.pathExists(path.join(memoryDest, 'MEMORY.md'))) {
    console.log(chalk.dim('  bmad-docs/memory/ already initialized, skipping'));
    return;
  }

  if (spinner) spinner.text = 'Initializing bmad-docs/memory/...';

  await fs.ensureDir(memoryDest);
  await fs.copy(MEMORIES_TEMPLATE_DIR, memoryDest, { overwrite: false });

  console.log(chalk.green('✓ bmad-docs/memory/ initialized'));
}

async function seedPersonalization(spinner) {
  if (await fs.pathExists(PERSONALIZATION_FILE)) {
    console.log(chalk.dim('  ~/.claude/personalization.md already exists, skipping seed'));
    return;
  }

  if (spinner) spinner.text = 'Seeding ~/.claude/personalization.md...';

  const claudeDir = path.join(os.homedir(), '.claude');
  await fs.ensureDir(claudeDir);

  const gitName = getGitConfig('user.name') || 'Developer';
  const gitEmail = getGitConfig('user.email') || '';

  let template = '';
  if (await fs.pathExists(PERSONALIZATION_TEMPLATE)) {
    template = await fs.readFile(PERSONALIZATION_TEMPLATE, 'utf8');
  } else {
    template =
      '# Developer Personalization Profile\n\n- Name: {{git_name}}\n- Email: {{git_email}}\n';
  }

  const seeded = template.replaceAll('{{git_name}}', gitName).replaceAll('{{git_email}}', gitEmail);

  await fs.writeFile(PERSONALIZATION_FILE, seeded, 'utf8');

  console.log(chalk.green('✓ ~/.claude/personalization.md seeded from git config'));
  console.log(
    chalk.yellow('  ⚠️  Please complete Layer 1 profile in ~/.claude/personalization.md'),
  );
}

async function generateDomainMap(installDir, spinner) {
  const domainKnowledgeDir = path.join(installDir, 'bmad-docs', 'domain-knowledge');
  const domainMapPath = path.join(installDir, 'bmad-docs', 'memory', 'domain-map.md');

  // Reinstall protection — if last-updated has a real date the file was already populated
  // (by distiller or by the developer manually). Leave it unchanged.
  if (await fs.pathExists(domainMapPath)) {
    const content = await fs.readFile(domainMapPath, 'utf8');
    const lastUpdated = content.match(/last-updated:\s*"([^"]+)"/)?.[1]?.trim();
    if (lastUpdated) {
      console.log(chalk.dim('  domain-map.md already populated, skipping'));
      return;
    }
  }

  // No domain-knowledge/ source files — blank stub from template is the correct state.
  const hasDomainKnowledge =
    (await fs.pathExists(domainKnowledgeDir)) &&
    (await fs.readdir(domainKnowledgeDir)).some((f) => f.endsWith('.md'));

  if (!hasDomainKnowledge) {
    console.log(
      chalk.yellow(
        '  ⚠️  No domain knowledge found — domain-map.md left blank. Re-run installer with a Confluence URL to populate it automatically.',
      ),
    );
    return;
  }

  if (spinner) spinner.text = 'Distilling domain-map.md from domain-knowledge/...';
  if (spinner) spinner.stop();

  // Invoke the installed distiller script synchronously
  const distillerPath = path.join(
    installDir,
    '.claude',
    'bmad-hooks',
    'lib',
    'domain-map-distiller.js',
  );

  if (!(await fs.pathExists(distillerPath))) {
    console.log(
      chalk.yellow(
        '  ⚠️  Distiller not found at expected path. Run installer again after hooks are set up.',
      ),
    );
    if (spinner) spinner.start();
    return;
  }

  const result = spawnSync(process.execPath, [distillerPath, installDir], {
    timeout: 60_000,
    env: { ...process.env },
    encoding: 'utf8',
  });

  if (result.status === 0) {
    const output = (result.stdout || '').trim();
    if (output.includes('updated')) {
      console.log(chalk.green('✓ domain-map.md distilled from Confluence domain-knowledge pages'));
    } else {
      console.log(chalk.dim('  domain-map.md unchanged (already up-to-date)'));
    }
  } else {
    console.log(
      chalk.yellow(
        `  ⚠️  domain-map.md distillation failed: ${(result.stderr || '').slice(0, 200)}`,
      ),
    );
    console.log(chalk.dim('   The daily job will retry automatically on next session start.'));
  }

  if (spinner) spinner.start();
}

async function initialize(installDir, spinner) {
  try {
    if (spinner) spinner.stop();

    await initMemoryFolder(installDir, spinner);
    await seedPersonalization(spinner);
    await generateDomainMap(installDir, spinner);

    if (spinner) spinner.start();
  } catch (error) {
    console.log(chalk.yellow(`⚠️  Memory setup encountered an error: ${error.message}`));
    console.log(chalk.dim('   You can initialize memory manually by running the installer again.'));
    if (spinner) spinner.start();
  }
}

module.exports = { initialize };
