import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url);
const examples=JSON.parse(await readFile(new URL('data/example-bank.json',root),'utf8'));
let published={kind:'question-bank',version:1,revision:0,title:'自动更新测试',questions:[]};
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/data/question-bank.json'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(published));return;}
    const content=await readFile(new URL('.'+(path==='/'?'/index.html':path),root));
    const extension=path.split('.').at(-1);res.writeHead(200,{'Content-Type':({mjs:'text/javascript',js:'text/javascript',css:'text/css',png:'image/png',svg:'image/svg+xml',json:'application/json',webmanifest:'application/manifest+json'})[extension]||'text/html','Cache-Control':'no-store'});res.end(content);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));page.on('dialog',dialog=>dialog.accept());
  const data=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('wrong-question-review-v1')));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.getByRole('button',{name:'先用 3 道示例体验'}).click();await page.locator('#confirm-import').click();
  await page.locator('[data-start="due"]').click();await page.locator('[data-option="B"]').click();await page.locator('#reveal').click();await page.locator('#note').fill('不可覆盖的个人笔记');await page.locator('[data-rating="good"]').click();await page.locator('#exit').click();
  const before=await data();
  published={...published,revision:1,questions:[{...examples.questions[1],id:'public-one',question:'【发布测试】新题一',isDemo:false}]};
  await page.reload();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wrong-question-review-v1'))?.publishedBank?.revision===1);
  let d=await data();assert.equal(d.questions.length,4);assert.deepEqual(d.progress,before.progress);assert.deepEqual(d.notes,before.notes);assert.equal(d.reviews.length,1);
  const unchangedRevision=d.revision;await page.reload();await page.locator('[data-page="bank"]').click();await page.locator('#update-bank').click();await page.getByText('题库已经是最新批次。',{exact:true}).waitFor();assert.equal((await data()).revision,unchangedRevision);
  await page.locator('[data-page="today"]').click();await page.locator('[data-start="new"]').click();
  published={...published,revision:2,questions:[...published.questions,{...examples.questions[1],id:'public-two',question:'【发布测试】新题二',isDemo:false}]};
  const response=page.waitForResponse(r=>r.url().endsWith('/data/question-bank.json')&&r.status()===200);
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));await response;
  await page.waitForTimeout(150);
  assert.equal((await data()).publishedBank.revision,1,'正在答题时不应用更新');
  await page.locator('#exit').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wrong-question-review-v1'))?.publishedBank?.revision===2);assert.equal((await data()).questions.length,5);
  published={...published,revision:1,questions:published.questions.slice(0,1)};
  await page.reload();await page.locator('[data-page="bank"]').click();await page.locator('#update-bank').click();await page.getByText('题库已经是最新批次。',{exact:true}).waitFor();assert.equal((await data()).publishedBank.revision,2);assert.equal((await data()).questions.length,5);
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:'今天，捡回几个知识点。'}).waitFor();d=await data();assert.equal(d.questions.length,5);assert.equal(d.publishedBank.revision,2);assert.deepEqual(d.progress,before.progress);assert.deepEqual(d.notes,before.notes);
  assert.deepEqual(errors,[]);
  console.log('通过：自动首批合并、刷新幂等、联网触发、练习中延后更新、旧缓存不回退、离线保留、原进度与笔记不变。');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
