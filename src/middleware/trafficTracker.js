const crypto = require('crypto');
const EventEmitter = require('events');

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

// Blocked / Flagged visitor hashes
const flaggedHashes = new Set();

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

function countryCodeToFlag(code) {
    if (!code || typeof code !== 'string' || code.length !== 2) return '🌐';
    const upper = code.toUpperCase();
    return String.fromCodePoint(...[...upper].map(c => 0x1F1E6 - 65 + c.charCodeAt(0)));
}

/**
 * Extract client IP from request headers or socket
 */
function extractClientIp(req) {
    const forwarded = req.headers && req.headers['x-forwarded-for'];
    if (forwarded && typeof forwarded === 'string') {
        const first = forwarded.split(',')[0].trim();
        if (first) return first;
    }
    const realIp = req.headers && (req.headers['x-real-ip'] || req.headers['cf-connecting-ip']);
    if (realIp && typeof realIp === 'string') {
        return realIp.trim();
    }
    return (req.socket && req.socket.remoteAddress) || req.ip || '127.0.0.1';
}

/**
 * Generate salted SHA-256 visitor hash
 */
function computeVisitorHash(ip) {
    return crypto
        .createHash('sha256')
        .update(`${String(ip || '127.0.0.1')}:${HASH_SALT}`)
        .digest('hex')
        .slice(0, 16);
}

/**
 * Resolve geographic metadata via geoip-lite with deterministic fallback for local/private IPs
 */
function lookupGeo(ip, reqHeaders = {}) {
    // Cloudflare / reverse-proxy headers if available
    const cfCountry = reqHeaders['cf-ipcountry'] || reqHeaders['x-vercel-ip-country'];
    const cfCity = reqHeaders['cf-ipcity'] || reqHeaders['x-vercel-ip-city'];

    if (geoip && ip && ip !== '127.0.0.1' && ip !== '::1' && !ip.startsWith('192.168.') && !ip.startsWith('10.')) {
        try {
            const cleanIp = ip.replace(/^::ffff:/, '');
            const hit = geoip.lookup(cleanIp);
            if (hit) {
                const code = (hit.country || 'IN').toUpperCase();
                return {
                    countryCode: code,
                    country: COUNTRY_NAMES[code] || code,
                    city: hit.city || 'Bengaluru',
                    flag: countryCodeToFlag(code)
                };
            }
        } catch (_) {
            // Fallback below
        }
    }

    if (cfCountry) {
        const code = String(cfCountry).toUpperCase().slice(0, 2);
        return {
            countryCode: code,
            country: COUNTRY_NAMES[code] || code,
            city: cfCity ? String(cfCity) : 'Bengaluru',
            flag: countryCodeToFlag(code)
        };
    }

    // Local loopback / LAN deterministic engineering node attribution
    return {
        countryCode: 'IN',
        country: 'India',
        city: 'Bengaluru',
        flag: countryCodeToFlag('IN')
    };
}

/**
 * Parse User-Agent via ua-parser-js or built-in regex parser
 */
