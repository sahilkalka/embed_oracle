// src/services/assetLocalizer.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');

const UPLOADS_SUBDIR = 'uploads/localized';
const UPLOADS_DIR = path.join(__dirname, '../../public', UPLOADS_SUBDIR);

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB max asset size
const REQUEST_TIMEOUT_MS = 12000;   // 12 seconds timeout
const MAX_REDIRECTS = 4;

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'image/bmp': '.bmp',
  'application/pdf': '.pdf'
};

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif', '.ico', '.bmp', '.pdf'
]);

const URL_FIELD_NAME_PATTERN = /(coverImage|imageUrl|thumbnailUrl|avatarUrl|logoUrl|faviconUrl|_img|_image|_logo|_icon|_banner|_thumb|_avatar|lead_magnet_file)$/i;

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/**
 * Checks if an IPv4 or IPv6 address belongs to loopback, private, link-local, or cloud metadata ranges.
 */
function isPrivateOrReservedIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  const normalized = ip.trim().toLowerCase();

  if (normalized === '::1' || normalized === '::' || normalized === '0.0.0.0') {
    return true;
  }

  // IPv4-mapped IPv6 addresses like ::ffff:127.0.0.1
  if (normalized.startsWith('::ffff:')) {
    return isPrivateOrReservedIp(normalized.slice(7));
  }

  const ipVersion = net.isIP(normalized);
  if (ipVersion === 4) {
    const parts = normalized.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // Link-local & cloud instance metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // Carrier-grade NAT
    if (a >= 224) return true; // Multicast & reserved
    return false;
  }

  if (ipVersion === 6) {
    if (
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff')
    ) {
      return true;
    }
    return false;
  }

  return true;
}

/**
 * Validates that a remote URL is safe to fetch (public HTTP/HTTPS host, not SSRF target).
 */
async function validatePublicUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    throw new Error('Invalid URL format.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs are supported.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URLs with embedded credentials are not allowed.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Local or internal hostnames are not allowed.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error('Private or reserved IP addresses are not allowed.');
    }
    return parsed;
  }

  let records;
  try {
    records = await dns.promises.lookup(hostname, { all: true });
  } catch (_) {
    throw new Error(`Unable to resolve hostname: ${hostname}`);
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(`No DNS records found for hostname: ${hostname}`);
  }

  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new Error('Target hostname resolves to a private or restricted IP address.');
    }
  }

  return parsed;
}

function isAlreadyLocalOrOwnAsset(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return true;
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (
      (host === 'embeddedindia.in' || host === 'www.embeddedindia.in') &&
      (parsed.pathname.startsWith('/uploads/') || parsed.pathname.startsWith('/assets/') || parsed.pathname.startsWith('/downloads/'))
    ) {
      return parsed.pathname;
    }
  } catch (_) {
    return true;
  }
  return false;
}

function buildFilenamePrefix(parsedUrl, rawUrl) {
  const urlHash = crypto.createHash('sha256').update(rawUrl.trim()).digest('hex').slice(0, 12);
  const rawBase = path.basename(parsedUrl.pathname || 'asset').replace(/\.[a-zA-Z0-9]+$/, '');
  const safeSlug = rawBase
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'asset';
  return { prefix: `${safeSlug}-${urlHash}`, urlHash };
}

function findExistingCachedFile(urlHash) {
  ensureUploadsDir();
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    const match = files.find((f) => f.includes(`-${urlHash}.`));
    return match ? `/${UPLOADS_SUBDIR}/${match}` : null;
  } catch (_) {
    return null;
  }
}

