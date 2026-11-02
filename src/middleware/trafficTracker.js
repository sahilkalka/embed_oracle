const crypto = require('crypto');
const EventEmitter = require('events');
const net = require('net');
const prisma = require('../services/db');

// Optional external libraries with built-in zero-dependency fallbacks
let geoip = null;
let UAParser = null;
try {
    geoip = require('geoip-lite');
} catch (_) {
    geoip = null;
}
try {
    UAParser = require('ua-parser-js');
} catch (_) {
    UAParser = null;
}

const trafficEvents = new EventEmitter();
trafficEvents.setMaxListeners(100);

const HASH_SALT = process.env.TRAFFIC_HASH_SALT || 'embedded-india-telemetry-salt-2026';
const SESSION_TTL_MS = 5 * 60 * 1000; // 5-minute sliding window
const MAX_WIRE_LOG_SIZE = 500;

// In-memory 5-minute sliding session pool: Map<visitorHash, { lastSeen: number, route: string, geo: object, client: object }>
const activeSessions = new Map();

// In-memory rolling wire log of recent requests (newest first)
const wireLog = [];

// Cached visitor hashes from the shared SQLite telemetry block list
const blockedHashes = new Set();
let blockedHashCacheReady = false;
let blockedHashRefreshPromise = null;
const BLOCK_HASH_REFRESH_MS = 5000;

// Asset and excluded path regex
const ASSET_EXTENSION_REGEX = /\.(css|js|mjs|cjs|png|jpg|jpeg|gif|webp|avif|svg|ico|woff|woff2|ttf|eot|otf|map|txt|xml|webmanifest)$/i;
const EXCLUDED_PATHS = new Set([
    '/api/traffic/live',
    '/admin/traffic/live',
    '/health',
    '/favicon.ico'
]);

const COUNTRY_NAMES = {
    IN: 'India',
    US: 'United States',
    DE: 'Germany',
    GB: 'United Kingdom',
    SG: 'Singapore',
    JP: 'Japan',
    CA: 'Canada',
    AU: 'Australia',
    FR: 'France',
    NL: 'Netherlands',
    KR: 'South Korea',
    TW: 'Taiwan',
    SE: 'Sweden',
    CH: 'Switzerland'
};

function refreshBlockedHashes() {
    if (blockedHashRefreshPromise) return blockedHashRefreshPromise;
    blockedHashRefreshPromise = prisma.telemetryBlock.findMany({
        select: { visitorHash: true }
    }).then(rows => {
        blockedHashes.clear();
        for (const row of rows) {
            if (/^[a-f0-9]{16}$/i.test(row.visitorHash || '')) {
                blockedHashes.add(String(row.visitorHash).toLowerCase());
            }
        }
        blockedHashCacheReady = true;
        return true;
    }).catch(error => {
        console.error('[TRAFFIC] Failed to refresh blocked visitor hashes:', error);
        return false;
    }).finally(() => {
        blockedHashRefreshPromise = null;
    });
    return blockedHashRefreshPromise;
}

const initialBlockedHashRefresh = refreshBlockedHashes();
const blockedHashRefreshTimer = setInterval(refreshBlockedHashes, BLOCK_HASH_REFRESH_MS);
if (blockedHashRefreshTimer && typeof blockedHashRefreshTimer.unref === 'function') {
    blockedHashRefreshTimer.unref();
}

function countryCodeToFlag(code) {
    if (!code || typeof code !== 'string' || !/^[A-Z]{2}$/i.test(code)) return '🌐';
    const upper = code.toUpperCase();
    return String.fromCodePoint(...[...upper].map(c => 0x1F1E6 - 65 + c.charCodeAt(0)));
}

