const fs=require('fs');
const path=require('path');
const ejs=require('ejs');
const assert=require('node:assert/strict');
const request=require('supertest');
const {chromium}=require('playwright');
const AxeBuilder=require('@axe-core/playwright').default;
process.env.NODE_ENV='test';
process.env.ADMIN_JWT_SECRET='plan-qa-only-secret';
const db=require('../src/services/db');
const {clearSettingsCache}=require('../src/middleware/seo');
const {canShowAd}=require('../src/services/ads');
const registry=require('../src/data/toolsRegistry');
const app=require('../src/server');
const {JSDOM}=require('jsdom');
const fixture={enable_adsense:'true',adsense_pub_id:'ca-pub-1234567890123456',adsense_tools_top_slot:'1234567890',adsense_tools_bottom_slot:'1234567891',adsense_tools_sidebar_slot:'1234567892',adsense_blog_inline_slot:'1234567893',adsense_sidebar_slot:'1234567894',calendly_url:'https://calendly.com/example/review',ad_slot_in_article:'true'};
db.analytics.create=async()=>({});
db.calculatorStat.create=async()=>({});
db.calculatorStat.update=async()=>({});
db.post.update=async()=>({});
const readSettings=db.setting.findMany.bind(db.setting);
const readPost=db.post.findUnique.bind(db.post);
let enabled=false;
db.setting.findMany=async()=>{
 const rows=await readSettings();
 const map=Object.fromEntries(rows.map(r=>[r.key,r.value]));
 Object.assign(map,fixture,{enable_adsense:enabled?'true':'false',calendly_url:enabled?fixture.calendly_url:''});
 return Object.entries(map).map(([key,value])=>({key,value}));
};
db.post.findUnique=async args=>args.where.slug==='plan-qa-fixture'?{id:'plan-qa-fixture',slug:'plan-qa-fixture',title:'Plan QA article',author:'Engineering Team',category:'Guides',status:'published',summary:'A QA fixture',contentMarkdown:'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\nFourth paragraph.',readingTime:2,publishedAt:new Date(),updatedAt:new Date()}:readPost(args);
const pages=['/','/services','/projects','/tools','/blogs','/blogs/plan-qa-fixture','/about','/contact'];
(async()=>{
 assert(!canShowAd({...fixture,adsense_pub_id:'invalid'},fixture.adsense_tools_top_slot));
 assert(!canShowAd(fixture,'AUTO'));
 for(const active of [false,true]){
  enabled=active;clearSettingsCache();
  for(const url of pages){
   const r=await request(app).get(url);assert.equal(r.status,200,url);
   const doc=new JSDOM(r.text).window.document;
   const monetized=/^\/(tools|blogs)(\/|$)/.test(url);
   assert.equal(!!doc.querySelector('script[src*="adsbygoogle.js"]'),active&&monetized,url+' loader scope');
   assert.equal(!!doc.querySelector('a[href="'+fixture.calendly_url+'"]'),active&&url==='/contact',url+' booking');
   if(!active)assert.equal(doc.querySelectorAll('ins.adsbygoogle').length,0,url+' ads disabled');
   for(const slot of doc.querySelectorAll('ins.adsbygoogle'))assert(Object.values(fixture).includes(slot.dataset.adSlot),url+' real configured slot');
   for(const script of doc.querySelectorAll('script[type="application/ld+json"]'))JSON.parse(script.textContent);
   if(url==='/services')assert(doc.querySelector('script[type="application/ld+json"]').textContent);
   if(url==='/blogs/plan-qa-fixture'&&active){
    const ad=doc.querySelector('.prose .ad-slot-container');assert(ad,'inline ad');assert.equal(ad.querySelector('ins').dataset.adSlot,fixture.adsense_blog_inline_slot);assert.equal(ad.previousElementSibling.textContent,'Third paragraph.');assert.equal(ad.nextElementSibling.textContent,'Fourth paragraph.');
   }
  }
  for(const category of registry.getAllCategories())for(const tool of category.tools){
   const url='/tools/'+category.slug+'/'+tool.slug;
   const r=await request(app).get(url);assert.equal(r.status,200,url);
   assert.equal(r.text.includes('tool-ad-layout-enabled'),active,url+' sidebar layout');
  }
 }
 const userLookup=db.user.findUnique.bind(db.user);
 db.user.findUnique=async args=>args.where.id==='plan-qa-admin'?{id:'plan-qa-admin',email:'qa@example.test',role:'admin'}:userLookup(args);
 const token=require('jsonwebtoken').sign({userId:'plan-qa-admin',role:'admin'},process.env.ADMIN_JWT_SECRET);
 const saved=[];db.setting.upsert=async args=>{saved.push(args);return args.create;};
 for(const fields of [{adsense_tools_top_slot:'AUTO'},{adsense_pub_id:'not-a-publisher'},{calendly_url:'javascript:alert(1)'},{calendly_url:'https://user:pass@example.com'}]){
   const response=await request(app).post('/admin/settings').set('Authorization','Bearer '+token).set('Accept','application/json').send(fields);
   assert.equal(response.status,400,'invalid settings rejected');
 }
 assert.equal(saved.length,0,'invalid settings never persisted');
 const response=await request(app).post('/admin/settings').set('Authorization','Bearer '+token).set('Accept','application/json').send(fixture);
 assert.equal(response.status,200,'valid settings accepted');assert.equal(saved.length,Object.keys(fixture).length);
 const settings=Object.fromEntries((await db.setting.findMany()).map(r=>[r.key,r.value]));
 const html=await ejs.renderFile(path.join(__dirname,'../views/admin/settings.ejs'),{colorThemes:require('../src/data/colorThemes'),success:false,saved:false,schedulerSettings:await require('../src/services/aiScheduler').getSchedulerSettings(),totalPosts:await db.post.count(),settings,users:[],currentUser:{id:'qa',email:'qa@example.test'},currentPath:'/admin/settings',seo:{},theme:require('../src/services/themeEngine').resolveTheme(settings),appUrl:'http://localhost'});
 for(const key of Object.keys(fixture).filter(key=>key.startsWith('adsense_')||key==='calendly_url'))assert(html.includes('name="'+key+'"'),key+' admin field');
 console.log('PASS: public routes, every registered tool, ad enable/disable and scope, inline placement, schema JSON, booking and admin fields.');
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const base='http://127.0.0.1:'+server.address().port;
  const out=path.join(__dirname,'../scratch/plan-qa');fs.mkdirSync(out,{recursive:true});
  const tool=registry.getAllCategories()[0];
  for(const width of [1440,768,390]){
   const context=await browser.newContext({viewport:{width,height:900}});
   const page=await context.newPage();
   // Exercise the layout without issuing live advertising requests.
   await page.route(/googlesyndication|doubleclick/,route=>route.abort());
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   for(const url of [...pages,'/tools/'+tool.slug+'/'+tool.tools[0].slug]){
    await page.goto(base+url,{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(150);
    await page.evaluate(()=>document.documentElement.classList.remove('dark'));
    await page.waitForTimeout(400);
    if(url==='/tools'){
      await page.locator('#tools-search-input').fill('zzzzzzzz');
      assert.equal(await page.locator('.category-card:visible').count(),0,'tools empty search');
      await page.locator('#tools-search-input').fill('');
      assert.equal(await page.locator('.category-card:visible').count(),8,'tools search reset');
    }
    if(url==='/'){
      const faq=page.locator('#faq details').first();await faq.locator('summary').click();assert(await faq.evaluate(node=>node.open),'FAQ opens');await faq.locator('summary').click();
      assert.equal(await page.locator('footer a[href="/admin"]').count(),0,'public footer hides admin');
    }
    if(url.includes('/'+tool.slug+'/')){
      const result=page.locator('#trace-resWidthMils');const before=await result.textContent();
      await page.locator('#trace-current').fill('5');await page.locator('#trace-current').dispatchEvent('input');
      assert.notEqual(await result.textContent(),before,'PCB calculator updates');
    }
    if(width===1440 && ['/','/blogs','/contact'].includes(url)){
      const scope=url==='/'?'#testimonials':url==='/blogs'?'article':'.lg\\:col-span-5';
      const audit=await new AxeBuilder({page}).include(scope).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      assert.deepEqual(audit.violations.map(v=>({id:v.id,impact:v.impact})),[],url+' accessibility');
    }
    await page.evaluate(()=>window.scrollTo(0,0));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' overflow '+url);
    if(url==='/about')assert.equal(await page.locator('a').filter({hasText:'Request an Engineering Consultation'}).count(),1,'single CTA');
    if(['/','/contact','/blogs','/about'].includes(url))await page.screenshot({path:path.join(out,width+'-'+(url.slice(1)||'home')+'.png'),fullPage:true});
    await page.evaluate(()=>document.documentElement.classList.add('dark'));
    await page.waitForTimeout(400);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' dark overflow '+url);
   }
   assert.deepEqual(errors,[],width+' browser errors');await context.close();
  }
  console.log('PASS: desktop, tablet, mobile, light/dark overflow checks and no uncaught browser errors. Screenshots: scratch/plan-qa.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});

