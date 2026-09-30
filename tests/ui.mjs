import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url),out=new URL('../test-results/',import.meta.url);
await mkdir(out,{recursive:true});
const url=process.env.QA_URL||'http://127.0.0.1:4180/';
const browser=await chromium.launch({channel:'chrome',headless:true});
const report=[];
try{
  for(const viewport of [{width:390,height:844},{width:320,height:568}]){
    const context=await browser.newContext({viewport,acceptDownloads:true});
    const page=await context.newPage(),errors=[];page.on('pageerror',err=>errors.push(err.message));
    const shot=async name=>page.screenshot({path:fileURLToPath(new URL(`${viewport.width}-${name}.png`,out)),fullPage:true});
    const data=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('wrong-question-review-v1')));
    const fit=async label=>{const sizes=await page.evaluate(()=>({w:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(sizes.scroll<=sizes.w,`${label} 横向溢出 ${JSON.stringify(sizes)}`);};
    try{
      await page.goto(url);await page.getByText('你的错题本，等第一道题').waitFor();await fit('空首页');await shot('home-empty');
      await page.getByRole('button',{name:'先用 3 道示例体验'}).click();await page.locator('#confirm-import').click();
      assert.equal((await data()).questions.length,3);
      await page.locator('[data-start="due"]').click();
      await page.locator('[data-option="A"]').click();await page.locator('#reveal').click();
      assert.equal(await page.locator('[data-rating="good"]').isDisabled(),true);
      await page.locator('#note').fill('测试笔记：注意逆否命题');
      await fit('答错解析');
      const ratingBounds=await page.locator('[data-rating="again"]').boundingBox();assert.ok(ratingBounds.y>=0 && ratingBounds.y+ratingBounds.height<=viewport.height+1,'掌握程度按钮必须在屏内');
      await shot('review-feedback');await page.locator('[data-rating="again"]').click();
      await page.locator('[data-option="C"]').click();await page.locator('#reveal').click();await page.locator('[data-rating="good"]').click();
      await page.locator('#recall').fill('主动回忆后核对');await page.locator('#reveal').click();await page.locator('[data-rating="easy"]').click();
      await page.getByRole('heading',{name:'又记牢了一点。'}).waitFor();await fit('结果');
      let d=await data();assert.equal(d.reviews.length,3);assert.equal(d.reviews[0].correct,false);assert.equal(d.reviews[1].correct,true);assert.equal(d.progress['demo-logic-001'].stage,-1);assert.equal(d.notes['demo-logic-001'],'测试笔记：注意逆否命题');
      await page.locator('#done').click();await page.locator('[data-page="bank"]').click();
      await page.locator('#search').fill('充分');assert.equal(await page.locator('[data-detail]').count(),1);await page.locator('[data-detail]').click();assert.ok((await page.locator('#detail-note').inputValue()).includes('逆否'));await page.locator('#close-dialog').click();await page.locator('#search').fill('');
      const example=JSON.parse(await readFile(new URL('data/example-bank.json',root),'utf8'));
      await page.locator('#import-file').setInputFiles({name:'questions.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(example))});await page.locator('#confirm-import').click();d=await data();assert.equal(d.questions.length,3);assert.equal(d.reviews.length,3);assert.equal(d.notes['demo-logic-001'],'测试笔记：注意逆否命题');
      const extra={kind:'question-bank',version:1,title:'边界测试',questions:[{id:'test-multi-001',subject:'公基',type:'多选题',question:'【测试】选择 A 与 C',options:{A:'正确一',B:'错误',C:'正确二'},answer:['A','C'],explanation:'仅用于验证多选交互。',verification:'verified'},{id:'test-pending-001',subject:'公基',type:'判断题',question:'【测试】待核对，不应进入复习',options:{A:'正确',B:'错误'},answer:['A'],explanation:'答案待核对。',verification:'pending'}]};
      await page.locator('#import-file').setInputFiles({name:'extra.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(extra))});await page.locator('#confirm-import').click();
      await page.locator('[data-page="today"]').click();await page.locator('[data-start="new"]').click();await page.locator('[data-option="A"]').click();await page.locator('[data-option="C"]').click();await page.locator('#reveal').click();assert.equal(await page.locator('[data-rating="good"]').isDisabled(),false);await page.locator('[data-rating="good"]').click();await page.locator('#done').click();assert.equal((await data()).reviews.length,4);
      await page.locator('[data-page="stats"]').click();await page.getByRole('heading',{name:'复习记录',exact:true}).waitFor();await fit('统计');await shot('stats');
      await page.locator('[data-page="settings"]').click();await page.locator('[name="dailyNew"]').fill('5');await page.getByRole('button',{name:'保存设置'}).click();assert.equal((await data()).settings.dailyNew,5);
      const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();const download=await downloadPromise;const backupPath=fileURLToPath(new URL(`backup-${viewport.width}.json`,out));await download.saveAs(backupPath);const backup=JSON.parse(await readFile(backupPath,'utf8'));assert.equal(backup.data.reviews.length,4);
      await page.locator('#restore-file').setInputFiles(backupPath);await page.locator('#confirm-restore').click();assert.equal((await data()).reviews.length,4);
      await page.reload();await page.getByRole('heading',{name:'今天，捡回几个知识点。'}).waitFor();
      await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
      await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
      const keys=await page.evaluate(()=>caches.keys());assert.ok(keys.includes('wrong-question-review-shell-v1.0.0'));
      await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:'今天，捡回几个知识点。'}).waitFor();assert.equal((await data()).reviews.length,4);await page.locator('[data-start="wrong"]').click();await page.locator('[data-option="B"]').click();await page.locator('#reveal').click();await page.locator('[data-rating="good"]').click();assert.equal((await data()).reviews.length,5);await fit('离线结果');
      await page.locator('#done').click();await page.locator('[data-page="settings"]').click();await page.locator('#remove-demo').click();await page.locator('#confirm-remove-demo').click();d=await data();assert.equal(d.questions.length,2);assert.equal(d.reviews.length,1);assert.ok(d.questions.every(q=>!q.isDemo));
      assert.deepEqual(errors,[]);report.push({viewport,checks:['导入预览','单选答错阻止推进','单选答对','问答自评','多选','待核对排除','独立计时','个人笔记保留','重复导入','搜索','统计','设置','备份恢复','离线复习','示例移除保留真实数据','无横向溢出','评分按钮首屏可见'],passed:true});
    }catch(err){await shot('FAIL');throw err;}finally{await context.close();}
  }
}finally{await browser.close();await writeFile(new URL('ui-report.json',out),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
