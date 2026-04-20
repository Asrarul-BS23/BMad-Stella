'use strict';

const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const fs = require('node:fs');

class JiraError extends Error {
  constructor(message, { code, status, cause } = {}) {
    super(message);
    this.name = 'JiraError';
    this.code = code || 'E_JIRA';
    this.status = status || null;
    if (cause) this.cause = cause;
  }
}

const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

// Hosts the Atlassian CDN uses when serving attachment content.
// The base Jira host origin is always trusted (matched separately).
const ATLASSIAN_TRUSTED_HOST_SUFFIXES = Object.freeze([
  '.atlassian.net',
  '.atlassian.com',
  '.atl-paas.net',
  '.atlassian-cdn.com',
]);

function isTrustedAttachmentUrl(rawUrl, baseUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  let baseHost = null;
  try {
    baseHost = new URL(baseUrl).host.toLowerCase();
  } catch {
    return false;
  }
  const host = parsed.host.toLowerCase();
  if (host === baseHost) return true;
  return ATLASSIAN_TRUSTED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function computeBackoff(attempt, retryAfterHeader) {
  if (retryAfterHeader) {
    const retryAfterSeconds = Number.parseFloat(retryAfterHeader);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.min(retryAfterSeconds * 1000, 15_000);
    }
  }
  const base = Math.min(500 * 2 ** (attempt - 1), 8000);
  const jitter = Math.floor(Math.random() * 300);
  return base + jitter;
}

function basicAuthHeader(email, token) {
  const raw = `${email}:${token}`;
  return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
}

class JiraClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.authHeader = basicAuthHeader(config.email, config.token);
  }

  async fetchWithRetry(url, options = {}) {
    const { acceptBinary = false, expectJson = true } = options;
    const headers = {
      Authorization: this.authHeader,
      Accept: acceptBinary ? '*/*' : 'application/json',
      'User-Agent': 'bmad-stella-jira-attachments/1.0',
      ...(options.headers || {}),
    };

    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const signal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(this.config.requestTimeoutMs)
          : undefined;

      try {
        const response = await fetch(url, {
          method: options.method || 'GET',
          headers,
          redirect: 'follow',
          signal,
        });

        if (response.ok) {
          return response;
        }

        if (response.status === 401 || response.status === 403) {
          const body = await safeReadText(response);
          throw new JiraError(
            `Authentication failed (${response.status}). Verify JIRA_EMAIL and JIRA_API_TOKEN.`,
            { code: 'E_AUTH', status: response.status, cause: body },
          );
        }

        if (response.status === 404) {
          const body = await safeReadText(response);
          throw new JiraError(`Resource not found (404): ${url}`, {
            code: 'E_NOT_FOUND',
            status: 404,
            cause: body,
          });
        }

        if (RETRY_STATUS.has(response.status) && attempt < MAX_ATTEMPTS) {
          const delay = computeBackoff(attempt, response.headers.get('retry-after'));
          this.logger?.debug?.(
            `Retryable status ${response.status} on attempt ${attempt}/${MAX_ATTEMPTS}; sleeping ${delay}ms`,
          );
          await sleep(delay);
          continue;
        }

        const body = await safeReadText(response);
        throw new JiraError(`Request failed (${response.status}) for ${url}`, {
          code: 'E_HTTP',
          status: response.status,
          cause: body,
        });
      } catch (error) {
        if (error instanceof JiraError) throw error;
        lastError = error;
        const isAbort = error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
        const isNetwork =
          error?.code === 'ENOTFOUND' ||
          error?.code === 'ECONNRESET' ||
          error?.code === 'ECONNREFUSED' ||
          error?.code === 'ETIMEDOUT' ||
          isAbort;
        if (!isNetwork || attempt === MAX_ATTEMPTS) {
          throw new JiraError(`Network error contacting Jira: ${error.message}`, {
            code: 'E_NETWORK',
            cause: error,
          });
        }
        const delay = computeBackoff(attempt, null);
        this.logger?.debug?.(
          `Network error on attempt ${attempt}/${MAX_ATTEMPTS} (${error.code || error.name}); sleeping ${delay}ms`,
        );
        await sleep(delay);
      }

      if (expectJson && !acceptBinary) {
        // unreachable; kept for lint clarity
      }
    }

    throw new JiraError(`Exhausted retries contacting Jira`, {
      code: 'E_NETWORK',
      cause: lastError,
    });
  }

  async fetchIssue(issueKey) {
    const base = this.config.baseUrl.replace(/\/$/, '');
    const params = new URLSearchParams({
      fields: 'attachment,description,comment,summary,status,updated,issuetype,project',
      expand: 'renderedFields',
    });
    const url = `${base}/rest/api/3/issue/${encodeURIComponent(issueKey)}?${params.toString()}`;
    const response = await this.fetchWithRetry(url);
    try {
      return await response.json();
    } catch (error) {
      throw new JiraError(`Failed to parse issue JSON for ${issueKey}: ${error.message}`, {
        code: 'E_PARSE',
        cause: error,
      });
    }
  }

  async downloadAttachmentToFile(attachment, destinationPath, { maxBytes } = {}) {
    if (!isTrustedAttachmentUrl(attachment.content, this.config.baseUrl)) {
      throw new JiraError(
        `Refusing to download attachment from untrusted host: ${attachment.content}`,
        { code: 'E_UNTRUSTED_URL' },
      );
    }

    const response = await this.fetchWithRetry(attachment.content, { acceptBinary: true });
    if (!response.body) {
      throw new JiraError(`Attachment response body missing for ${attachment.filename}`, {
        code: 'E_NETWORK',
      });
    }

    const limit = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : this.config.maxAttachmentBytes;

    const declaredLength = Number.parseInt(response.headers.get('content-length') || '', 10);
    if (Number.isFinite(declaredLength) && declaredLength > limit) {
      throw new JiraError(
        `Attachment ${attachment.filename} exceeds size limit (${declaredLength} > ${limit} bytes)`,
        { code: 'E_TOO_LARGE' },
      );
    }

    const nodeStream =
      typeof Readable.fromWeb === 'function' ? Readable.fromWeb(response.body) : response.body;
    const fileStream = fs.createWriteStream(destinationPath);
    const limiter = createByteLimiter(limit, attachment.filename);

    try {
      await pipeline(nodeStream, limiter, fileStream);
    } catch (error) {
      fs.promises
        .unlink(destinationPath)
        .catch(() => {
          /* best effort cleanup */
        });
      if (error instanceof JiraError) throw error;
      throw new JiraError(`Failed to stream attachment ${attachment.filename}: ${error.message}`, {
        code: 'E_NETWORK',
        cause: error,
      });
    }
  }
}

function createByteLimiter(maxBytes, filename) {
  let received = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > maxBytes) {
        callback(
          new JiraError(
            `Attachment ${filename} exceeds size limit (>${maxBytes} bytes) during streaming`,
            { code: 'E_TOO_LARGE' },
          ),
        );
        return;
      }
      callback(null, chunk);
    },
  });
}

async function safeReadText(response) {
  try {
    const text = await response.text();
    return text?.slice(0, 500) || null;
  } catch {
    return null;
  }
}

module.exports = {
  JiraClient,
  JiraError,
};