function detectExtensionFromBuffer(buffer, contentType, pathname) {
  const cleanMime = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (MIME_TO_EXT[cleanMime]) {
    return MIME_TO_EXT[cleanMime];
  }

  // Fallback magic byte detection for servers returning application/octet-stream or missing Content-Type
  if (buffer && buffer.length >= 12) {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return '.png';
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return '.jpg';
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return '.gif';
    if (
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
      return '.webp';
    }
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return '.pdf';
    const headStr = buffer.subarray(0, 512).toString('utf8').trim().toLowerCase();
    if (headStr.startsWith('<svg') || (headStr.startsWith('<?xml') && headStr.includes('<svg'))) {
      return '.svg';
    }
  }

  const extFromPath = path.extname(pathname || '').toLowerCase();
  if (ALLOWED_EXTENSIONS.has(extFromPath)) {
    return extFromPath === '.jpeg' ? '.jpg' : extFromPath;
  }

  return null;
}

function sanitizeSvgBuffer(buffer) {
  let svgText = buffer.toString('utf8');
  // Strip <script> tags, foreignObject, and inline on* event handlers from untrusted SVGs
  svgText = svgText
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
  return Buffer.from(svgText, 'utf8');
}

function fetchRemoteBuffer(targetUrl, redirectCount = 0) {
  return new Promise(async (resolve, reject) => {
    if (redirectCount > MAX_REDIRECTS) {
      return reject(new Error('Too many redirects while fetching remote asset.'));
    }

    let parsed;
    try {
      parsed = await validatePublicUrl(targetUrl);
    } catch (err) {
      return reject(err);
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(
      parsed,
      {
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EmbeddedIndiaAssetLocalizer/1.0; +https://embeddedindia.in)',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
      },
      (res) => {
        const status = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume();
          try {
            const nextUrl = new URL(res.headers.location, parsed).toString();
            return resolve(fetchRemoteBuffer(nextUrl, redirectCount + 1));
          } catch (err) {
            return reject(new Error('Invalid redirect URL from remote server.'));
          }
        }

        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new Error(`Remote server responded with HTTP ${status}.`));
        }

        const contentLength = parseInt(res.headers['content-length'] || '0', 10);
        if (contentLength > MAX_BYTES) {
          res.destroy();
          return reject(new Error('Remote asset exceeds the 15 MB size limit.'));
        }

        const chunks = [];
        let receivedBytes = 0;

        res.on('data', (chunk) => {
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_BYTES) {
            res.destroy(new Error('Remote asset exceeds the 15 MB size limit.'));
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          resolve({
            buffer: Buffer.concat(chunks),
            contentType: res.headers['content-type'] || '',
            finalUrl: parsed
          });
        });

        res.on('error', (err) => reject(err));
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Timed out while downloading remote asset.'));
    });

    req.on('error', (err) => reject(err));
  });
}

/**
 * Downloads a remote http(s) asset URL into public/uploads/localized/ and returns its local path.
 * @param {string} rawUrl
 * @param {{ strict?: boolean }} [options]
 */
async function localizeAssetUrl(rawUrl, options = {}) {
  const { strict = false } = options;
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { url: rawUrl, localized: false };
  }

  const trimmed = rawUrl.trim();
  const localCheck = isAlreadyLocalOrOwnAsset(trimmed);
  if (localCheck === true) {
    return { url: trimmed, localized: false };
  }
  if (typeof localCheck === 'string') {
    return { url: localCheck, localized: true, originalUrl: trimmed, cached: true };
  }

  try {
    const parsed = await validatePublicUrl(trimmed);
    const { prefix, urlHash } = buildFilenamePrefix(parsed, trimmed);

    const cachedPath = findExistingCachedFile(urlHash);
    if (cachedPath) {
      return { url: cachedPath, localized: true, originalUrl: trimmed, cached: true };
    }

    const { buffer, contentType, finalUrl } = await fetchRemoteBuffer(trimmed);
    if (!buffer || buffer.length === 0) {
      throw new Error('Downloaded file is empty.');
    }

    const ext = detectExtensionFromBuffer(buffer, contentType, finalUrl.pathname);
    if (!ext) {
      throw new Error(`Unsupported asset type (${contentType || 'unknown'}). Allowed: PNG, JPG, WEBP, GIF, SVG, AVIF, ICO, PDF.`);
    }

    const finalBuffer = ext === '.svg' ? sanitizeSvgBuffer(buffer) : buffer;
    ensureUploadsDir();
    const filename = `${prefix}${ext}`;
    const fullDiskPath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(fullDiskPath, finalBuffer);

    const publicUrl = `/${UPLOADS_SUBDIR}/${filename}`;
    return {
      url: publicUrl,
      localized: true,
      originalUrl: trimmed,
      cached: false,
      bytes: finalBuffer.length
    };
  } catch (err) {
    if (strict) {
      throw err;
    }
    console.warn(`[ASSET LOCALIZER] Kept remote URL (${trimmed}): ${err.message}`);
    return { url: trimmed, localized: false, error: err.message };
  }
}

