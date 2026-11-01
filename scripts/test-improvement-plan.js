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
let phoneVisibleOverride='1';
db.setting.findMany=async()=>{
 const rows=await readSettings();
 const map=Object.fromEntries(rows.map(r=>[r.key,r.value]));
 Object.assign(map,fixture,{
  enable_adsense:enabled?'true':'false',
  calendly_url:enabled?fixture.calendly_url:'',
  phone_visible:phoneVisibleOverride,
  contact_phone:'+91 83285 14090'
 });
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
   const response=await request(app).post('/admin/settings').set('Authorization','Bearer '+token).set('Cookie','csrf_token=qa-csrf').set('x-csrf-token','qa-csrf').set('Accept','application/json').send(fields);
   assert.equal(response.status,400,'invalid settings rejected');
 }
 assert.equal(saved.length,0,'invalid settings never persisted');
 const response=await request(app).post('/admin/settings').set('Authorization','Bearer '+token).set('Cookie','csrf_token=qa-csrf').set('x-csrf-token','qa-csrf').set('Accept','application/json').send(fixture);
 assert.equal(response.status,200,'valid settings accepted');assert.equal(saved.length,Object.keys(fixture).length);

 // Verify phone_visible toggle persistence via POST /admin/settings (both 'false' and 'true' values from theme-toggle)
 saved.length=0;
 const hideRes=await request(app).post('/admin/settings').set('Authorization','Bearer '+token).set('Cookie','csrf_token=qa-csrf').set('x-csrf-token','qa-csrf').set('Accept','application/json').send({hero_headline:'Embedded Systems',phone_visible:'false',email_visible:'true'});
 assert.equal(hideRes.status,200,'phone_visible false accepted');
 const phoneSavedFalse=saved.find(s=>s.where.key==='phone_visible');
 assert(phoneSavedFalse,'phone_visible upserted on hide');
 assert.equal(phoneSavedFalse.update.value,'0','phone_visible normalized to 0 when hidden');

 saved.length=0;
 const showRes=await request(app).post('/admin/settings').set('Authorization','Bearer '+token).set('Cookie','csrf_token=qa-csrf').set('x-csrf-token','qa-csrf').set('Accept','application/json').send({hero_headline:'Embedded Systems',phone_visible:'true',email_visible:'true'});
 assert.equal(showRes.status,200,'phone_visible true accepted');
 const phoneSavedTrue=saved.find(s=>s.where.key==='phone_visible');
 assert(phoneSavedTrue,'phone_visible upserted on show');
 assert.equal(phoneSavedTrue.update.value,'1','phone_visible normalized to 1 when visible');

 // Verify public website hides all mobile number sections and tel: links when phone_visible is '0', and restores them when '1'
 phoneVisibleOverride='0';clearSettingsCache();
 for(const url of ['/','/services','/projects','/about','/contact','/blogs/plan-qa-fixture']){
  const r=await request(app).get(url);assert.equal(r.status,200,url+' when phone hidden');
  const doc=new JSDOM(r.text).window.document;
  assert.equal(doc.querySelectorAll('a[href^="tel:"]').length,0,url+' has zero tel: links when phone_visible=0');
  if(url==='/contact'){
   assert.equal(doc.querySelectorAll('[data-phone-section="true"]').length,0,'/contact hides Direct Line / WhatsApp section when phone_visible=0');
   const phoneInput=doc.querySelector('#contact-phone');
   assert(phoneInput && !phoneInput.getAttribute('placeholder').includes('83285'),'/contact phone input placeholder does not leak phone number when hidden');
  }
  for(const script of doc.querySelectorAll('script[type="application/ld+json"]')){
   assert(!script.textContent.includes('"telephone"'),url+' JSON-LD omits telephone when phone_visible=0');
  }
 }
 phoneVisibleOverride='1';clearSettingsCache();
 for(const url of ['/','/services','/about','/contact','/blogs/plan-qa-fixture']){
  const r=await request(app).get(url);assert.equal(r.status,200,url+' when phone visible');
  const doc=new JSDOM(r.text).window.document;
  assert(doc.querySelectorAll('a[href^="tel:"]').length>=1,url+' renders tel: link when phone_visible=1');
  if(url==='/contact'){
   assert.equal(doc.querySelectorAll('[data-phone-section="true"]').length,1,'/contact shows Direct Line / WhatsApp section when phone_visible=1');
  }
 }

 const settings=Object.fromEntries((await db.setting.findMany()).map(r=>[r.key,r.value]));
 const html=await ejs.renderFile(path.join(__dirname,'../views/admin/settings.ejs'),{colorThemes:require('../src/data/colorThemes'),success:false,saved:false,schedulerSettings:await require('../src/services/aiScheduler').getSchedulerSettings(),totalPosts:await db.post.count(),settings,users:[],currentUser:{id:'qa',email:'qa@example.test'},currentPath:'/admin/settings',seo:{},theme:require('../src/services/themeEngine').resolveTheme(settings),appUrl:'http://localhost',csrfField:'',csrfToken:'',assetVersion:'1'});
 for(const key of Object.keys(fixture).filter(key=>key.startsWith('adsense_')||key==='calendly_url'))assert(html.includes('name="'+key+'"'),key+' admin field');
 assert(html.includes('id="btn_phone_visible"'),'Settings customizer includes phone_visible toggle switch button');
 console.log('PASS: public routes, every registered tool, ad enable/disable and scope, inline placement, schema JSON, booking, phone_visible hide/unhide toggle, and admin fields.');

 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const base='http://127.0.0.1:'+server.address().port;
  const out=path.join(__dirname,'../scratch/plan-qa');fs.mkdirSync(out,{recursive:true});
  const tool=registry.getAllCategories()[0];
  for(const width of [1440,768,390]){
   const context=await browser.newContext({viewport:{width,height:900}});
   await context.addCookies([{name:'admin_token',value:token,url:base}]);
   const page=await context.newPage();
   // Exercise the layout without issuing live advertising requests.
   await page.route(/googlesyndication|doubleclick/,route=>route.abort());
   const errors=[];page.on('pageerror',error=>errors.push(error.message));

   // 1. Public pages audit
   for(const url of [...pages,'/tools/'+tool.slug+'/'+tool.tools[0].slug]){
    await page.goto(base+url,{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(150);
    await page.evaluate(()=>document.documentElement.classList.remove('dark'));
    await page.waitForTimeout(300);
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
      const scope=url==='/'?'#testimonials':url==='/blogs'?'article':'#contact-form';
      const audit=await new AxeBuilder({page}).include(scope).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      assert.deepEqual(audit.violations.map(v=>({id:v.id,impact:v.impact})),[],url+' accessibility');
    }
    await page.evaluate(()=>window.scrollTo(0,0));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' overflow '+url);
    if(url==='/about')assert.equal(await page.locator('a').filter({hasText:'Request an Engineering Consultation'}).count(),1,'single CTA');
    if(['/','/contact','/blogs','/about'].includes(url))await page.screenshot({path:path.join(out,width+'-'+(url.slice(1)||'home')+'.png'),fullPage:true});
    await page.evaluate(()=>document.documentElement.classList.add('dark'));
    await page.waitForTimeout(300);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' dark overflow '+url);
   }

   // 2. Admin Dashboard QA Audit (/admin, /admin/traffic, /admin/settings)
   for(const adminUrl of ['/admin','/admin/traffic','/admin/settings']){
    await page.goto(base+adminUrl,{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(200);
    // Close SSE stream on traffic page so background events don't interfere with deterministic assertions
    if(adminUrl==='/admin/traffic'){
     await page.evaluate(()=>{if(window.trafficEvtSource)window.trafficEvtSource.close();});
    }

    // Light Mode Checks
    await page.evaluate(()=>{
     document.documentElement.classList.remove('dark');
     localStorage.setItem('theme','light');
     localStorage.setItem('admin_sidebar_collapsed','false');
     const sb=document.getElementById('adminLeftSidebar');
     if(sb)sb.setAttribute('data-collapsed','false');
    });
    await page.waitForTimeout(250);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' light overflow '+adminUrl);

    // Every visible button in admin must include an SVG icon
    const buttonAudit=await page.evaluate(()=>{
     const buttons=Array.from(document.querySelectorAll('button'));
     const missing=[];
     for(const btn of buttons){
      const style=window.getComputedStyle(btn);
      const rect=btn.getBoundingClientRect();
      if(style.display==='none'||style.visibility==='hidden'||rect.width===0||rect.height===0)continue;
      if(!btn.querySelector('svg')){
       missing.push((btn.id||btn.textContent.trim().slice(0,30)||'unnamed-button'));
      }
     }
     return missing;
    });
    assert.deepEqual(buttonAudit,[],width+' '+adminUrl+' all visible buttons have SVG icons');

    if(width===1440 && adminUrl==='/admin'){
     // Verify Expanded Sidebar (Image 3 fix): horizontal row layout, icon left of label, light surface in light mode
     const sidebarCheck=await page.evaluate(()=>{
      const sb=document.getElementById('adminLeftSidebar');
      const sbBg=window.getComputedStyle(sb).backgroundColor;
      const items=Array.from(sb.querySelectorAll('nav a.sidebar-nav-item'));
      const directions=items.map(a=>window.getComputedStyle(a).flexDirection);
      const iconLeftOfText=items.every(a=>{
       const svg=a.querySelector('svg').getBoundingClientRect();
       const lbl=a.querySelector('.sidebar-collapsible-text').getBoundingClientRect();
       return svg.right<=lbl.left+4;
      });
      return {sbBg,directions,iconLeftOfText};
     });
     assert.equal(sidebarCheck.sbBg,'rgb(255, 255, 255)','Expanded sidebar uses clean light background in light mode');
     assert(sidebarCheck.directions.every(d=>d==='row'),'Expanded sidebar nav items are horizontal rows');
     assert(sidebarCheck.iconLeftOfText,'Expanded sidebar icons are positioned to the left of labels');

     // Verify Overview Zone 2 balanced 2x2 grid (Image 3 fix)
     const gridBalance=await page.evaluate(()=>{
      const cards=Array.from(document.querySelectorAll('section[aria-label="Operations Workspace"] > div'));
      if(cards.length<4)return {ok:false,reason:'fewer than 4 cards'};
      const r=cards.map(c=>c.getBoundingClientRect());
      return {
       ok:Math.abs(r[0].height-r[1].height)<=2 && Math.abs(r[2].height-r[3].height)<=2 && Math.abs(r[0].width-r[1].width)<=4,
       r:r.map(x=>({w:Math.round(x.width),h:Math.round(x.height)}))
      };
     });
     assert(gridBalance.ok,'Overview operational cards form a balanced 2x2 grid with equal row heights: '+JSON.stringify(gridBalance.r));

     await page.screenshot({path:path.join(out,'1440-admin-overview-light.png'),fullPage:true});

     // Verify Collapsed Sidebar (Image 2 fix): click #sidebarCollapseBtn and check zero logo overlap
     await page.locator('#sidebarCollapseBtn').click();
     await page.waitForTimeout(250);
     const collapsedCheck=await page.evaluate(()=>{
      const sb=document.getElementById('adminLeftSidebar');
      const brand=sb.querySelector('.sidebar-brand-link');
      const brandDisplay=window.getComputedStyle(brand).display;
      const items=Array.from(sb.querySelectorAll('nav a.sidebar-nav-item'));
      const sizes=items.map(a=>{const r=a.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)};});
      return {collapsed:sb.getAttribute('data-collapsed'),brandDisplay,sizes};
     });
     assert.equal(collapsedCheck.collapsed,'true','Sidebar enters collapsed state');
     assert.equal(collapsedCheck.brandDisplay,'none','Brand badge hides when collapsed so collapse button never overlaps');
     assert(collapsedCheck.sizes.every(s=>s.w>=36 && s.w<=44 && s.h>=36 && s.h<=44),'Collapsed nav items are uniform square icon buttons');
     await page.screenshot({path:path.join(out,'1440-admin-sidebar-collapsed.png'),fullPage:false});

     // Expand sidebar back
     await page.locator('#sidebarCollapseBtn').click();
     await page.waitForTimeout(200);
    }

    if(width===1440 && adminUrl==='/admin/traffic'){
     // Verify Traffic page (Image 4 fix): theme-aware cards in light mode + no wrapped/truncated runs badge
     const trafficCheck=await page.evaluate(()=>{
      const headerCard=document.querySelector('#admin-main-content > div:first-child');
      const bg=window.getComputedStyle(headerCard).backgroundColor;
      const runsBadges=Array.from(document.querySelectorAll('span')).filter(s=>/\d+\s+runs/.test(s.textContent.trim()));
      const nowrapOk=runsBadges.every(b=>window.getComputedStyle(b).whiteSpace==='nowrap');
      return {bg,nowrapOk,badgeCount:runsBadges.length};
     });
     assert.equal(trafficCheck.bg,'rgb(255, 255, 255)','Traffic header card follows light theme instead of hardcoded dark');
     assert(trafficCheck.badgeCount>=1 && trafficCheck.nowrapOk,'Traffic runs badge uses nowrap without awkward wrapping');
     await page.screenshot({path:path.join(out,'1440-admin-traffic-light.png'),fullPage:true});
    }

    if(adminUrl==='/admin/settings'){
     // Verify Settings page (Image 1 & Image 5 fix): integrated workspace, horizontal tab bar without overlap, readable inputs, light-mode active provider card, and phone_visible toggle
     const settingsCheck=await page.evaluate(()=>{
      const ws=document.querySelector('.settings-workspace');
      const wsBg=window.getComputedStyle(ws).backgroundColor;
      const tabs=Array.from(document.querySelectorAll('#settings-sidebar-nav .settings-nav-btn'));
      const tabsHorizontal=tabs.every(t=>window.getComputedStyle(t).flexDirection==='row');
      const tabRects=tabs.map(t=>t.getBoundingClientRect());
      let tabsNoOverlap=true;
      for(let i=0;i<tabRects.length-1;i++){
       if(tabRects[i].right>tabRects[i+1].left+1){tabsNoOverlap=false;break;}
      }
      const checkedCard=document.querySelector('#providerCards label:has(input:checked)');
      const checkedCardBg=checkedCard?window.getComputedStyle(checkedCard).backgroundColor:'';
      const modelInput=document.getElementById('ai_model');
      const inputBg=window.getComputedStyle(modelInput).backgroundColor;
      const inputColor=window.getComputedStyle(modelInput).color;
      return {wsBg,tabsHorizontal,tabsNoOverlap,checkedCardBg,inputBg,inputColor};
     });
     assert.equal(settingsCheck.wsBg,'rgba(0, 0, 0, 0)','Settings workspace is seamlessly integrated without isolated dark box');
     assert(settingsCheck.tabsHorizontal,'Settings navigation tabs are horizontal with icon + label');
     assert(settingsCheck.tabsNoOverlap,width+' Settings navigation tabs do not overlap horizontally');
     assert.equal(settingsCheck.checkedCardBg,'rgb(236, 253, 245)','Active AI provider card uses clean light emerald surface in light mode');
     assert.notEqual(settingsCheck.inputBg,settingsCheck.inputColor,'AI Engine model input has high contrast in light mode');

     if(width===1440){
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:path.join(out,'1440-admin-settings-ai-light.png'),fullPage:true});
     }

     // Switch to Customizer tab and test the Hide / Unhide Mobile Number toggle switch
     await page.locator('.settings-nav-btn[data-settings-tab="site-customizer"]').click();
     await page.waitForTimeout(200);
     const toggleBtn=page.locator('#btn_phone_visible');
     assert(await toggleBtn.isVisible(),'Mobile number visibility toggle switch is visible in Customizer settings');
     const beforeVal=await page.locator('#phone_visible').inputValue();
     await toggleBtn.click();
     const afterVal=await page.locator('#phone_visible').inputValue();
     assert.notEqual(afterVal,beforeVal,'Clicking #btn_phone_visible toggles #phone_visible hidden input value');
     await toggleBtn.click(); // restore

     if(width===1440){
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:path.join(out,'1440-admin-settings-customizer-light.png'),fullPage:true});
     }
     await page.locator('.settings-nav-btn[data-settings-tab="ai-engine"]').click();
     await page.waitForTimeout(150);
    }

    if(width===390){
     await page.evaluate(()=>window.scrollTo(0,0));
     await page.screenshot({path:path.join(out,'390-'+adminUrl.slice(1).replace(/\//g,'-')+'-light.png'),fullPage:true});
    }

    // Dark Mode Checks for Admin
    await page.evaluate(()=>{
     document.documentElement.classList.add('dark');
     localStorage.setItem('theme','dark');
    });
    await page.waitForTimeout(250);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+' dark overflow '+adminUrl);
    if(width===1440 && adminUrl==='/admin/settings'){
     await page.locator('.settings-nav-btn[data-settings-tab="ai-engine"]').click();
     await page.waitForTimeout(150);
     await page.screenshot({path:path.join(out,'1440-admin-settings-ai-dark.png'),fullPage:true});
    }
   }

   assert.deepEqual(errors,[],width+' browser errors');await context.close();
  }
  console.log('PASS: desktop, tablet, mobile, light/dark overflow checks, admin dashboard layout & icon button audits, and no uncaught browser errors. Screenshots: scratch/plan-qa.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
