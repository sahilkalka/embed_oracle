// scripts/localize-assets.js
const fs = require('fs');
const path = require('path');
const https = require('https');

const targetDirs = [
  path.join(__dirname, '../public/assets/images'),
  path.join(__dirname, '../public/assets/images/animations'),
  path.join(__dirname, '../public/assets/icons'),
  path.join(__dirname, '../public/downloads'),
  path.join(__dirname, '../public/css'),
  path.join(__dirname, '../public/js')
];

targetDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const assetsToDownload = [
  { url: 'https://embeddedindia.in/wp-content/uploads/2025/11/logomobile.png', dest: '../public/assets/images/logo.png' },
  { url: 'https://embeddedindia.in/wp-content/uploads/2025/11/download-2.svg', dest: '../public/assets/images/download-2.svg' },
  { url: 'https://embeddedindia.in/wp-content/uploads/2025/11/download-3.svg', dest: '../public/assets/images/download-3.svg' },
  { url: 'https://embeddedindia.in/wp-content/uploads/2025/11/download-4.svg', dest: '../public/assets/images/download-4.svg' },
  { url: 'https://embeddedindia.in/wp-content/uploads/2025/11/download-5.svg', dest: '../public/assets/images/download-5.svg' },
  { url: 'https://embeddedindia.in/wp-content/uploads/2025/11/download-6.svg', dest: '../public/assets/images/download-6.svg' },
  { url: 'https://embeddedindia.in/wp-content/uploads/2025/11/download-7.svg', dest: '../public/assets/images/download-7.svg' },
  { url: 'https://embeddedindia.in/wp-content/uploads/2025/11/download-8.svg', dest: '../public/assets/images/download-8.svg' },
  { url: 'https://embeddedindia.in/wp-content/uploads/2025/11/download-9-1.svg', dest: '../public/assets/images/download-9-1.svg' },
  { url: 'https://embeddedindia.in/wp-content/uploads/2025/11/mission1.svg', dest: '../public/assets/images/mission1.svg' },
  { url: 'https://embeddedindia.in/wp-content/uploads/2025/11/mission2.svg', dest: '../public/assets/images/mission2.svg' },
  { url: 'https://embeddedindia.in/wp-content/uploads/2025/11/mission3.svg', dest: '../public/assets/images/mission3.svg' },
  { url: 'https://embeddedindia.in/wp-content/uploads/2025/11/contact-us.svg', dest: '../public/assets/images/contact-us.svg' },
  { url: 'https://embeddedindia.in/wp-content/uploads/2025/11/wired-outline-213-arrow-2-rounded-hover-pinch.gif', dest: '../public/assets/images/animations/arrow.gif' },
  { url: 'https://embeddedindia.in/wp-content/uploads/2025/11/wired-outline-186-puzzle-hover-detach.gif', dest: '../public/assets/images/animations/puzzle.gif' },
  { url: 'https://embeddedindia.in/wp-content/uploads/2025/11/wired-outline-298-coins-hover-jump.gif', dest: '../public/assets/images/animations/coins.gif' }
];

function downloadFile(url, destRelative) {
  const dest = path.resolve(__dirname, destRelative);
  return new Promise((resolve) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`[SUCCESS] Downloaded: ${path.basename(dest)}`);
          resolve(true);
        });
      } else {
        console.warn(`[WARN] Status ${response.statusCode} for ${url}`);
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        resolve(false);
      }
    }).on('error', (err) => {
      console.error(`[ERROR] Failed ${url}:`, err.message);
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      resolve(false);
    });
  });
}

// Fallback high-quality SVG generator for brand icons
function createFallbackSvgs() {
  const logoSvgPath = path.resolve(__dirname, '../public/assets/images/logo.svg');
  if (!fs.existsSync(logoSvgPath)) {
    const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 60" fill="none">
      <rect width="48" height="48" x="6" y="6" rx="10" fill="#007f5f"/>
      <path d="M18 30h24M30 18v24M24 24l12 12M36 24l-12 12" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
      <circle cx="18" cy="30" r="3" fill="#55a630"/>
      <circle cx="42" cy="30" r="3" fill="#55a630"/>
      <circle cx="30" cy="18" r="3" fill="#55a630"/>
      <circle cx="30" cy="42" r="3" fill="#55a630"/>
      <text x="64" y="32" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="800" fill="#007f5f" letter-spacing="-0.5">Embedded</text>
      <text x="182" y="32" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="800" fill="#55a630" letter-spacing="-0.5">India</text>
      <text x="65" y="47" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="600" fill="#64748b" letter-spacing="1.5">THINK BIG. WE DO!</text>
    </svg>`;
    fs.writeFileSync(logoSvgPath, logoSvg);
    console.log('[FALLBACK] Created logo.svg');
  }

  // Create favicon.svg
  const faviconPath = path.resolve(__dirname, '../public/favicon.svg');
  if (!fs.existsSync(faviconPath)) {
    const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#007f5f"/>
      <circle cx="32" cy="32" r="16" stroke="#55a630" stroke-width="4" fill="none"/>
      <line x1="16" y1="32" x2="48" y2="32" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
      <line x1="32" y1="16" x2="32" y2="48" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
      <circle cx="32" cy="32" r="5" fill="#ffffff"/>
    </svg>`;
    fs.writeFileSync(faviconPath, faviconSvg);
    console.log('[FALLBACK] Created favicon.svg');
  }
}

async function run() {
  console.log('Starting asset localization from embeddedindia.in...');
  for (const asset of assetsToDownload) {
    await downloadFile(asset.url, asset.dest);
  }
  createFallbackSvgs();
  console.log('Asset localization completed successfully!');
}

run();
