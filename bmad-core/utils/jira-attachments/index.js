#!/usr/bin/env node
'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const { resolveConfig, validateConfig, ENV_KEYS } = require('./lib/config');
const { JiraClient, JiraError } = require('./lib/client');
const { collectAdfMediaFromIssue, summarizeDescription, extractPlainText } = require('./lib/adf');
const {
  MANIFEST_VERSION,
  ensureTicketCacheDir,
  readManifest,
  writeManifestAtomic,
  isCacheFresh,
  hashFile,
  attachmentTargetPath,
  sanitizeTicketKey,
  ticketCacheDir,
} = require('./lib/cache');

const EXIT_CODES = Object.freeze({
  OK: 0,
  CONFIG: 10,
  AUTH: 20,
  NOT_FOUND: 30,
  NETWORK: 40,
  PARSE: 50,
  UNKNOWN: 1,
});

function createLogger({ quiet = false } = {}) {
  const stderr = process.stderr;
  function write(level, message) {
    if (quiet && level === 'debug') return;
    const timestamp = new Date().toISOString();
    stderr.write(`[${timestamp}] [${level}] ${message}\n`);
  }
  return {
    info: (msg) => write('info', msg),
    warn: (msg) => write('warn', msg),
    error: (msg) => write('error', msg),
    debug: (msg) => write('debug', msg),
  };
}

function parseArgs(argv) {
  const args = {
    positional: [],
    cacheRoot: null,
    dryRun: false,
    selfTest: false,
    forceRefresh: false,
    quiet: false,
    help: false,
    projectRoot: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help': {
        args.help = true;
        break;
      }
      case '--dry-run': {
        args.dryRun = true;
        break;
      }
      case '--self-test': {
        args.selfTest = true;
        break;
      }
      case '--force-refresh': {
        args.forceRefresh = true;
        break;
      }
      case '--quiet': {
        args.quiet = true;
        break;
      }
      case '--cache-root': {
        args.cacheRoot = argv[++i];
        break;
      }
      case '--project-root': {
        args.projectRoot = argv[++i];
        break;
      }
      default: {
        if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
        args.positional.push(arg);
      }
    }
  }
  return args;
}