function expandIpv6(address) {
    let value = address.toLowerCase();
    const lastColon = value.lastIndexOf(':');
    const embeddedIpv4 = lastColon >= 0 ? value.slice(lastColon + 1) : '';
    if (net.isIP(embeddedIpv4) === 4) {
        const octets = embeddedIpv4.split('.').map(Number);
        const high = ((octets[0] << 8) | octets[1]).toString(16);
        const low = ((octets[2] << 8) | octets[3]).toString(16);
        value = `${value.slice(0, lastColon)}:${high}:${low}`;
    }

    const halves = value.split('::');
    if (halves.length > 2) return null;
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;

    const parts = [
        ...left,
        ...Array(missing).fill('0'),
        ...right
    ];
    if (parts.length !== 8 || parts.some(part => !/^[0-9a-f]{1,4}$/.test(part))) return null;
    return parts.map(part => parseInt(part, 16));
}

function normalizeIpAddress(value) {
    let address = String(value || '').trim();
    if (!address) return null;
    if (address.startsWith('[')) {
        const closingBracket = address.indexOf(']');
        if (closingBracket > 0) address = address.slice(1, closingBracket);
    } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(address)) {
        address = address.replace(/:\d+$/, '');
    }
    address = address.replace(/%.+$/, '');
    const version = net.isIP(address);
    if (!version) return null;

    if (version === 6) {
        const parts = expandIpv6(address);
        if (parts && parts.slice(0, 5).every(part => part === 0) && parts[5] === 0xffff) {
            return [
                parts[6] >> 8,
                parts[6] & 255,
                parts[7] >> 8,
                parts[7] & 255
            ].join('.');
        }
    }
    return address.toLowerCase();
}

function isNonPublicIp(address) {
    const version = net.isIP(address);
    if (version === 4) {
        const [a, b, c] = address.split('.').map(Number);
        return (
            a === 0 ||
            a === 10 ||
            a === 127 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 192 && b === 0 && (c === 0 || c === 2)) ||
            (a === 192 && b === 88 && c === 99) ||
            (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) ||
            (a === 203 && b === 0 && c === 113) ||
            a >= 224
        );
    }
    if (version !== 6) return true;

    const parts = expandIpv6(address);
    if (!parts) return true;
    if (parts.every(part => part === 0)) return true;
    if (parts.slice(0, 7).every(part => part === 0) && parts[7] === 1) return true;
    if (parts.slice(0, 5).every(part => part === 0) && parts[5] === 0xffff) {
        const mappedIpv4 = [
            parts[6] >> 8,
            parts[6] & 255,
            parts[7] >> 8,
            parts[7] & 255
        ].join('.');
        return isNonPublicIp(mappedIpv4);
    }
    if (parts.slice(0, 6).every(part => part === 0)) return true;

    const first = parts[0];
    return (
        (first & 0xfe00) === 0xfc00 ||
        (first & 0xffc0) === 0xfe80 ||
        (first & 0xff00) === 0xff00
    );
}

function extractRealIp(req) {
    const headers = req.headers || {};
    const forwardedFor = headers['x-forwarded-for'];
    const candidates = [
        headers['cf-connecting-ip'],
        ...(Array.isArray(forwardedFor) ? forwardedFor : String(forwardedFor || '').split(',')),
        req.socket && req.socket.remoteAddress,
        req.ip
    ];

    for (const candidate of candidates) {
        const address = normalizeIpAddress(candidate);
        if (address && !isNonPublicIp(address)) return address;
    }
    return null;
}

function computeVisitorHash(ip) {
    const address = normalizeIpAddress(ip);
    if (!address || isNonPublicIp(address)) return null;
    return crypto
        .createHash('sha256')
        .update(`${address}:${HASH_SALT}`)
        .digest('hex')
        .slice(0, 16);
}

