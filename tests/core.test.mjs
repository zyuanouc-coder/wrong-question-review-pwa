import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SUBJECTS,DAY,INTERVALS,freshData,parseBank,mergeBank,assess,schedule,recordReview,queueFor,validateBackup,escapeHTML,syncPublishedBank} from '../js/core.mjs';
import {Store,STORAGE_KEY} from '../js/store.mjs';
const bank=parseBank(await readFile(new URL('../data/example-bank.json',import.meta.url),'utf8'));
const initial=()=>mergeBank(freshData(),bank).data;
const now=new Date('2026-09-30T12:00:00+08:00').getTime();
test('七科与明确的示例库，正式库格式有效且不混入示例',async()=>{
  assert.equal(SUBJECTS.length,7);assert.ok(SUBJECTS.includes('公基'));
  assert.equal(bank.questions.length,3);assert.ok(bank.questions.every(q=>q.isDemo));
  const published=parseBank(await readFile(new URL('../data/question-bank.json',import.meta.url),'utf8'));
  assert.ok(Number.isInteger(published.revision)&&published.revision>=1);
  assert.ok(published.questions.every(q=>!q.isDemo&&!q.id.startsWith('demo-')));
  const incomplete=published.questions.find(q=>q.id==='verbal-20261021-0001');
  assert.ok(incomplete);assert.deepEqual(incomplete.answer,['B']);assert.equal(incomplete.myWrongAnswer,'C');
  assert.equal(incomplete.verification,'pending');assert.equal(incomplete.options.D,undefined);
  const d=mergeBank(freshData(),published).data;
  assert.ok(!queueFor(d,'all','','',now).includes(incomplete.id));
});
test('导入严格验证，错误文件不会部分修改已有题库',()=>{
  for(const changes of [{subject:'未知'},{answer:['H']},{explanation:''},{id:'__proto__'},{options:{A:'仅一个'}}]){
    assert.throws(()=>parseBank({...bank,questions:[{...bank.questions[0],...changes}]}));
  }
  assert.throws(()=>parseBank({...bank,questions:[bank.questions[0],bank.questions[0]]}),/重复/);
  assert.throws(()=>parseBank({questions:[]}),/question-bank/);
  assert.equal(freshData().questions.length,0);
});
test('主旨概括三题保留误选、缺项待核对、重复同步不重建，已有私人笔记不变',async()=>{
  const published=parseBank(await readFile(new URL('../data/question-bank.json',import.meta.url),'utf8'));
  const byId=new Map(published.questions.map(q=>[q.id,q]));
  const film=byId.get('verbal-20261021-0002'),privacy=byId.get('verbal-20261021-0003'),tradition=byId.get('verbal-20261021-0004');
  assert.deepEqual([film.myWrongAnswer,privacy.myWrongAnswer,tradition.myWrongAnswer],['C','A','C']);
  assert.deepEqual([film.answer,privacy.answer,tradition.answer],[['B'],['B'],['D']]);
  assert.equal(film.verification,'pending');assert.equal(film.options.D,undefined);
  assert.equal(privacy.verification,'verified');assert.equal(tradition.verification,'verified');
  assert.match(tradition.explanation,/造就.*更强/);
  const previous={...published,revision:1,questions:[byId.get('verbal-20261021-0001')]};
  let d=syncPublishedBank(freshData(),previous,'old',now).data;
  d.notes[previous.questions[0].id]='原有私人笔记';
  const batch={...published,questions:[previous.questions[0],film,privacy,tradition]};
  const merged=syncPublishedBank(d,batch,'current',now+1000);
  assert.equal(merged.counts.added,3);assert.equal(merged.data.notes[previous.questions[0].id],'原有私人笔记');
  assert.equal(syncPublishedBank(merged.data,batch,'current').reason,'unchanged');
  const queue=queueFor(merged.data,'all','','',now);
  assert.ok(!queue.includes(film.id));assert.ok(queue.includes(privacy.id));assert.ok(queue.includes(tradition.id));
});
test('星系题完整归档，误选B、正确A，增量同步保留旧题进度与笔记',async()=>{
  const published=parseBank(await readFile(new URL('../data/question-bank.json',import.meta.url),'utf8'));
  const q=published.questions.find(q=>q.id==='verbal-20261021-0005');
  assert.ok(q);assert.equal(q.verification,'verified');assert.equal(q.myWrongAnswer,'B');assert.deepEqual(q.answer,['A']);
  assert.deepEqual(Object.keys(q.options),['A','B','C','D']);assert.equal(assess(q,['A']),true);assert.equal(assess(q,['B']),false);
  const oldBank={...published,revision:2,questions:published.questions.filter(item=>item.id!==q.id)};
  let d=syncPublishedBank(freshData(),oldBank,'old',now).data;
  const oldId='verbal-20261021-0003';d=recordReview(d,oldId,['B'],'good',5,now);d.notes[oldId]='保留原笔记';
  const updated=syncPublishedBank(d,published,'new',now+1000);
  assert.equal(updated.counts.added,1);assert.deepEqual(updated.data.progress,d.progress);assert.deepEqual(updated.data.notes,d.notes);assert.deepEqual(updated.data.reviews,d.reviews);
  assert.ok(queueFor(updated.data,'new','','',now).includes(q.id));
  assert.equal(syncPublishedBank(updated.data,published,'new').reason,'unchanged');
});
test('全球治理题归入意图判断，正确C误选D，发布更新保留原复习记录',async()=>{
  const published=parseBank(await readFile(new URL('../data/question-bank.json',import.meta.url),'utf8'));
  const q=published.questions.find(q=>q.id==='verbal-20261021-0006');
  assert.ok(q);assert.equal(q.category,'意图判断');assert.equal(q.verification,'verified');
  assert.deepEqual(q.answer,['C']);assert.equal(q.myWrongAnswer,'D');assert.deepEqual(Object.keys(q.options),['A','B','C','D']);
  assert.equal(assess(q,['C']),true);assert.equal(assess(q,['D']),false);
  const previous={...published,revision:published.revision-1,questions:published.questions.filter(item=>item.id!==q.id)};
  let d=syncPublishedBank(freshData(),previous,'before',now).data;
  d=recordReview(d,'verbal-20261021-0005',['A'],'good',7,now);d.notes['verbal-20261021-0005']='保留旧题私人笔记';
  const result=syncPublishedBank(d,published,'after',now+1000);
  assert.equal(result.counts.added,1);assert.deepEqual(result.data.progress,d.progress);assert.deepEqual(result.data.notes,d.notes);assert.deepEqual(result.data.reviews,d.reviews);
  assert.ok(queueFor(result.data,'new','言语理解','意图判断',now).includes(q.id));
  assert.equal(syncPublishedBank(result.data,published,'after').reason,'unchanged');
});
test('单选、多选和问答的判定边界',()=>{
  const q=bank.questions[0];assert.equal(assess(q,['B']),true);assert.equal(assess(q,[]),false);assert.equal(assess(q,['A']),false);
  const multi={...q,type:'多选题',answer:['A','C']};assert.equal(assess(multi,['C','A']),true);assert.equal(assess(multi,['A']),false);assert.equal(assess(multi,['A','B','C']),false);
  assert.equal(assess(bank.questions[2],'口述'),null);
});
test('复习间隔从1天逐级到120天，忘记重置，模糊缩短',()=>{
  let p;
  for(const days of INTERVALS){p=schedule(p,'good',now);assert.equal(p.due,now+days*DAY);}
  assert.equal(schedule(p,'good',now).due,now+120*DAY);
  const wrong=schedule(p,'again',now);assert.equal(wrong.stage,-1);assert.equal(wrong.due,now+600000);assert.equal(wrong.lapses,1);
  assert.equal(schedule(wrong,'good',now).due,now+DAY);
  assert.equal(schedule(null,'easy',now).due,now+3*DAY);
  assert.equal(schedule(p,'hard',now).due,now+DAY);
});
test('答错不能作为答对推进，计时保留，复习记录写入',()=>{
  const d=initial(),q=d.questions[0];assert.throws(()=>recordReview(d,q.id,['A'],'good',3,now),/答错/);
  const wrong=recordReview(d,q.id,['A'],'again',8,now);assert.equal(wrong.progress[q.id].lastWrongAnswer,'A');assert.equal(wrong.reviews[0].seconds,8);assert.equal(wrong.reviews[0].correct,false);assert.equal(wrong.questions[0].myWrongAnswer,'A');
  assert.equal(d.reviews.length,0);
  assert.throws(()=>recordReview(d,q.id,['B'],'good',NaN,now));
});
test('到期优先、新题日限额、未到期排除、待核对排除、错题慢题筛选',()=>{
  let d=initial();d.settings.dailyNew=1;
  assert.equal(queueFor(d,'new','','',now).length,1);
  d=recordReview(d,d.questions[0].id,['A'],'again',90,now);
  assert.equal(queueFor(d,'due','','',now).length,0);
  assert.deepEqual(queueFor(d,'due','','',now+600000),[d.questions[0].id]);
  assert.deepEqual(queueFor(d,'wrong','','',now),[d.questions[0].id]);
  assert.deepEqual(queueFor(d,'slow','','',now),[d.questions[0].id]);
  d.questions[0].verification='pending';assert.equal(queueFor(d,'all','判断推理','',now).length,0);
  d.settings.dailyNew=0;assert.equal(queueFor(d,'new','','',now+DAY).length,0);
});
test('反复导入幂等，异编号重复跳过，冲突答案阻止导入',()=>{
  const d=initial();assert.equal(mergeBank(d,bank).data.questions.length,3);
  const duplicate={...bank.questions[0],id:'other-id'};
  assert.equal(mergeBank(d,{questions:[duplicate]}).counts.duplicates,1);
  assert.throws(()=>mergeBank(d,{questions:[{...duplicate,answer:['A']}]}),/冲突/);
  assert.equal(d.questions[0].answer[0],'B');
});
test('内容改正后提前复习但保留历史和私人笔记；解析更新不重置进度',()=>{
  let d=initial();const q=d.questions[0];d=recordReview(d,q.id,['B'],'good',4,now);d.notes[q.id]='我的个人错因';
  const explain=mergeBank(d,{questions:[{...q,explanation:'新的详细解析'}]},now+1000).data;
  assert.equal(explain.progress[q.id].due,now+DAY);assert.equal(explain.notes[q.id],'我的个人错因');
  assert.equal(mergeBank(d,{questions:[{...q,myWrongAnswer:''}]}).data.questions[0].myWrongAnswer,'A');
  const fixed=mergeBank(explain,{questions:[{...q,answer:['C']}]},now+2000).data;
  assert.equal(fixed.progress[q.id].stage,-1);assert.equal(fixed.progress[q.id].due,now+2000);assert.equal(fixed.reviews.length,1);assert.equal(fixed.notes[q.id],'我的个人错因');
});
test('完整备份恢复往返，损坏备份拒绝',()=>{
  let d=initial();d=recordReview(d,d.questions[0].id,['B'],'easy',7,now);d.notes[d.questions[0].id]='容易混淆';
  const restored=validateBackup({kind:'review-backup',version:1,data:d});assert.deepEqual(restored,d);
  assert.throws(()=>validateBackup({...d}),/备份/);
  const broken=structuredClone(d);broken.progress[d.questions[0].id].due='bad';assert.throws(()=>validateBackup({kind:'review-backup',version:1,data:broken}),/进度/);
});
test('存储失败不丢失现有内存进度，多个标签页不静默覆盖',()=>{
  const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  const a=new Store(storage),b=new Store(storage);a.save(initial());assert.throws(()=>b.save(freshData()),/其他页面/);
  const loaded=new Store(storage);assert.equal(loaded.data.questions.length,3);
  const old=loaded.data;storage.setItem=()=>{throw new Error('quota');};assert.throws(()=>loaded.save({...old,questions:[]}),/quota/);assert.equal(loaded.data,old);assert.ok(values.get(STORAGE_KEY));
});
test('不把题库文本当HTML执行',()=>assert.equal(escapeHTML('<img onerror="bad">'), '&lt;img onerror=&quot;bad&quot;&gt;'));
test('自动题库更新幂等、拒绝旧批次回退、保留本机进度和私人题',()=>{
  let d=initial();d=recordReview(d,d.questions[0].id,['B'],'good',4,now);d.notes[d.questions[0].id]='私人笔记';
  const batch={...bank,revision:1,questions:[{...bank.questions[1],id:'public-001',question:'新的公共题目'}]};
  const first=syncPublishedBank(d,batch,'hash1',now);assert.equal(first.data.questions.length,4);assert.equal(first.data.reviews.length,1);assert.equal(first.data.notes[d.questions[0].id],'私人笔记');
  assert.equal(syncPublishedBank(first.data,batch,'hash1').reason,'unchanged');
  assert.equal(syncPublishedBank(first.data,{...batch,revision:0},'old').reason,'older');
  assert.throws(()=>syncPublishedBank(first.data,batch,'changed'),/批次编号/);
  assert.equal(syncPublishedBank(first.data,{...batch,questions:[]},'empty').reason,'empty');
  const restored=validateBackup({kind:'review-backup',version:1,data:first.data});assert.deepEqual(restored.publishedBank,first.data.publishedBank);
  const corrected=syncPublishedBank(restored,{...batch,revision:2,questions:[{...d.questions[0],answer:['C']}]},'hash2',now+1000);
  assert.equal(corrected.data.progress[d.questions[0].id].due,now+1000);assert.equal(corrected.data.notes[d.questions[0].id],'私人笔记');assert.equal(corrected.data.reviews.length,1);
});