/**
 * Finds external image URLs in Markdown (`![alt](https://...)` and `<img src="https://...">`),
 * downloads them locally into /uploads/localized/, and rewrites the Markdown.
 */
async function localizeMarkdownAssets(markdownText) {
  if (!markdownText || typeof markdownText !== 'string') {
    return { markdown: markdownText || '', localizedCount: 0, replacements: [] };
  }

  const urlsToLocalize = new Set();

  // 1. Markdown image syntax: ![alt](https://example.com/file.png "optional title")
  const mdImgRegex = /!\[[^\]]*\]\(\s*(https?:\/\/[^\s)"']+)(?:\s+["'][^"']*["'])?\s*\)/gi;
  let match;
  while ((match = mdImgRegex.exec(markdownText)) !== null) {
    if (match[1]) urlsToLocalize.add(match[1]);
  }

  // 2. HTML <img ... src="https://example.com/file.png" ...>
  const htmlImgRegex = /<img\b[^>]*?\bsrc\s*=\s*["'](https?:\/\/[^"'>\s]+)["'][^>]*>/gi;
  while ((match = htmlImgRegex.exec(markdownText)) !== null) {
    if (match[1]) urlsToLocalize.add(match[1]);
  }

  if (urlsToLocalize.size === 0) {
    return { markdown: markdownText, localizedCount: 0, replacements: [] };
  }

  const replacements = [];
  const urlMap = new Map();

  for (const remoteUrl of urlsToLocalize) {
    const result = await localizeAssetUrl(remoteUrl, { strict: false });
    if (result.localized && result.url && result.url !== remoteUrl) {
      urlMap.set(remoteUrl, result.url);
      replacements.push({ originalUrl: remoteUrl, localUrl: result.url, cached: Boolean(result.cached) });
    }
  }

  if (urlMap.size === 0) {
    return { markdown: markdownText, localizedCount: 0, replacements: [] };
  }

  let updatedMarkdown = markdownText;
  for (const [remoteUrl, localUrl] of urlMap.entries()) {
    updatedMarkdown = updatedMarkdown.split(remoteUrl).join(localUrl);
  }

  return {
    markdown: updatedMarkdown,
    localizedCount: replacements.length,
    replacements
  };
}

/**
 * Localizes external asset URLs in an object's fields in-place without adding or removing keys.
 */
async function localizeObjectAssetFields(fields, explicitKeys = []) {
  if (!fields || typeof fields !== 'object') return [];
  const keySet = new Set(explicitKeys);
  const localizedResults = [];

  for (const key of Object.keys(fields)) {
    const val = fields[key];
    if (typeof val !== 'string' || !val.trim()) continue;

    if (keySet.has(key) || URL_FIELD_NAME_PATTERN.test(key)) {
      const trimmed = val.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        const res = await localizeAssetUrl(trimmed, { strict: false });
        if (res.localized && res.url) {
          fields[key] = res.url;
          localizedResults.push({ field: key, originalUrl: trimmed, localUrl: res.url });
        }
      }
    }
  }

  return localizedResults;
}

module.exports = {
  localizeAssetUrl,
  localizeMarkdownAssets,
  localizeObjectAssetFields,
  UPLOADS_DIR,
  UPLOADS_SUBDIR
};