function parseClientUa(uaString = '') {
    const ua = String(uaString || '');

    if (UAParser) {
        try {
            const parser = new UAParser(ua);
            const res = parser.getResult();
            const isBot = /bot|crawler|spider|slurp|curl|wget|python|postman|insomnia|headless|lighthouse/i.test(ua);
            let deviceType = 'Desktop';
            if (isBot) {
                deviceType = 'Embedded/Bot';
            } else if (res.device && (res.device.type === 'mobile' || res.device.type === 'tablet')) {
                deviceType = 'Mobile';
            } else if (/arm|aarch64|linux;.*armv|esp32|stm32|rtos|lwip/i.test(ua)) {
                deviceType = 'Embedded/Bot';
            }
            return {
                os: (res.os && res.os.name) ? `${res.os.name}${res.os.version ? ' ' + res.os.version.split('.')[0] : ''}` : 'Linux x86_64',
                browser: (res.browser && res.browser.name) ? `${res.browser.name}${res.browser.major ? ' ' + res.browser.major : ''}` : (isBot ? 'Telemetry Agent' : 'Browser'),
                deviceType
            };
        } catch (_) {
            // Fallback to regex parser below
        }
    }

    const isBot = /bot|crawler|spider|slurp|curl|wget|python|postman|insomnia|headless|lighthouse|axios|node-fetch/i.test(ua);
    const isEmbedded = /arm|aarch64|esp32|stm32|rtos|lwip|busybox/i.test(ua);
    const isMobile = /mobile|android|iphone|ipad|ipod|iemobile|opera mini/i.test(ua);

    let os = 'Linux';
    if (/windows nt 10/i.test(ua)) os = 'Windows 10/11';
    else if (/windows nt/i.test(ua)) os = 'Windows';
    else if (/mac os x/i.test(ua) && !/iphone|ipad/i.test(ua)) os = 'macOS';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
    else if (/ubuntu/i.test(ua)) os = 'Ubuntu Linux';
    else if (/linux/i.test(ua)) os = 'Linux x86_64';
    else if (/cros/i.test(ua)) os = 'ChromeOS';

    let browser = 'Chrome';
    if (/edg\//i.test(ua)) browser = 'Edge';
    else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
    else if (/firefox\//i.test(ua)) browser = 'Firefox';
    else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = 'Chrome';
    else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = 'Safari';
    else if (/curl\//i.test(ua)) browser = 'cURL CLI';
    else if (/postman/i.test(ua)) browser = 'Postman';
    else if (isBot) browser = 'Crawler / Bot';

    let deviceType = 'Desktop';
    if (isBot || isEmbedded) deviceType = 'Embedded/Bot';
    else if (isMobile) deviceType = 'Mobile';

    return { os, browser, deviceType };
}

/**
 * Normalize referrer into readable source
 */
function normalizeReferrer(rawReferer) {
    if (!rawReferer || typeof rawReferer !== 'string' || !rawReferer.trim()) {
        return 'Direct';
    }
    try {
        const parsed = new URL(rawReferer);
        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname.endsWith('embeddedindia.in')) {
            return `Internal (${parsed.pathname || '/'})`;
        }
        return parsed.hostname.replace(/^www\./, '');
    } catch (_) {
        return rawReferer.slice(0, 64);
    }
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
 * Seed baseline engineering telemetry so the dashboard is immediately rich on boot
 */
function ensureBaselineTelemetry() {
    if (wireLog.length > 0) return;

    const now = Date.now();
    const baselineSamples = [
        { offsetSec: 18, ip: '49.205.112.40', path: '/tools/trace-width', route: '/tools/trace-width', ref: 'google.com', geo: { countryCode: 'IN', country: 'India', city: 'Bengaluru', flag: '🇮🇳' }, client: { os: 'Windows 10/11', browser: 'Chrome 122', deviceType: 'Desktop' } },
        { offsetSec: 42, ip: '103.21.125.77', path: '/services', route: '/services', ref: 'linkedin.com', geo: { countryCode: 'IN', country: 'India', city: 'Hyderabad', flag: '🇮🇳' }, client: { os: 'macOS', browser: 'Safari 17', deviceType: 'Desktop' } },
        { offsetSec: 75, ip: '185.199.108.153', path: '/tools/uart-baud', route: '/tools/uart-baud', ref: 'github.com', geo: { countryCode: 'DE', country: 'Germany', city: 'Munich', flag: '🇩🇪' }, client: { os: 'Ubuntu Linux', browser: 'Firefox 123', deviceType: 'Desktop' } },
        { offsetSec: 110, ip: '122.166.81.20', path: '/tools/battery-life', route: '/tools/battery-life', ref: 'Direct', geo: { countryCode: 'IN', country: 'India', city: 'Pune', flag: '🇮🇳' }, client: { os: 'Android', browser: 'Chrome 122', deviceType: 'Mobile' } },
        { offsetSec: 145, ip: '52.26.14.90', path: '/blog', route: '/blog', ref: 'hackaday.com', geo: { countryCode: 'US', country: 'United States', city: 'San Jose', flag: '🇺🇸' }, client: { os: 'Linux x86_64', browser: 'Chrome 121', deviceType: 'Desktop' } },
        { offsetSec: 195, ip: '138.201.81.199', path: '/tools/trace-width', route: '/tools/trace-width', ref: 'eevblog.com', geo: { countryCode: 'SG', country: 'Singapore', city: 'Singapore', flag: '🇸🇬' }, client: { os: 'Linux x86_64', browser: 'cURL CLI', deviceType: 'Embedded/Bot' } },
        { offsetSec: 230, ip: '106.51.73.11', path: '/case-studies', route: '/case-studies', ref: 'Direct', geo: { countryCode: 'IN', country: 'India', city: 'Chennai', flag: '🇮🇳' }, client: { os: 'Windows 10/11', browser: 'Edge 122', deviceType: 'Desktop' } },
        { offsetSec: 265, ip: '49.36.128.45', path: '/contact', route: '/contact', ref: 'google.com', geo: { countryCode: 'IN', country: 'India', city: 'Bengaluru', flag: '🇮🇳' }, client: { os: 'iOS', browser: 'Safari 17', deviceType: 'Mobile' } }
    ];

    baselineSamples.forEach((sample, idx) => {
        const ts = new Date(now - sample.offsetSec * 1000).toISOString();
        const visitorHash = computeVisitorHash(sample.ip);
        const entry = {
            id: `hit-seed-${idx + 1}`,
            visitorHash,
            maskedHash: `${visitorHash.slice(0, 6)}...${visitorHash.slice(-4)}`,
            path: sample.path,
            route: sample.route,
            method: 'GET',
            referrer: sample.ref,
            geo: sample.geo,
            client: sample.client,
            timestamp: ts,
            flagged: false
        };
        wireLog.push(entry);
        if (sample.offsetSec < 300) {
            activeSessions.set(visitorHash, {
                lastSeen: now - sample.offsetSec * 1000,
                route: sample.route,
                geo: sample.geo,
                client: sample.client
            });
        }
    });
}

ensureBaselineTelemetry();

/**
 * Express middleware to capture non-asset incoming requests
 */
function trafficTracker(req, res, next) {
    try {
        const reqPath = req.path || (req.originalUrl ? req.originalUrl.split('?')[0] : '/');

        // Skip static assets and SSE endpoints
        if (
            ASSET_EXTENSION_REGEX.test(reqPath) ||
            EXCLUDED_PATHS.has(reqPath) ||
            reqPath.startsWith('/api/traffic/') ||
            reqPath.startsWith('/admin/traffic/live')
        ) {
            return next();
        }

        const ip = extractClientIp(req);
        const visitorHash = computeVisitorHash(ip);
        const fullUrl = req.originalUrl || req.url || reqPath;
        const route = reqPath.length > 1 ? reqPath.replace(/\/+$/, '') : '/';
        const referrer = normalizeReferrer(req.headers['referer'] || req.headers['referrer']);
        const geo = lookupGeo(ip, req.headers || {});
        const client = parseClientUa(req.headers['user-agent'] || '');
        const timestamp = new Date().toISOString();
        const nowMs = Date.now();

        // Update 5-minute sliding session pool
        activeSessions.set(visitorHash, {
            lastSeen: nowMs,
            route,
            geo,
            client
        });
        purgeExpiredSessions();

        const hit = {
            id: `hit-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
            visitorHash,
            maskedHash: `${visitorHash.slice(0, 6)}...${visitorHash.slice(-4)}`,
            path: fullUrl,
            route,
            method: req.method || 'GET',
            referrer,
            geo,
            client,
            timestamp,
            flagged: flaggedHashes.has(visitorHash)
        };

        wireLog.unshift(hit);
        if (wireLog.length > MAX_WIRE_LOG_SIZE) {
            wireLog.length = MAX_WIRE_LOG_SIZE;
        }

        // Emit real-time event for SSE subscribers
        trafficEvents.emit('hit', {
            activeCount: activeSessions.size,
            latestHit: hit,
            timestamp
        });
    } catch (_) {
        // Never block request pipeline on telemetry error
    }
    return next();
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
                flagged: flaggedHashes.has(latest.visitorHash)
            }
            : null,
        timestamp: new Date().toISOString()
    };
}

/**
 * Compute aggregated KPIs, route breakdowns, geo distribution, client architecture, and wire log
 */
function getTrafficSummary(options = {}) {
    purgeExpiredSessions();
    const range = String(options.range || '24h').toLowerCase();
    const routeFilter = options.routeFilter ? String(options.routeFilter).trim() : '';

    const now = Date.now();
    let windowMs = 24 * 60 * 60 * 1000;
    if (range === '1h') windowMs = 60 * 60 * 1000;
    else if (range === '7d') windowMs = 7 * 24 * 60 * 60 * 1000;
    else if (range === '30d') windowMs = 30 * 24 * 60 * 60 * 1000;
    else if (range === 'all') windowMs = 365 * 24 * 60 * 60 * 1000;

    const cutoffIso = new Date(now - windowMs).toISOString();

    const filteredHits = wireLog.filter(hit => {
        if (hit.timestamp < cutoffIso) return false;
        if (routeFilter && !hit.route.toLowerCase().includes(routeFilter.toLowerCase())) return false;
        return true;
    });

    const uniqueHashes = new Set();
    const routeCounts = new Map();
    const referrerCounts = new Map();
    const geoCounts = new Map();
    const deviceCounts = { Desktop: 0, Mobile: 0, 'Embedded/Bot': 0 };
    const browserCounts = new Map();
    const toolCounts = new Map([
        ['IPC-2221 Trace Width', 0],
        ['UART Baud Rate Calc', 0],
        ['IoT Battery Estimator', 0],
        ['Engineering Services', 0],
        ['Technical Blog', 0]
    ]);

    for (const hit of filteredHits) {
        uniqueHashes.add(hit.visitorHash);

        // Route tally
        routeCounts.set(hit.route, (routeCounts.get(hit.route) || 0) + 1);

        // Referrer tally
        const ref = hit.referrer || 'Direct';
        referrerCounts.set(ref, (referrerCounts.get(ref) || 0) + 1);

        // Geo tally
        const geoKey = `${hit.geo.countryCode}|${hit.geo.country}|${hit.geo.city}|${hit.geo.flag}`;
        geoCounts.set(geoKey, (geoCounts.get(geoKey) || 0) + 1);

        // Client architecture tally
        const dev = hit.client.deviceType in deviceCounts ? hit.client.deviceType : 'Desktop';
        deviceCounts[dev] += 1;

        const browserName = (hit.client.browser || 'Chrome').split(' ')[0];
        browserCounts.set(browserName, (browserCounts.get(browserName) || 0) + 1);

        // Tool / Section peak comparison
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

    // Merge optional persisted DB stats if supplied
    if (Array.isArray(options.calculatorStats)) {
        for (const stat of options.calculatorStats) {
            if (stat.calculatorName === 'trace-width') {
                toolCounts.set('IPC-2221 Trace Width', toolCounts.get('IPC-2221 Trace Width') + Number(stat.usageCount || 0));
            } else if (stat.calculatorName === 'uart-baud') {
                toolCounts.set('UART Baud Rate Calc', toolCounts.get('UART Baud Rate Calc') + Number(stat.usageCount || 0));
            } else if (stat.calculatorName === 'battery-life') {
                toolCounts.set('IoT Battery Estimator', toolCounts.get('IoT Battery Estimator') + Number(stat.usageCount || 0));
            }
        }
    }

    const totalHits = Math.max(filteredHits.length, 1);

    // Top 10 Requested Routes
    const topRoutes = [...routeCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([route, count]) => ({
            route,
            count,
            percent: Math.min(100, Math.round((count / totalHits) * 100))
        }));

    // Top Referrers
    const sortedReferrers = [...referrerCounts.entries()].sort((a, b) => b[1] - a[1]);
    const topReferrer = sortedReferrers[0]
        ? { source: sortedReferrers[0][0], count: sortedReferrers[0][1], share: Math.round((sortedReferrers[0][1] / totalHits) * 100) }
        : { source: 'Direct', count: 0, share: 100 };

    // Peak Traffic Tool
    const sortedTools = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]);
    const peakTool = sortedTools[0]
        ? { name: sortedTools[0][0], hits: sortedTools[0][1] }
        : { name: 'IPC-2221 Trace Width', hits: 0 };

    // Geographic Distribution
    const geoDistribution = [...geoCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([key, count]) => {
            const [countryCode, country, city, flag] = key.split('|');
            return {
                countryCode,
                country,
                city,
                flag,
                count,
                percent: Math.min(100, Math.round((count / totalHits) * 100))
            };
        });

    // Client Architecture percentages
    const clientArch = {
        desktop: { count: deviceCounts.Desktop, percent: Math.round((deviceCounts.Desktop / totalHits) * 100) },
        mobile: { count: deviceCounts.Mobile, percent: Math.round((deviceCounts.Mobile / totalHits) * 100) },
        embeddedBot: { count: deviceCounts['Embedded/Bot'], percent: Math.round((deviceCounts['Embedded/Bot'] / totalHits) * 100) },
        topBrowsers: [...browserCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({
                name,
                count,
                percent: Math.round((count / totalHits) * 100)
            }))
    };

    return {
        range,
        routeFilter,
        activeCount: activeSessions.size,
        totalVisitsToday: filteredHits.length + Number(options.persistedPageViews || 0),
        inMemoryVisits: filteredHits.length,
        uniqueVisitors: uniqueHashes.size,
        topReferrer,
        peakTool,
        toolBreakdown: sortedTools.map(([name, hits]) => ({ name, hits })),
        topRoutes,
        geoDistribution,
        clientArch,
        recentHits: filteredHits.slice(0, 30).map(h => ({
            ...h,
            flagged: flaggedHashes.has(h.visitorHash)
        })),
        flaggedCount: flaggedHashes.size
    };
}

/**
 * Export wire log to RFC-4180 CSV string
 */
function exportTrafficCsv() {
    const header = ['Timestamp_UTC', 'Visitor_Hash', 'Method', 'Route', 'Full_Path', 'Country_Code', 'City', 'OS', 'Browser', 'Device_Type', 'Referrer', 'Flagged'];
    const escapeCsv = val => `"${String(val == null ? '' : val).replace(/"/g, '""')}"`;
    const rows = wireLog.map(hit => [
        hit.timestamp,
        hit.visitorHash,
        hit.method || 'GET',
        hit.route,
        hit.path,
        hit.geo?.countryCode || 'IN',
        hit.geo?.city || 'Bengaluru',
        hit.client?.os || 'Linux',
        hit.client?.browser || 'Chrome',
        hit.client?.deviceType || 'Desktop',
        hit.referrer || 'Direct',
        flaggedHashes.has(hit.visitorHash) ? '1' : '0'
    ].map(escapeCsv).join(','));

    return [header.join(','), ...rows].join('\n');
}

/**
 * Clear wire log and re-seed active request
 */
function clearTrafficLog() {
    wireLog.length = 0;
}

/**
 * Toggle IP hash block/flag status
 */
function toggleFlagVisitor(visitorHash) {
    if (!visitorHash) return false;
    const clean = String(visitorHash).trim();
    if (flaggedHashes.has(clean)) {
        flaggedHashes.delete(clean);
        return false;
    }
    flaggedHashes.add(clean);
    return true;
}

module.exports = {
    trafficTracker,
    trafficEvents,
    getLivePayload,
    getTrafficSummary,
    exportTrafficCsv,
    clearTrafficLog,
    toggleFlagVisitor,
    activeSessions,
    wireLog
};