function printHelp() {
  const lines = [
    'bmad-stella jira-attachments — fetch Jira text + attachments for a ticket',
    '',
    'Usage:',
    '  node .bmad-core/utils/jira-attachments <TICKET-KEY | URL> [flags]',
    '',
    'Flags:',
    '  --self-test           Validate credentials without downloading',
    '  --dry-run             Print plan, skip downloads and cache writes',
    '  --force-refresh       Ignore existing cache',
    '  --quiet               Suppress debug logs',
    '  --cache-root DIR      Override cache directory',
    '  --project-root DIR    Override project root for .env lookup',
    '  -h, --help            Show this help',
    '',
    'Environment:',
    `  ${ENV_KEYS.baseUrl}       Atlassian site origin (https://<tenant>.atlassian.net)`,
    `  ${ENV_KEYS.email}          Atlassian account email`,
    `  ${ENV_KEYS.token}      Atlassian API token`,
    `  ${ENV_KEYS.cacheDir}  Override for cache root (optional)`,
    '',
    'Exit codes: 0=ok, 10=config, 20=auth, 30=not-found, 40=network, 50=parse',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

function extractIssueKey(input) {
  if (!input) throw new Error('Ticket key or URL is required.');
  const trimmed = String(input).trim();
  if (/^[A-Z][A-Z0-9_]+-\d+$/.test(trimmed)) return trimmed.toUpperCase();
  try {
    const url = new URL(trimmed);
    const browseMatch = url.pathname.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/i);
    if (browseMatch) return browseMatch[1].toUpperCase();
    const queryKey = url.searchParams.get('selectedIssue') || url.searchParams.get('issueKey');
    if (queryKey && /^[A-Z][A-Z0-9_]+-\d+$/i.test(queryKey)) return queryKey.toUpperCase();
  } catch {
    // fall through
  }
  throw new Error(`Could not parse ticket key from input: ${input}`);
}

function classifyMime(mimeType, allowedPrefixes) {
  if (!mimeType) return { allowed: false, reason: 'mime-missing' };
  const lower = mimeType.toLowerCase();
  const allowed = allowedPrefixes.some((prefix) => lower.startsWith(prefix));
  return { allowed, reason: allowed ? null : 'mime-not-allowed' };
}

async function runWithConcurrency(items, limit, handler) {
  const results = Array.from({ length: items.length });
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      results[current] = await handler(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

function buildAttachmentPlan(issue, adfLocations, config) {
  const rawList = Array.isArray(issue?.fields?.attachment) ? issue.fields.attachment : [];
  const filenamesReferencedInline = new Set();
  for (const loc of adfLocations) {
    for (const ref of loc.refs) {
      if (ref.fileName) filenamesReferencedInline.add(ref.fileName);
    }
  }

  const planned = [];
  const skipped = [];

  for (const item of rawList) {
    const mime = classifyMime(item.mimeType, config.allowedMimePrefixes);
    const size = Number(item.size) || 0;
    if (!mime.allowed) {
      skipped.push({
        id: String(item.id),
        filename: item.filename,
        mimeType: item.mimeType || null,
        sizeBytes: size,
        reason: mime.reason,
      });
      continue;
    }
    if (size > config.maxAttachmentBytes) {
      skipped.push({
        id: String(item.id),
        filename: item.filename,
        mimeType: item.mimeType || null,
        sizeBytes: size,
        reason: 'exceeds-max-size',
      });
      continue;
    }
    planned.push({
      id: String(item.id),
      filename: item.filename,
      mimeType: item.mimeType,
      sizeBytes: size,
      contentUrl: item.content,
      created: item.created || null,
      authorDisplayName: item?.author?.displayName || null,
      referencedInline: filenamesReferencedInline.has(item.filename),
    });
  }

  return { planned, skipped };
}

function buildCommentSummaries(issue) {
  const comments = issue?.fields?.comment?.comments;
  if (!Array.isArray(comments)) return [];
  return comments.map((c) => ({
    id: c.id || null,
    author: c?.author?.displayName || null,
    created: c.created || null,
    updated: c.updated || null,
    text: c.body ? extractPlainText(c.body) : '',
  }));
}

async function handleDownloads(client, plan, ticketKey, config, logger) {
  const cacheDir = ticketCacheDir(config.cacheRoot, ticketKey);
  await ensureTicketCacheDir(config.cacheRoot, ticketKey);

  const results = await runWithConcurrency(plan, config.concurrency, async (item) => {
    const target = attachmentTargetPath(config.cacheRoot, ticketKey, item.id, item.filename);
    try {
      logger.debug(`Downloading ${item.filename} (${item.id}) → ${path.relative(cacheDir, target)}`);
      await client.downloadAttachmentToFile({ content: item.contentUrl, filename: item.filename }, target);
      const checksum = await hashFile(target);
      const stat = await fsp.stat(target);
      return {
        ...item,
        localPath: target,
        checksum,
        downloadedAt: new Date().toISOString(),
        sizeOnDiskBytes: stat.size,
        status: 'downloaded',
        source: item.referencedInline ? 'attachment+inline' : 'attachment',
      };
    } catch (error) {
      logger.warn(`Failed to download ${item.filename}: ${error.message}`);
      return {
        ...item,
        status: 'failed',
        error: error.message,
        code: error.code || null,
      };
    }
  });

  return results;
}

function buildManifest({ issue, ticketKey, config, downloads, skipped, adfLocations, startMs }) {
  const durationMs = Math.round(performance.now() - startMs);
  const summary = {
    total: downloads.length + skipped.length,
    downloaded: downloads.filter((d) => d.status === 'downloaded').length,
    failed: downloads.filter((d) => d.status === 'failed').length,
    skipped: skipped.length,
  };

  return {
    $schema: 'bmad-stella/jira-attachments/manifest-v1',
    manifestVersion: MANIFEST_VERSION,
    ticket: {
      key: ticketKey,
      id: issue?.id || null,
      url: `${config.baseUrl}/browse/${ticketKey}`,
      title: issue?.fields?.summary || null,
      status: issue?.fields?.status?.name || null,
      type: issue?.fields?.issuetype?.name || null,
      updated: issue?.fields?.updated || null,
      project: issue?.fields?.project?.key || null,
    },
    description: summarizeDescription(issue),
    comments: buildCommentSummaries(issue),
    adfMediaReferences: adfLocations,
    attachments: downloads
      .filter((d) => d.status === 'downloaded')
      .map((d) => ({
        id: d.id,
        filename: d.filename,
        localPath: d.localPath,
        mimeType: d.mimeType,
        sizeBytes: d.sizeOnDiskBytes,
        checksum: d.checksum,
        source: d.source,
        referencedInline: d.referencedInline,
        created: d.created,
        author: d.authorDisplayName,
        downloadedAt: d.downloadedAt,
      })),
    failures: downloads
      .filter((d) => d.status === 'failed')
      .map((d) => ({
        id: d.id,
        filename: d.filename,
        error: d.error,
        code: d.code,
      })),
    skipped,
    cache: {
      root: config.cacheRoot,
    },
    fetchedAt: new Date().toISOString(),
    fetchDurationMs: durationMs,
    summary,
  };
}

async function selfTest(config, logger) {
  logger.info('Running self-test (no downloads)');
  const client = new JiraClient(config, logger);
  const base = config.baseUrl.replace(/\/$/, '');
  const url = `${base}/rest/api/3/myself`;
  const response = await client.fetchWithRetry(url);
  const me = await response.json();
  logger.info(`Authenticated as ${me.emailAddress || me.displayName || 'unknown'}`);
  process.stdout.write(
    `${JSON.stringify({ ok: true, account: me.emailAddress || null, displayName: me.displayName || null }, null, 2)}\n`,
  );
}

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`[error] ${error.message}\n`);
    process.stderr.write(`Run --help for usage.\n`);
    return EXIT_CODES.CONFIG;
  }
  if (args.help) {
    printHelp();
    return EXIT_CODES.OK;
  }

  const logger = createLogger({ quiet: args.quiet });
  const config = resolveConfig({ projectRoot: args.projectRoot });
  if (args.cacheRoot) config.cacheRoot = path.resolve(config.projectRoot, args.cacheRoot);

  if (config.baseUrlWarning) {
    logger.error(`Invalid JIRA_BASE_URL — ${config.baseUrlWarning}`);
    return EXIT_CODES.CONFIG;
  }

  const validation = validateConfig(config);
  if (!validation.ok) {
    logger.error(
      `Missing credentials: ${validation.missing.join(', ')}. Set them as env vars or in .env at ${config.projectRoot}.`,
    );
    return EXIT_CODES.CONFIG;
  }

  if (args.selfTest) {
    try {
      await selfTest(config, logger);
      return EXIT_CODES.OK;
    } catch (error) {
      logger.error(error.message);
      return mapErrorToExit(error);
    }
  }

  if (args.positional.length === 0) {
    logger.error('A Jira ticket key or URL is required. Use --help for usage.');
    return EXIT_CODES.CONFIG;
  }

  let ticketKey;
  try {
    ticketKey = sanitizeTicketKey(extractIssueKey(args.positional[0]));
  } catch (error) {
    logger.error(error.message);
    return EXIT_CODES.CONFIG;
  }

  const startMs = performance.now();
  const client = new JiraClient(config, logger);
  let issue;
  try {
    logger.info(`Fetching issue ${ticketKey} from ${config.baseUrl}`);
    issue = await client.fetchIssue(ticketKey);
  } catch (error) {
    logger.error(error.message);
    return mapErrorToExit(error);
  }

  const adfLocations = collectAdfMediaFromIssue(issue);
  const { planned, skipped } = buildAttachmentPlan(issue, adfLocations, config);

  logger.info(
    `Ticket "${issue?.fields?.summary || ticketKey}" → ${planned.length} attachment(s) planned, ${skipped.length} skipped`,
  );

  const previous = await readManifest(config.cacheRoot, ticketKey);
  if (!args.forceRefresh && isCacheFresh(previous, issue)) {
    logger.info('Cache fresh — reusing existing manifest and files');
    const manifestPath = path.join(ticketCacheDir(config.cacheRoot, ticketKey), 'manifest.json');
    previous.cache = { ...(previous.cache || {}), hit: true, reason: 'ticket-unchanged' };
    await writeManifestAtomic(config.cacheRoot, ticketKey, previous);
    emitResult(manifestPath, previous);
    return EXIT_CODES.OK;
  }

  if (args.dryRun) {
    logger.info('Dry-run: skipping downloads and cache writes');
    const manifest = buildManifest({
      issue,
      ticketKey,
      config,
      downloads: planned.map((p) => ({ ...p, status: 'planned' })),
      skipped,
      adfLocations,
      startMs,
    });
    process.stdout.write(`${JSON.stringify({ dryRun: true, manifest }, null, 2)}\n`);
    return EXIT_CODES.OK;
  }

  let downloads = [];
  try {
    downloads = await handleDownloads(client, planned, ticketKey, config, logger);
  } catch (error) {
    logger.error(`Unexpected download error: ${error.message}`);
    return mapErrorToExit(error);
  }

  const manifest = buildManifest({ issue, ticketKey, config, downloads, skipped, adfLocations, startMs });
  manifest.cache = { ...(manifest.cache || {}), hit: false, reason: args.forceRefresh ? 'force-refresh' : 'ticket-updated' };

  const manifestPath = await writeManifestAtomic(config.cacheRoot, ticketKey, manifest);
  emitResult(manifestPath, manifest);

  if (manifest.summary.failed > 0) return EXIT_CODES.NETWORK;
  return EXIT_CODES.OK;
}

function emitResult(manifestPath, manifest) {
  const payload = {
    ok: true,
    manifestPath,
    ticketKey: manifest.ticket.key,
    attachmentCount: manifest.attachments.length,
    failedCount: manifest.failures?.length || 0,
    skippedCount: manifest.skipped?.length || 0,
    cacheHit: Boolean(manifest.cache?.hit),
    fetchDurationMs: manifest.fetchDurationMs,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function mapErrorToExit(error) {
  if (!(error instanceof JiraError)) return EXIT_CODES.UNKNOWN;
  switch (error.code) {
    case 'E_AUTH': {
      return EXIT_CODES.AUTH;
    }
    case 'E_NOT_FOUND': {
      return EXIT_CODES.NOT_FOUND;
    }
    case 'E_NETWORK': {
      return EXIT_CODES.NETWORK;
    }
    case 'E_PARSE': {
      return EXIT_CODES.PARSE;
    }
    default: {
      return EXIT_CODES.UNKNOWN;
    }
  }
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`[fatal] ${error.stack || error.message}\n`);
      process.exitCode = EXIT_CODES.UNKNOWN;
    });
}

module.exports = {
  main,
  EXIT_CODES,
  extractIssueKey,
};
