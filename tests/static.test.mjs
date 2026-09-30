import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
test('缓存列出的资源均存在，版本化模块统一',async()=>{
  const sw=await readFile(new URL('sw.js',root),'utf8');
  const paths=[...sw.matchAll(/'\.\/([^']*)'/g)].map(m=>m[1].split('?')[0]||'index.html');
  for(const path of paths) await access(new URL(path,root));
  for(const path of ['index.html','js/app.mjs','js/store.mjs']){
    const text=await readFile(new URL(path,root),'utf8');
    const versions=[...text.matchAll(/\?v=([\d.]+)/g)].map(m=>m[1]);assert.ok(versions.every(v=>v==='1.0.2'));
  }
  assert.match(sw,/startsWith\('wrong-question-review-shell-'\)/);
});
test('Manifest含正确启动范围和有效PNG',async()=>{
  const manifest=JSON.parse(await readFile(new URL('manifest.webmanifest',root),'utf8'));
  assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons){const bytes=await readFile(new URL(icon.src,root));assert.equal(bytes.subarray(1,4).toString(),'PNG');const size=Number(icon.sizes.split('x')[0]);assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}
});
