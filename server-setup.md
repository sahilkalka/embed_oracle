ssh -i ./keys/ssh-key-2026-10-30.key ubuntu@129.225.79.183

Phase 1: Pre-Upload Checklist (Local Workstation)
Build Production Assets: Ensure Tailwind CSS is compiled with all new utility classes before generating the deployment bundle:
bash
npm run build
Verify Git Status: Confirm all modified files are tracked and committed:
src/server.js (301 /blog redirects & /terms route)
src/routes/seo.js (sitemap updates)
views/pages/terms.ejs (new Terms of Service)
views/pages/privacy.ejs (Google DART disclosures)
views/pages/tools/category.ejs (clean tool layout & disclaimer)
views/pages/blogs/post.ejs (E-E-A-T author cards)
views/pages/blogs/index.ejs (icon buttons)
views/layouts/footer.ejs (legal links)
views/layouts/header.ejs (AdSense path regex)
scripts/seed-sqlite.js (10 pillar articles & paused AI generator)
src/data/toolsRegistry.js (deep engineering FAQs)
Phase 2: Uploading to the Production Server
Option A: Automated Release via Project Deploy Script

If you deploy using the configured Oracle SSH key:

bash
ADMIN_DEFAULT_PASSWORD="YourAdminPasswordHere16Chars!" bash scripts/oracle-deploy.sh
Option B: Manual Git / SSH Pull on Server

If you deploy by pushing to Git and pulling on the server:

bash
# 1. SSH into the production server
ssh -i ./keys/ssh-key-2026-10-30.key ubuntu@129.225.79.183
# 2. Navigate to application root
cd /var/www/embeddedindia
# 3. Pull latest changes
git pull origin main
Phase 3: Critical Server Actions (After Upload)

IMPORTANT

Run the Database Seed Script Manually! The server's automated deployment script skips seed-sqlite.js if an admin account already exists. To update the database with the 10 newly seeded pillar articles and set ai_auto_gen_enabled = 'false', you must run the seed script manually on the server:

bash
cd /var/www/embeddedindia
# 1. Create a timestamped backup of the current database first
mkdir -p backups
sqlite3 prisma/dev.db ".backup 'backups/dev.db.$(date +%Y%m%d_%H%M%S)'"
# 2. Run the updated seed script (safely upserts new posts & settings without erasing data)
node scripts/seed-sqlite.js
# 3. Verify database permissions (ensure node process can read/write)
chmod 640 prisma/dev.db
chmod 750 prisma
# 4. Restart the systemd application service & reload Nginx
sudo systemctl daemon-reload
sudo systemctl restart embeddedindia.service
sudo systemctl reload nginx
Phase 4: Production Verification & Smoke Test

Run these remote/curl checks to confirm the server is properly serving the new pages and redirects:

Verify Health Endpoint:

bash
curl -I https://embeddedindia.in/health
# Expected: HTTP 200 OK

Verify 301 Permanent Redirect (/blog → /blogs):

bash
curl -I https://embeddedindia.in/blog
# Expected: HTTP/2 301, Location: /blogs

Verify Terms of Service & Privacy Policy:

bash
curl -I https://embeddedindia.in/terms
curl -I https://embeddedindia.in/privacy-policy
# Expected: HTTP 200 OK

Verify AdSense ads.txt is Live:

bash
curl -s https://embeddedindia.in/ads.txt
# Expected: google.com, pub-9044714811414113, DIRECT, f08c47fec0942fa0

Cloudflare / CDN Cache Purge (if active):

If Cloudflare is enabled in front of your domain, purge cache for:
https://embeddedindia.in/blogs*
https://embeddedindia.in/tools*
https://embeddedindia.in/privacy-policy
https://embeddedindia.in/terms
Phase 5: AdSense Review Submission Protocol
Google Search Console Indexing:
Go to Google Search Console
.
Submit your updated sitemap: https://embeddedindia.in/sitemap.xml.
Use the URL Inspection Tool to inspect https://embeddedindia.in/terms and request indexing.
Wait 48 to 72 Hours:
Allow Googlebot to crawl and cache the 10 comprehensive pillar articles and updated tool documentation.
Request AdSense Review:
In Google AdSense
, go to Sites → embeddedindia.in.
Check the box acknowledging that you have resolved policy issues, then click Request review.