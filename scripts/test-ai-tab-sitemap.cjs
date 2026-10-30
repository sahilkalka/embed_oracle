const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
const AxeBuilder = require('@axe-core/playwright').default;
const request = require('supertest');
process.env.NODE_ENV = 'test';
process.env.ADMIN_JWT_SECRET = 'admin-responsive-qa-only';
const db = require('../src/services/db');
const { clearSettingsCache } = require('../src/middleware/seo');
const originalSettings = db.setting.findMany.bind(db.setting);
const override = { maintenance_mode: 'false', enable_copilot: 'true', enable_back_to_top: 'true', enable_rfq_popup: 'false', custom_faqs: '[]' };
db.setting.findMany = async () => Object.entries({ ...Object.fromEntries((await originalSettings()).map(r => [r.key, r.value])), ...override }).map(([key, value]) => ({ key, value }));
db.setting.upsert = async ({ create, update, where }) => { override[where.key] = update.value; return { ...create, ...update }; };
const originalUser = db.user.findUnique.bind(db.user);
db.user.findUnique = async args => args.where.id === 'qa-admin' ? { id: 'qa-admin', email: 'qa@example.test', username: 'QA', role: 'admin' } : originalUser(args);
db.analytics.create = async () => ({});
db.calculatorStat.create = async () => ({});
db.calculatorStat.update = async () => ({});
const app = require('../src/server');
const token = jwt.sign({ userId: 'qa-admin', role: 'admin' }, process.env.ADMIN_JWT_SECRET);
const out = path.join(__dirname, '../scratch/admin-responsive'); fs.mkdirSync(out, { recursive: true });
const presets = require('../src/data/colorThemes');
const sections = ['site-customizer', 'feature-flags', 'seo-scripts', 'monetization-ads', 'newsletter-config', 'smtp-settings', 'team-accounts', 'faq-manager'];
const pages = ['/admin', '/admin/inquiries', '/admin/subscribers', '/admin/posts', '/admin/projects', '/admin/ai'];



(async()=>{
 const {JSDOM}=require('jsdom');const registry=require('../src/data/toolsRegistry');const services=require('../src/data/servicesData');
 const oldUrl=process.env.APP_URL;const oldPosts=db.post.findMany;const oldProjects=db.project.findMany;
 let extraPost=false;
 db.post.findMany=async args=>{assert.deepEqual(args.where,{status:'published'});return [{slug:'public-guide',updatedAt:new Date('2026-10-20T00:00:00Z')},...(extraPost?[{slug:'new-guide & special',updatedAt:'invalid-date'}]:[])];};
 db.project.findMany=async()=>[{slug:'public-project',updatedAt:'2026-10-21T00:00:00Z'}];
 function parse(response){assert.equal(response.status,200);const xml=new JSDOM(response.text,{contentType:'application/xml'}).window.document;assert.equal(xml.querySelector('parsererror'),null);const urls=[...xml.querySelectorAll('loc')].map(e=>e.textContent);assert.equal(new Set(urls).size,urls.length);assert(!urls.some(u=>u.includes('/admin')||u.includes('#')));return {xml,urls};}
 try {
  process.env.APP_URL='https://embeddedindia.in/';let result=parse(await request(app).get('/sitemap.xml'));
  for(const tool of registry.TOOLS)assert(result.urls.includes('https://embeddedindia.in/tools/'+tool.groupSlug+'/'+tool.slug));
  for(const category of registry.TOOL_CATEGORIES)assert(result.urls.includes('https://embeddedindia.in/tools/'+category.slug));
  for(const service of Object.values(services))assert(result.urls.includes('https://embeddedindia.in/services/'+service.slug));
  assert(result.urls.includes('https://embeddedindia.in/projects/public-project'));assert(result.urls.includes('https://embeddedindia.in/blogs/public-guide'));
  const home=[...result.xml.querySelectorAll('url')].find(e=>e.querySelector('loc').textContent==='https://embeddedindia.in/');assert.equal(home.querySelector('lastmod'),null,'Static pages do not claim an invented modification date');
  extraPost=true;result=parse(await request(app).get('/sitemap.xml'));assert(result.urls.includes('https://embeddedindia.in/blogs/'+encodeURIComponent('new-guide & special')),'Content updates appear without a stale cache');
  process.env.APP_URL='https://new.embeddedindia.in';result=parse(await request(app).get('/sitemap.xml'));assert(result.urls.every(u=>u.startsWith('https://new.embeddedindia.in/')),'Staging URLs stay separate');
 } finally {db.post.findMany=oldPosts;db.project.findMany=oldProjects;if(oldUrl===undefined)delete process.env.APP_URL;else process.env.APP_URL=oldUrl;}
 const auth={Authorization:'Bearer '+token};
 let response=await request(app).get('/admin/ai').set(auth);assert.equal(response.status,302);assert.equal(response.headers.location,'/admin/settings#ai-engine');
 response=await request(app).get('/admin/ai?saved=1').set(auth);assert.equal(response.headers.location,'/admin/settings?saved=1#ai-engine');
 response=await request(app).post('/admin/ai').set(auth).type('form').send({ai_provider:'openai',ai_model:'gpt-4o-mini'});assert.equal(response.status,302);assert.equal(response.headers.location,'/admin/settings?saved=1#ai-engine');
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;const browser=await chromium.launch({headless:true});
 try {for(const width of [390,1440]) {
  const context=await browser.newContext({viewport:{width,height:1000}});await context.addCookies([{name:'admin_token',value:token,url:base}]);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/admin/settings#faq-manager',{waitUntil:'domcontentloaded'});await page.evaluate(()=>window.__tabDocumentMarker='same-document');
  await page.locator('[data-settings-tab=ai-engine]').click();assert.equal(new URL(page.url()).hash,'#ai-engine');await page.locator('#ai-engine').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.__tabDocumentMarker),'same-document');
  assert.equal(await page.locator('.settings-section:visible').count(),1);assert.equal(await page.locator('[data-settings-tab=ai-engine]').getAttribute('aria-current'),'page');
  await page.locator('#providerCards input[value=custom]').check({force:true});assert.equal(await page.locator('#ai_model').inputValue(),'llama3:8b');
  await page.locator('[data-settings-tab=faq-manager]').click();await page.locator('#faq-manager').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.__tabDocumentMarker),'same-document');
  await page.goto(base+'/admin/ai',{waitUntil:'domcontentloaded'});assert.equal(new URL(page.url()).pathname,'/admin/settings');assert.equal(new URL(page.url()).hash,'#ai-engine');await page.locator('#ai-engine').waitFor({state:'visible'});assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log('PASS: AI tab navigation without reload, legacy redirects, save redirect, provider controls, and canonical sitemap with registries, published posts, projects, dates, XML escaping and freshness.');
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
