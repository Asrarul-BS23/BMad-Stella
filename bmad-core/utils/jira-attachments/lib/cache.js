'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MANIFEST_VERSION = '1.0.0';
const MANIFEST_FILENAME = 'manifest.json';
const ATTACHMENTS_DIRNAME = 'attachments';

function sanitizeTicketKey(key) {
  const cleaned = String(key).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!cleaned) throw new Error(`Invalid ticket key: ${key}`);
  return cleaned;
}

function sanitizeAttachmentId(id) {
  const cleaned = String(id || '').trim().replace(/[^A-Za-z0-9_-]/g, '');
  if (!cleaned) throw new Error(`Invalid attachment id: ${id}`);
  return cleaned.slice(0, 64);
}

// Unicode format / BiDi characters that can be used to disguise filenames
// (e.g. image.jpg<RLO>exe. displays as image.jpgexe.jpg).
const UNICODE_FORMAT_CHARS = /[\u202A-\u202E\u2066-\u2069\u200B-\u200F\uFEFF]/g;

function sanitizeFilename(name, fallbackId) {
  const base = String(name || `attachment-${fallbackId}`)
    .replace(/\u0000/g, '')
    .replace(UNICODE_FORMAT_CHARS, '')
    .replace(/[/\\]+/g, '_')
    .replace(/[\x00-\x1f<>:"|?*]+/g, '_')
    .replace(/^\.+/, '_')
    .trim();
  const truncated = base.length > 180 ? base.slice(0, 180) : base;
  return truncated || `attachment-${fallbackId}`;
}

function ticketCacheDir(cacheRoot, ticketKey) {
  return path.join(cacheRoot, sanitizeTicketKey(ticketKey));
}

async function ensureTicketCacheDir(cacheRoot, ticketKey) {
  const dir = ticketCacheDir(cacheRoot, ticketKey);
  await fsp.mkdir(path.join(dir, ATTACHMENTS_DIRNAME), { recursive: true });
  return dir;
}

async function readManifest(cacheRoot, ticketKey) {
  const manifestPath = path.join(ticketCacheDir(cacheRoot, ticketKey), MANIFEST_FILENAME);
  try {
    const contents = await fsp.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(contents);
    if (parsed?.manifestVersion !== MANIFEST_VERSION) return null;
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    return null;
  }
}

async function writeManifestAtomic(cacheRoot, ticketKey, manifest) {
  const dir = ticketCacheDir(cacheRoot, ticketKey);
  await fsp.mkdir(dir, { recursive: true });
  const finalPath = path.join(dir, MANIFEST_FILENAME);
  const tmpPath = path.join(dir, `.${MANIFEST_FILENAME}.${process.pid}.${Date.now()}.tmp`);
  const payload = `${JSON.stringify(manifest, null, 2)}\n`;
  await fsp.writeFile(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });
  await fsp.rename(tmpPath, finalPath);
  return finalPath;
}

function isCacheFresh(previousManifest, freshIssue) {
  if (!previousManifest?.ticket?.updated || !freshIssue?.fields?.updated) return false;
  if (previousManifest.ticket.updated !== freshIssue.fields.updated) return false;
  if (!Array.isArray(previousManifest.attachments)) return false;
  const freshAttachmentIds = new Set(
    (freshIssue.fields.attachment || []).map((a) => String(a.id)),
  );
  const cachedIds = new Set(previousManifest.attachments.map((a) => String(a.id)));
  if (freshAttachmentIds.size !== cachedIds.size) return false;
  for (const id of freshAttachmentIds) {
    if (!cachedIds.has(id)) return false;
  }
  for (const attachment of previousManifest.attachments) {
    if (!attachment.localPath) return false;
    try {
      const stat = fs.statSync(attachment.localPath);
      if (!stat.isFile()) return false;
      if (attachment.sizeBytes && stat.size !== attachment.sizeBytes) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(`sha256:${hash.digest('hex')}`));
  });
}

function attachmentTargetPath(cacheRoot, ticketKey, attachmentId, filename) {
  const safeId = sanitizeAttachmentId(attachmentId);
  const dir = path.join(ticketCacheDir(cacheRoot, ticketKey), ATTACHMENTS_DIRNAME);
  const safeName = sanitizeFilename(filename, safeId);
  const target = path.join(dir, `${safeId}__${safeName}`);
  const resolvedTarget = path.resolve(target);
  const resolvedDir = path.resolve(dir);
  if (!resolvedTarget.startsWith(resolvedDir + path.sep)) {
    throw new Error(`Resolved attachment path escapes cache directory: ${resolvedTarget}`);
  }
  return target;
}

module.exports = {
  MANIFEST_VERSION,
  MANIFEST_FILENAME,
  ATTACHMENTS_DIRNAME,
  sanitizeTicketKey,
  sanitizeAttachmentId,
  sanitizeFilename,
  ticketCacheDir,
  ensureTicketCacheDir,
  readManifest,
  writeManifestAtomic,
  isCacheFresh,
  hashFile,
  attachmentTargetPath,
};
