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
 override.custom_faqs=JSON.stringify([{question:'Review a design?',answer:'Share the project requirements.'}]);clearSettingsCache();
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try {for(const width of [320,390,768,1024,1440,1920]) {
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});await context.addCookies([{name:'admin_token',value:token,url:base}]);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/admin/settings#site-customizer',{waitUntil:'domcontentloaded'});
  for(const dark of [false,true]) {
   await page.getByRole('button',{name:'Appearance',exact:true}).click();await page.locator('.appearance-panel').getByRole('switch',{name:'Night mode'}).setChecked(dark);await page.keyboard.press('Escape');
   let baseline;
   for(const id of sections) {
    await page.evaluate(id=>window.switchSettingsSection(id),id);
    const root=page.locator('#'+id);await root.waitFor({state:'visible'});
    assert.equal(await page.locator('.settings-section:visible').count(),1);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' '+id+' page overflow');
    const metrics=await root.evaluate(el=>{const h=el.querySelector('.settings-module-header'),heading=h.querySelector('h2'),field=el.querySelector('input:not([type=hidden]):not([type=range]),select,textarea');return {padding:getComputedStyle(el).padding,heading:getComputedStyle(heading).fontSize,weight:getComputedStyle(heading).fontWeight,headerPadding:getComputedStyle(h).paddingBottom,fieldHeight:field?.getBoundingClientRect().height};});
    if(!baseline)baseline=metrics;for(const key of ['padding','heading','weight','headerPadding'])assert.equal(metrics[key],baseline[key],width+' '+id+' '+key);
    const unlabelled=await root.locator('input:not([type=hidden]):not([type=radio]):not([type=checkbox]),select,textarea').evaluateAll(fields=>fields.filter(f=>!f.labels?.length&&!f.getAttribute('aria-label')&&!f.getAttribute('aria-labelledby')).map(f=>f.id||f.name));
    assert.deepEqual(unlabelled,[],id+' accessible field labels');
    if(width===390||width===1440)await root.screenshot({path:path.join(out,width+'-normalized-'+id+'-'+(dark?'dark':'light')+'.png'),style:'header {visibility:hidden!important;}'});
   }
  }
  if(width===390) {
   // A real request/response roundtrip uses mocked database writes and verifies both Save controls.
   await page.evaluate(()=>switchSettingsSection('site-customizer'));
   await page.locator('[name=site_tagline]').fill('Settings layout QA');
   const response=page.waitForResponse(r=>r.url()===base+'/admin/settings'&&r.request().method()==='POST');
   await page.locator('#site-customizer .settings-module-footer button').click();assert.equal((await response).status(),200);await page.locator('#settingsToast').waitFor({state:'visible'});assert.equal(override.site_tagline,'Settings layout QA');
   await page.evaluate(()=>switchSettingsSection('faq-manager'));await page.locator('#addFaqRow').click();assert.equal(await page.locator('.faq-editor-card').count(),2);
   await page.locator('.faq-editor-card').last().locator('input').fill('Can you help with firmware?');await page.locator('.faq-editor-card').last().locator('textarea').fill('Yes, share the requirements.');
   for(const id of sections.filter(id=>id!=='team-accounts')) {
    await page.evaluate(id=>switchSettingsSection(id),id);
    const saved=page.waitForResponse(r=>r.url()===base+'/admin/settings'&&r.request().method()==='POST');
    await page.locator('#'+id+' .settings-module-actions button[type=submit]').click();const result=await saved;assert.equal(result.status(),200,id+' save');
    await page.waitForFunction(id=>[...document.querySelectorAll('#'+id+' button[type=submit]')].every(b=>!b.disabled),id);
   }
   assert.equal(JSON.parse(override.custom_faqs).length,2);

   await page.evaluate(()=>switchSettingsSection('feature-flags'));
   for(const [button,w] of [['desktop',1440],['tablet',768],['mobile',390]]) {await page.locator('#vp-btn-'+button).click();await page.waitForFunction(w=>document.getElementById('liveHomepageIframe').contentWindow.innerWidth===w,w);}
  }
  await page.goto(base+'/admin/ai',{waitUntil:'domcontentloaded'});await page.locator('#ai-engine').waitFor({state:'visible'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' AI overflow');
  const unlabelled=await page.locator('#ai-engine').locator('input:not([type=hidden]):not([type=radio]):not([type=checkbox]),select,textarea').evaluateAll(fields=>fields.filter(f=>!f.labels?.length&&!f.getAttribute('aria-label')&&!f.getAttribute('aria-labelledby')).map(f=>f.id||f.name));assert.deepEqual(unlabelled,[],'AI labels');
  assert.deepEqual(errors,[]);console.log(width+': all Settings modules normalized; light/dark, labels and overflow passed');await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
