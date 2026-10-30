const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const script = fs.readFileSync(path.join(__dirname, '../server-deploy.sh'), 'utf8');
const extractor = script.split("<<'PYTHON'\n")[1].split('\nPYTHON')[0];
const base = fs.mkdtempSync(path.join(__dirname, '../scratch/deploy-zip-test-'));
const required = ['app.js', 'src/server.js', 'package.json', 'package-lock.json', 'server-deploy.sh', 'prisma/schema.prisma', 'scripts/init-db.js', 'scripts/seed-sqlite.js', 'src/deployment-check.js', 'src/public/css/input.css', 'tailwind.config.js'];
const python = process.platform === 'win32' ? 'python' : 'python3';
function zip(file, entries) {
 const r = spawnSync(python, ['-c', `import sys,json,zipfile,stat
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
 for name, body in json.load(sys.stdin).items():
  info=zipfile.ZipInfo(name)
  info.filename=name
  if name == 'public/link': info.external_attr=(stat.S_IFLNK | 0o777) << 16
  z.writestr(info,body)
`, file], {input:JSON.stringify(entries), encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
}
function extract(file, root) {return spawnSync(python,['-',file,root],{input:extractor,encoding:'utf8'});}
try {
 for (const folder of ['embeddedindia.in','new']) {
  const root=path.join(base,folder); fs.mkdirSync(path.join(root,'prisma'),{recursive:true});fs.mkdirSync(path.join(root,'public/uploads'),{recursive:true});
  fs.writeFileSync(path.join(root,'.env'),'KEEP_SECRET=yes\n');fs.writeFileSync(path.join(root,'prisma/dev.db'),'existing database');fs.writeFileSync(path.join(root,'public/uploads/photo.png'),'server upload');
  const entries=Object.fromEntries(required.map(name=>[name,name==='server-deploy.sh'?script:'new release content']));
  entries['public/uploads/photo.png']='archive upload'; entries['views/test.ejs']='new template';
  const file=path.join(base,'release with spaces.zip');zip(file,entries);
  let result=extract(file,root);assert.equal(result.status,0,result.stderr);
  assert.equal(fs.readFileSync(path.join(root,'views/test.ejs'),'utf8'),'new template');
  assert.equal(fs.readFileSync(path.join(root,'.env'),'utf8'),'KEEP_SECRET=yes\n');assert.equal(fs.readFileSync(path.join(root,'prisma/dev.db'),'utf8'),'existing database');assert.equal(fs.readFileSync(path.join(root,'public/uploads/photo.png'),'utf8'),'server upload');
  for(const extra of ['../escape.txt','public/../escape.txt','public\\escape.txt','/tmp/escape.txt','.env','prisma/dev.db','public/.env','public/link','node_modules/module.js']) {
   zip(file,{...entries,'views/test.ejs':'must not replace',[extra]:'unsafe'});result=extract(file,root);assert.notEqual(result.status,0,extra);assert.equal(fs.readFileSync(path.join(root,'views/test.ejs'),'utf8'),'new template');
  }
  const incomplete={...entries};delete incomplete['prisma/schema.prisma'];zip(file,incomplete);result=extract(file,root);assert.notEqual(result.status,0);assert.match(result.stderr,/Incomplete ZIP/);
  fs.writeFileSync(file,'not a zip');result=extract(file,root);assert.notEqual(result.status,0);
  console.log(folder+': ZIP extraction, spaces in path, preservation, incomplete/corrupt ZIP, traversal, symlink and protected-entry rejection passed');
 }
} finally {
 if(!path.resolve(base).startsWith(path.resolve(__dirname,'../scratch')+path.sep))throw Error('Unsafe cleanup');
 fs.rmSync(base,{recursive:true,force:true});
}
