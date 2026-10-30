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
 const ejs=require('ejs');const {checkDeployment}=require('../src/deployment-check');
 const settings=Object.fromEntries((await db.setting.findMany()).map(r=>[r.key,r.value]));
 // Reproduce a pre-restart worker: the old Settings route supplied none of the AI-specific locals.
 const html=await ejs.renderFile(path.join(__dirname,'../views/admin/settings.ejs'),{settings,success:false,users:[],currentUser:{id:'qa-admin',role:'admin'},currentPath:'/admin/settings',seo:{},theme:require('../src/services/themeEngine').resolveTheme(settings),appUrl:'http://localhost',colorThemes:presets});
 assert(html.includes('id="ai-engine"'));assert(html.includes('id="faq-manager"'));
 assert(await checkDeployment({app,db}));
 const broken=require('express')();broken.get('/admin/settings',(req,res)=>res.status(500).send('fixture failure'));
 await assert.rejects(checkDeployment({app:broken,db}),/HTTP 500/);
 const packageJson=require('../package.json');const command=packageJson.scripts.postinstall;const code=command.slice(command.indexOf('"')+1,command.lastIndexOf('"'));
 const {spawnSync}=require('child_process');const fixture=fs.mkdtempSync(path.join(__dirname,'../scratch/postinstall-'));
 try {const result=spawnSync(process.execPath,['-e',code],{cwd:fixture,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/Prisma generation deferred/);}finally{fs.rmSync(fixture,{recursive:true,force:true});}
 console.log('PASS: older-worker Settings render, authenticated deployment smoke check, HTTP 500 rejection, and CloudLinux postinstall deferral.');
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
