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
const sections = ['ai-engine', 'site-customizer', 'seo-scripts', 'monetization-ads', 'newsletter-config', 'smtp-settings', 'team-accounts', 'faq-manager'];
const pages = ['/admin', '/admin/inquiries', '/admin/subscribers', '/admin/posts', '/admin/projects', '/admin/ai'];


(async()=>{
 override.custom_faqs=JSON.stringify([{question:'Can you review an existing design?',answer:'Share your requirements for an engineering review.'}]);clearSettingsCache();
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{for(const width of [390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce'});await context.addCookies([{name:'admin_token',value:token,url:base}]);await context.addInitScript(()=>localStorage.setItem('color-theme','light'));const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const samples={};
  for(const [name,url,section,card] of [['reference','/admin/settings#site-customizer','#site-customizer','#site-customizer form > .p-5'],['faq','/admin/settings#faq-manager','#faq-manager','.faq-editor-card'],['ai','/admin/ai','#ai-engine','#aiConfigForm > div']]){
   await page.goto(base+url,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Appearance',exact:true}).click();await page.locator('.appearance-panel').getByRole('switch',{name:'Night mode'}).uncheck();await page.keyboard.press('Escape');await page.waitForTimeout(400);await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(250);
   samples[name]=await page.evaluate(({section,card})=>{
    const root=document.querySelector(section),heading=root.querySelector('h2'),workspace=root.closest('.settings-workspace'),aside=document.getElementById('settingsLeftSidebar'),box=document.querySelector(card),button=root.querySelector('button[type=submit]');
    const cs=getComputedStyle(root),hs=getComputedStyle(heading),bs=getComputedStyle(box),ss=getComputedStyle(aside),but=getComputedStyle(button);
    return {padding:cs.padding,fontSize:hs.fontSize,fontWeight:hs.fontWeight,headingOffset:Math.round(heading.getBoundingClientRect().y-workspace.getBoundingClientRect().y),sidebarWidth:aside.offsetWidth,sidebarPadding:ss.padding,cardBackground:bs.backgroundColor,cardPadding:bs.padding,cardRadius:bs.borderRadius,saveBackground:but.backgroundColor,saveRadius:but.borderRadius,saveHeight:button.offsetHeight};
   },{section,card});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' '+name+' overflow');
   await page.screenshot({path:path.join(out,width+'-consistent-'+name+'.png'),fullPage:true});
   await page.getByRole('button',{name:'Appearance',exact:true}).click();await page.locator('.appearance-panel').getByRole('switch',{name:'Night mode'}).check();await page.keyboard.press('Escape');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' '+name+' dark overflow');
  }
  console.log(width,JSON.stringify(samples));
  for(const name of ['ai','faq'])for(const key of Object.keys(samples.reference))assert.deepEqual(samples[name][key],samples.reference[key],width+' '+name+' '+key);
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
 console.log('PASS: AI Engine and FAQs match Customizer spacing, headings, cards, sidebar and Save controls.');
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
