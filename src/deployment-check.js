// Read-only HTTP smoke check for a freshly extracted release. No browser, SMTP,
// AI requests, cron jobs, or production listening port are started.
const path = require('path');

async function checkDeployment(options = {}) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
  process.env.NODE_ENV = 'test';
  const app = options.app || require('./server');
  const db = options.db || require('./services/db');
  const jwt = require('jsonwebtoken');
  const { JWT_SECRET } = require('./middleware/auth');
  const admin = await db.user.findFirst({ where: { role: 'admin' }, select: { id: true, email: true, role: true } });
  if (!admin) throw new Error('No administrator exists after database initialization.');
  const token = jwt.sign({ userId: admin.id, email: admin.email, role: admin.role }, JWT_SECRET, { expiresIn: '1m' });
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/admin/settings`, {
      headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', signal: AbortSignal.timeout(20000)
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error(`GET /admin/settings returned HTTP ${response.status}; inspect the Settings/template error printed above.`);
    }
    const html = await response.text();
    for (const id of ['ai-engine', 'faq-manager', 'site-customizer', 'seo-scripts', 'monetization-ads', 'newsletter-config', 'smtp-settings', 'team-accounts']) {
      if (!html.includes(`id="${id}"`)) throw new Error(`Settings response is missing module ${id}.`);
    }
    return true;
  } finally {
    server.closeIdleConnections?.();
    await new Promise(resolve => server.close(resolve));
    if (!options.db) await db.$disconnect();
  }
}

module.exports = { checkDeployment };
if (require.main === module) {
  checkDeployment().then(() => {
    console.log('Verified: authenticated /admin/settings renders all modules (HTTP 200).');
    process.exit(0);
  }).catch(error => {
    console.error('[DEPLOYMENT CHECK FAILED]', error.message);
    process.exit(1);
  });
}