function geoLookup(clientIp, reqHeaders = {}) {
    const address = normalizeIpAddress(clientIp);
    if (address && !isNonPublicIp(address) && geoip) {
        try {
            const hit = geoip.lookup(address);
            if (hit) {
                const code = /^[A-Z]{2}$/i.test(String(hit.country || ''))
                    ? String(hit.country).toUpperCase()
                    : 'Unknown';
                return {
                    countryCode: code,
                    country: code === 'Unknown' ? 'Unknown' : (COUNTRY_NAMES[code] || code),
                    city: hit.city || 'Unknown',
                    flag: countryCodeToFlag(code)
                };
            }
        } catch (error) {
            console.warn('[TRAFFIC] GeoIP lookup failed:', error.message);
        }
    }

    const rawCountry = reqHeaders['cf-ipcountry'] || reqHeaders['x-vercel-ip-country'];
    const code = String(rawCountry || '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code) && code !== 'XX') {
        const rawCity = reqHeaders['cf-ipcity'] || reqHeaders['x-vercel-ip-city'];
        const city = String(rawCity || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
        return {
            countryCode: code,
            country: COUNTRY_NAMES[code] || code,
            city: city || 'Unknown',
            flag: countryCodeToFlag(code)
        };
    }

    return {
        countryCode: 'Unknown',
        country: 'Unknown',
        city: 'Unknown',
        flag: '🌐'
    };
}

const BOT_USER_AGENT_PATTERNS = [
    { name: 'Googlebot', pattern: /googlebot/i },
    { name: 'Google inspection bot', pattern: /google-inspectiontool|adsbot-google|mediapartners-google/i },
    { name: 'Bingbot', pattern: /bingbot/i },
    { name: 'Bing preview', pattern: /bingpreview/i },
    { name: 'DuckDuckBot', pattern: /duckduckbot/i },
    { name: 'Baiduspider', pattern: /baiduspider/i },
    { name: 'YandexBot', pattern: /yandex(bot|images|video)/i },
    { name: 'SEO crawler', pattern: /semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider/i },
    { name: 'AI crawler', pattern: /gptbot|claudebot|anthropic-ai|ccbot/i },
    { name: 'Social crawler', pattern: /facebookexternalhit|twitterbot|linkedinbot|slackbot/i },
    { name: 'Lighthouse', pattern: /lighthouse|pagespeed/i },
    { name: 'HTTP client', pattern: /curl\/|wget\/|python-requests|python-urllib|go-http-client|node-fetch|axios|postmanruntime|insomnia/i },
    { name: 'Headless browser', pattern: /headlesschrome|phantomjs|puppeteer|playwright/i },
    { name: 'Crawler', pattern: /\b(bot|crawler|spider|slurp|scrapy|httpclient)\b/i }
];

function detectBot(userAgent = '') {
    const value = String(userAgent || '');
    const match = BOT_USER_AGENT_PATTERNS.find(entry => entry.pattern.test(value));
    return {
        isBot: Boolean(match),
        name: match ? match.name : null
    };
}

function isStandardBrowserUserAgent(userAgent = '') {
    const value = String(userAgent || '');
    return /^Mozilla\/5\.0\b/i.test(value) &&
        /(?:Chrome|CriOS|Edg|Firefox|FxiOS|Safari|OPR|Opera|SamsungBrowser|Version\/\d)/i.test(value) &&
        !detectBot(value).isBot;
}

function parseClientUa(uaString = '') {
    const ua = String(uaString || '');
    const bot = detectBot(ua);

    if (UAParser) {
        try {
            const parser = new UAParser(ua);
            const res = parser.getResult();
            let deviceType = 'Desktop';
            if (bot.isBot || !isStandardBrowserUserAgent(ua)) {
                deviceType = 'Embedded/Bot';
            } else if (res.device && (res.device.type === 'mobile' || res.device.type === 'tablet')) {
                deviceType = 'Mobile';
            }
            return {
                os: (res.os && res.os.name) ? `${res.os.name}${res.os.version ? ' ' + res.os.version.split('.')[0] : ''}` : 'Unknown',
                browser: (res.browser && res.browser.name) ? `${res.browser.name}${res.browser.major ? ' ' + res.browser.major : ''}` : (bot.name || 'Unknown Client'),
                deviceType,
                isBot: bot.isBot,
                botName: bot.name
            };
        } catch (error) {
            console.warn('[TRAFFIC] User-agent parser failed; using fallback:', error.message);
        }
    }

    const isBrowser = isStandardBrowserUserAgent(ua);
    const isMobile = /mobile|android|iphone|ipad|ipod|iemobile|opera mini/i.test(ua);

    let os = 'Unknown';
    if (/windows nt 10/i.test(ua)) os = 'Windows 10/11';
    else if (/windows nt/i.test(ua)) os = 'Windows';
    else if (/mac os x/i.test(ua) && !/iphone|ipad/i.test(ua)) os = 'macOS';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
    else if (/ubuntu/i.test(ua)) os = 'Ubuntu Linux';
    else if (/linux/i.test(ua)) os = 'Linux x86_64';
    else if (/cros/i.test(ua)) os = 'ChromeOS';

    let browser = 'Unknown Client';
    if (/edg\//i.test(ua)) browser = 'Edge';
    else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
    else if (/firefox\//i.test(ua)) browser = 'Firefox';
    else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = 'Chrome';
    else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = 'Safari';
    else if (/curl\//i.test(ua)) browser = 'cURL CLI';
    else if (/postman/i.test(ua)) browser = 'Postman';
    else if (bot.isBot) browser = bot.name;

    let deviceType = 'Desktop';
    if (bot.isBot || !isBrowser) deviceType = 'Embedded/Bot';
    else if (isMobile) deviceType = 'Mobile';

    return { os, browser, deviceType, isBot: bot.isBot, botName: bot.name };
}

function normalizeReferrer(rawReferer, automated = false) {
    if (!rawReferer || typeof rawReferer !== 'string' || !rawReferer.trim()) {
        return automated ? 'Automated Direct' : 'Direct';
    }
    try {
        const parsed = new URL(rawReferer);
        const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'Unknown Referrer';
        if (host === 'localhost' || host === '127.0.0.1' || host === 'embeddedindia.in' || host.endsWith('.embeddedindia.in')) {
            return 'Internal';
        }
        if (host === 'google.com' || host.startsWith('google.')) return 'Google Search';
        if (host === 'bing.com' || host.endsWith('.bing.com')) return 'Bing Search';
        if (host === 'duckduckgo.com' || host.endsWith('.duckduckgo.com')) return 'DuckDuckGo Search';
        return host;
    } catch (_) {
        return 'Unknown Referrer';
    }
}

const SCANNER_PATH_PATTERNS = [
    /^\/\.env(?:[./]|$)/i,
    /^\/\.git(?:\/|$)/i,
    /^\/wp(?:\/|$|-)/i,
    /^\/(?:xmlrpc\.php|phpmyadmin|pma|adminer)(?:\/|$)/i,
    /^\/(?:dockerrun(?:\.[^/]+)?|terraform)(?:[./]|$)/i,
    /^\/(?:\.aws|\.ssh|\.svn|\.hg|vendor\/phpunit|cgi-bin|actuator|server-status)(?:\/|$)/i,
    /\/(?:\.env|\.git|wp-login\.php|xmlrpc\.php|dockerrun|terraform)(?:\/|$)/i
];

function isScannerPath(reqPath) {
    const path = String(reqPath || '/').split('?')[0];
    return SCANNER_PATH_PATTERNS.some(pattern => pattern.test(path));
}

function isPageNavigation(req) {
    return req.method === 'GET' && /(?:^|,)\s*text\/html\b/i.test(String(req.headers.accept || ''));
}

function responseStatusText(statusCode) {
    const knownStatuses = {
        200: 'OK',
        201: 'Created',
        301: 'Moved Permanently',
        302: 'Found',
        303: 'See Other',
        307: 'Temporary Redirect',
        308: 'Permanent Redirect',
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        405: 'Method Not Allowed',
        408: 'Request Timeout',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable'
    };
    return knownStatuses[statusCode] || (statusCode >= 500 ? 'Server Error' : statusCode >= 400 ? 'Client Error' : 'Unknown');
}

function classifyTraffic(reqPath, statusCode, botInfo, standardBrowser, blocked) {
    if (blocked || isScannerPath(reqPath) || statusCode === 404) return 'scanner';
    if (botInfo.isBot || !standardBrowser) return 'bot';
    return 'human';
}

/**
 * Purge expired sessions older than 5 minutes
 */
function purgeExpiredSessions() {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [hash, session] of activeSessions.entries()) {
        if (session.lastSeen < cutoff) {
            activeSessions.delete(hash);
        }
    }
}

// Purge expired keys every 60 seconds
const purgeTimer = setInterval(purgeExpiredSessions, 60 * 1000);
if (purgeTimer && typeof purgeTimer.unref === 'function') {
    purgeTimer.unref();
}

/**
 * Record completed requests so the wire log includes the final HTTP status.
 */
function recordCompletedRequest(req, res, details) {
    res.once('finish', () => {
        try {
            const statusCode = Number(res.statusCode) || 0;
            const trafficType = classifyTraffic(
                details.route,
                statusCode,
                details.bot,
                details.standardBrowser,
                details.blocked
            );
            const automated = trafficType !== 'human';
            const referrer = automated && details.referrer === 'Direct'
                ? 'Automated Direct'
                : details.referrer;
            const hit = {
                id: `hit-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
                visitorHash: details.visitorHash,
                maskedHash: `${details.visitorHash.slice(0, 6)}...${details.visitorHash.slice(-4)}`,
                path: details.route,
                route: details.route,
                method: req.method || 'GET',
                referrer,
                geo: details.geo,
                client: details.client,
                timestamp: details.timestamp,
                statusCode,
                statusText: responseStatusText(statusCode),
                trafficType,
                botName: details.bot.name,
                pageView: details.pageView,
                blocked: details.blocked,
                classificationReason: details.blocked
                    ? 'Blocked hash'
                    : isScannerPath(details.route)
                        ? 'Scanner path'
                        : statusCode === 404
                            ? '404 response'
                            : details.bot.name || (!details.standardBrowser ? 'Non-browser client' : 'Browser')
            };

            if (
                trafficType === 'human' &&
                details.pageView &&
                statusCode >= 200 &&
                statusCode < 400
            ) {
                activeSessions.set(details.visitorHash, {
                    lastSeen: Date.now(),
                    route: details.route,
                    geo: details.geo,
                    client: details.client
                });
            }
            purgeExpiredSessions();

            if (trafficType === 'human' && details.pageView && statusCode >= 200 && statusCode < 300) {
                const pageView = {
                    path: details.route,
                    referrer: referrer === 'Direct' || referrer === 'Internal' ? null : referrer,
                    userAgent: details.userAgent.slice(0, 200) || null,
                    trafficType: 'human'
                };
                try {
                    const result = typeof prisma.recordPageView === 'function'
                        ? prisma.recordPageView(pageView)
                        : prisma.analytics && prisma.analytics.create({ data: pageView });
                    if (result && typeof result.catch === 'function') {
                        result.catch(error => console.error('[TRAFFIC] Failed to persist page view:', error));
                    }
                } catch (error) {
                    console.error('[TRAFFIC] Failed to persist page view:', error);
                }
            }

            wireLog.unshift(hit);
            if (wireLog.length > MAX_WIRE_LOG_SIZE) wireLog.length = MAX_WIRE_LOG_SIZE;

            trafficEvents.emit('hit', {
                activeCount: activeSessions.size,
                latestHit: hit,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('[TRAFFIC] Failed to record completed request:', error);
        }
    });
}

async function trafficTracker(req, res, next) {
    const reqPath = req.path || (req.originalUrl ? req.originalUrl.split('?')[0] : '/');
    const isAdminRoute = reqPath === '/admin' || reqPath.startsWith('/admin/');

    if (
        isAdminRoute ||
        ASSET_EXTENSION_REGEX.test(reqPath) ||
        EXCLUDED_PATHS.has(reqPath) ||
        reqPath.startsWith('/api/traffic/')
    ) {
        return next();
    }

    try {
        if (!blockedHashCacheReady) await initialBlockedHashRefresh;
        const clientIp = extractRealIp(req);
        if (!clientIp) return next();
        const visitorHash = computeVisitorHash(clientIp);
        if (!visitorHash) return next();

        const userAgent = String(req.headers['user-agent'] || '');
        const bot = detectBot(userAgent);
        const standardBrowser = isStandardBrowserUserAgent(userAgent);
        const blocked = blockedHashes.has(visitorHash);
        const details = {
            route: reqPath.length > 1 ? reqPath.replace(/\/+$/, '') : '/',
            visitorHash,
            referrer: normalizeReferrer(req.headers.referer || req.headers.referrer, bot.isBot || !standardBrowser),
            geo: geoLookup(clientIp, req.headers || {}),
            client: parseClientUa(userAgent),
            timestamp: new Date().toISOString(),
            userAgent,
            bot,
            standardBrowser,
            pageView: isPageNavigation(req),
            blocked
        };

        recordCompletedRequest(req, res, details);

        if (blocked) {
            return res.status(403).type('text').send('Request blocked by an administrator.');
        }
        return next();
    } catch (error) {
        console.error('[TRAFFIC] Middleware failed to inspect request:', error);
        return next();
    }
}

/**
 * Return current SSE payload for heartbeat or initial stream message
 */
function getLivePayload() {
    purgeExpiredSessions();
    const latest = wireLog[0] || null;
    return {
        activeCount: activeSessions.size,
        latestHit: latest
            ? {
                id: latest.id,
                timestamp: latest.timestamp,
                visitorHash: latest.visitorHash,
                maskedHash: latest.maskedHash,
                path: latest.path,
                route: latest.route,
                referrer: latest.referrer,
                geo: latest.geo,
                client: latest.client,
                statusCode: latest.statusCode,
                statusText: latest.statusText,
                trafficType: latest.trafficType,
                botName: latest.botName,
                pageView: latest.pageView,
                blocked: blockedHashes.has(latest.visitorHash)
            }
            : null,
        timestamp: new Date().toISOString()
    };
}

function normalizeTrafficFilter(value) {
    const filter = String(value || 'human').toLowerCase();
    return ['all', 'human', 'automated'].includes(filter) ? filter : 'human';
}

function getRangeWindowMs(range) {
    if (range === '1h') return 60 * 60 * 1000;
    if (range === '7d') return 7 * 24 * 60 * 60 * 1000;
    if (range === '30d') return 30 * 24 * 60 * 60 * 1000;
    if (range === 'all') return Number.MAX_SAFE_INTEGER;
    return 24 * 60 * 60 * 1000;
}

function getTrafficSummary(options = {}) {
    purgeExpiredSessions();
    const requestedRange = String(options.range || '24h').toLowerCase();
    const range = ['1h', '24h', '7d', '30d', 'all'].includes(requestedRange) ? requestedRange : '24h';
    const routeFilter = String(options.routeFilter || '').trim();
    const trafficFilter = normalizeTrafficFilter(options.trafficFilter);
    const cutoff = Date.now() - getRangeWindowMs(range);
    const baseHits = wireLog.filter(hit => {
        if (Date.parse(hit.timestamp) < cutoff) return false;
        if (routeFilter && !hit.route.toLowerCase().includes(routeFilter.toLowerCase())) return false;
        return true;
    });

    const humanHits = baseHits.filter(hit => hit.trafficType === 'human' && hit.pageView);
    const automatedHits = baseHits.filter(hit => hit.trafficType !== 'human');
    const trafficCounts = {
        all: humanHits.length + automatedHits.length,
        human: humanHits.length,
        automated: automatedHits.length
    };
    const metricHits = trafficFilter === 'human'
        ? humanHits
        : trafficFilter === 'automated'
            ? automatedHits
            : baseHits.filter(hit => hit.trafficType !== 'human' || hit.pageView);

    const uniqueHashes = new Set();
    const routeCounts = new Map();
    const referrerCounts = new Map();
    const geoCounts = new Map();
    const statusCounts = new Map();
    const deviceCounts = { Desktop: 0, Mobile: 0, 'Embedded/Bot': 0 };
    const browserCounts = new Map();
    const toolCounts = new Map([
        ['IPC-2221 Trace Width', 0],
        ['UART Baud Rate Calc', 0],
        ['IoT Battery Estimator', 0],
        ['Engineering Services', 0],
        ['Technical Blog', 0]
    ]);

    for (const hit of metricHits) {
        if (hit.visitorHash) uniqueHashes.add(hit.visitorHash);

        routeCounts.set(hit.route, (routeCounts.get(hit.route) || 0) + 1);
        if (hit.referrer !== 'Internal') {
            const referrer = hit.referrer || 'Unknown Referrer';
            referrerCounts.set(referrer, (referrerCounts.get(referrer) || 0) + 1);
        }

        const geo = hit.geo || {};
        const geoKey = `${geo.countryCode || 'Unknown'}|${geo.country || 'Unknown'}|${geo.city || 'Unknown'}|${geo.flag || '🌐'}`;
        geoCounts.set(geoKey, (geoCounts.get(geoKey) || 0) + 1);

        const device = hit.client && hit.client.deviceType in deviceCounts
            ? hit.client.deviceType
            : hit.trafficType === 'human' ? 'Desktop' : 'Embedded/Bot';
        deviceCounts[device] += 1;

        const browserName = String(hit.client && hit.client.browser || 'Unknown').split(' ')[0];
        browserCounts.set(browserName, (browserCounts.get(browserName) || 0) + 1);
        statusCounts.set(hit.statusCode, (statusCounts.get(hit.statusCode) || 0) + 1);

        if (hit.route.includes('trace-width')) {
            toolCounts.set('IPC-2221 Trace Width', toolCounts.get('IPC-2221 Trace Width') + 1);
        } else if (hit.route.includes('uart-baud')) {
            toolCounts.set('UART Baud Rate Calc', toolCounts.get('UART Baud Rate Calc') + 1);
        } else if (hit.route.includes('battery-life')) {
            toolCounts.set('IoT Battery Estimator', toolCounts.get('IoT Battery Estimator') + 1);
        } else if (hit.route.startsWith('/services')) {
            toolCounts.set('Engineering Services', toolCounts.get('Engineering Services') + 1);
        } else if (hit.route.startsWith('/blog')) {
            toolCounts.set('Technical Blog', toolCounts.get('Technical Blog') + 1);
        }
    }

    const denominator = metricHits.length;
    const percent = count => denominator ? Math.round((count / denominator) * 100) : 0;
    const topRoutes = [...routeCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([route, count]) => ({ route, count, percent: percent(count) }));

    const sortedReferrers = [...referrerCounts.entries()].sort((a, b) => b[1] - a[1]);
    const referrerTotal = sortedReferrers.reduce((total, [, count]) => total + count, 0);
    const topReferrer = sortedReferrers[0]
        ? {
            source: sortedReferrers[0][0],
            count: sortedReferrers[0][1],
            share: referrerTotal ? Math.round((sortedReferrers[0][1] / referrerTotal) * 100) : 0
        }
        : { source: 'None', count: 0, share: 0 };

    const sortedTools = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]);
    const peakTool = sortedTools[0] && sortedTools[0][1] > 0
        ? { name: sortedTools[0][0], hits: sortedTools[0][1] }
        : { name: 'No tool activity', hits: 0 };

    const geoDistribution = [...geoCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([key, count]) => {
            const [countryCode, country, city, flag] = key.split('|');
            return { countryCode, country, city, flag, count, percent: percent(count) };
        });

    const clientArch = {
        desktop: { count: deviceCounts.Desktop, percent: percent(deviceCounts.Desktop) },
        mobile: { count: deviceCounts.Mobile, percent: percent(deviceCounts.Mobile) },
        embeddedBot: { count: deviceCounts['Embedded/Bot'], percent: percent(deviceCounts['Embedded/Bot']) },
        topBrowsers: [...browserCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count, percent: percent(count) }))
    };

    return {
        range,
        routeFilter,
        trafficFilter,
        trafficCounts,
        activeCount: activeSessions.size,
        totalVisitsToday: metricHits.length,
        inMemoryVisits: metricHits.length,
        uniqueVisitors: uniqueHashes.size,
        topReferrer,
        peakTool,
        toolBreakdown: sortedTools.map(([name, hits]) => ({ name, hits })),
        topRoutes,
        geoDistribution,
        statusDistribution: [...statusCounts.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([statusCode, count]) => ({ statusCode, statusText: responseStatusText(statusCode), count })),
        clientArch,
        recentHits: metricHits.slice(0, 30).map(hit => ({
            ...hit,
            blocked: blockedHashes.has(hit.visitorHash)
        })),
        blockedCount: blockedHashes.size
    };
}

/**
 * Export wire log to RFC-4180 CSV string
 */
function exportTrafficCsv(options = {}) {
    const range = String(options.range || '24h').toLowerCase();
    const windowMs = getRangeWindowMs(['1h', '24h', '7d', '30d', 'all'].includes(range) ? range : '24h');
    const cutoff = Date.now() - windowMs;
    const routeFilter = String(options.routeFilter || '').trim().toLowerCase();
    const trafficFilter = normalizeTrafficFilter(options.trafficFilter);
    const filteredHits = wireLog.filter(hit => {
        if (Date.parse(hit.timestamp) < cutoff) return false;
        if (routeFilter && !hit.route.toLowerCase().includes(routeFilter)) return false;
        if (trafficFilter === 'human') return hit.trafficType === 'human' && hit.pageView;
        if (trafficFilter === 'automated') return hit.trafficType !== 'human';
        return hit.trafficType !== 'human' || hit.pageView;
    });
    const header = [
        'Timestamp_UTC',
        'Visitor_Hash',
        'Traffic_Type',
        'Method',
        'Route',
        'Country_Code',
        'Country',
        'City',
        'OS',
        'Browser',
        'Device_Type',
        'Referrer',
        'Status_Code',
        'Status_Text',
        'Blocked'
    ];
    const escapeCsv = val => `"${String(val == null ? '' : val).replace(/"/g, '""')}"`;
    const rows = filteredHits.map(hit => [
        hit.timestamp,
        hit.visitorHash,
        hit.trafficType,
        hit.method || 'GET',
        hit.route,
        hit.geo?.countryCode || 'Unknown',
        hit.geo?.country || 'Unknown',
        hit.geo?.city || 'Unknown',
        hit.client?.os || 'Unknown',
        hit.client?.browser || 'Unknown',
        hit.client?.deviceType || 'Unknown',
        hit.referrer || 'Unknown Referrer',
        hit.statusCode,
        hit.statusText,
        blockedHashes.has(hit.visitorHash) ? '1' : '0'
    ].map(escapeCsv).join(','));

    return [header.join(','), ...rows].join('\n');
}

/**
 * Clear the in-memory request log without inventing seed traffic.
 */
function clearTrafficLog() {
    wireLog.length = 0;
}

/**
 * Toggle a persisted block for a salted visitor hash.
 */
async function toggleBlockedVisitor(visitorHash) {
    if (!/^[a-f0-9]{16}$/i.test(String(visitorHash || '').trim())) return null;
    const clean = String(visitorHash).trim().toLowerCase();
    if (!(await refreshBlockedHashes())) {
        throw new Error('The shared telemetry block list is unavailable.');
    }

    if (blockedHashes.has(clean)) {
        const existing = await prisma.telemetryBlock.findFirst({ where: { visitorHash: clean } });
        if (existing) {
            await prisma.telemetryBlock.delete({ where: { id: existing.id } });
        }
        blockedHashes.delete(clean);
        return false;
    }

    await prisma.telemetryBlock.create({ data: { visitorHash: clean } });
    blockedHashes.add(clean);
    return true;
}

module.exports = {
    trafficTracker,
    trafficEvents,
    getLivePayload,
    getTrafficSummary,
    exportTrafficCsv,
    clearTrafficLog,
    toggleBlockedVisitor,
    extractRealIp,
    detectBot,
    geoLookup,
    normalizeReferrer,
    parseClientUa,
    isScannerPath,
    computeVisitorHash,
    activeSessions,
    wireLog
};
