export const SUBJECTS = ['政治理论', '常识判断', '言语理解', '判断推理', '数量关系', '资料分析', '公基'];
export const TYPES = ['单选题', '多选题', '判断题', '问答题'];
export const DAY = 86400000;
export const INTERVALS = [1, 3, 7, 14, 30, 60, 120];
export const RATINGS = {again: '不会 / 答错', hard: '模糊', good: '答对', easy: '熟练'};
const string = value => String(value ?? '').trim();
export function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function dayKey(time = Date.now()) { const d = new Date(time); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function freshData() { return {version:1, revision:0, questions:[], progress:{}, notes:{}, reviews:[], settings:{dailyNew:20, groupSize:20, slowSeconds:60}}; }
export function fingerprint(q) { return JSON.stringify([q.subject,q.question.replace(/\s+/g,''),Object.entries(q.options).map(([k,v])=>[k,v.replace(/\s+/g,'')])]); }
export function normalizeQuestion(raw, index=0) {
  const fail = message => { throw new Error(`第 ${index+1} 题：${message}`); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('不是有效题目');
  const id = string(raw.id);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(id) || ['constructor','prototype','__proto__'].includes(id)) fail('id 需为唯一的英文、数字、点、横线或下划线');
  if (!SUBJECTS.includes(raw.subject)) fail('科目必须是七科之一');
  if (!TYPES.includes(raw.type)) fail('题型应为单选题、多选题、判断题或问答题');
  if (!string(raw.question)) fail('缺少题干');
  const options = {};
  if (raw.type !== '问答题') {
    if (!raw.options || typeof raw.options !== 'object' || Array.isArray(raw.options)) fail('缺少选项对象');
    for (const key of Object.keys(raw.options).sort()) {
      if (!/^[A-H]$/.test(key) || !string(raw.options[key])) fail('选项键需为 A–H 且内容不能为空');
      options[key] = string(raw.options[key]);
    }
    if (Object.keys(options).length < 2) fail('至少需要两个选项');
  }
  let answer = raw.type === '问答题' ? string(raw.answer) : [...new Set((Array.isArray(raw.answer) ? raw.answer : string(raw.answer).toUpperCase().split(/[\s,，、]*/)).filter(Boolean))].sort();
  if (!answer.length) fail('缺少正确答案');
  if (raw.type !== '问答题') {
    if (answer.some(key => !Object.hasOwn(options,key))) fail('正确答案不在选项内');
    if (raw.type !== '多选题' && answer.length !== 1) fail('此题型只能有一个正确选项');
    if (raw.type === '多选题' && answer.length < 2) fail('多选题至少需要两个正确选项');
  }
  if (!string(raw.explanation)) fail('缺少答案解析');
  const verification = raw.verification === 'verified' ? 'verified' : 'pending';
  return {id,subject:raw.subject,type:raw.type,question:string(raw.question),options,answer,
    explanation:string(raw.explanation),category:string(raw.category),keyPoints:Array.isArray(raw.keyPoints)?raw.keyPoints.map(string).filter(Boolean):[],
    tags:Array.isArray(raw.tags)?[...new Set(raw.tags.map(string).filter(Boolean))]:[],
    myWrongAnswer:string(raw.myWrongAnswer),wrongReason:string(raw.wrongReason),source:string(raw.source),
    sourceUrl:string(raw.sourceUrl),verification,verifiedAt:string(raw.verifiedAt),isDemo:raw.isDemo===true};
}
export function parseBank(input) {
  const raw = typeof input === 'string' ? JSON.parse(input) : input;
  if (!raw || raw.kind !== 'question-bank' || raw.version !== 1 || !Array.isArray(raw.questions)) throw new Error('需要 version: 1、kind: question-bank 的题库文件');
  if (raw.questions.length > 20000) throw new Error('单批最多导入 20000 道题');
  const questions=raw.questions.map(normalizeQuestion), ids=new Set();
  for (const q of questions) { if(ids.has(q.id)) throw new Error(`题目编号重复：${q.id}`); ids.add(q.id); }
  return {version:1,kind:'question-bank',title:string(raw.title)||'导入题库',questions};
}
const contentKey = q => JSON.stringify([q.subject,q.type,q.question,q.options,q.answer]);
export function mergeBank(data, bank, now=Date.now()) {
  const next=structuredClone(data), byId=new Map(next.questions.map(q=>[q.id,q]));
  const byContent=new Map(next.questions.map(q=>[fingerprint(q),q]));
  const counts={added:0,updated:0,duplicates:0,reset:0,pending:0};
  for (const q of bank.questions) {
    const existing=byId.get(q.id), same=byContent.get(fingerprint(q));
    if (same && same.id !== q.id) {
      if (JSON.stringify(same.answer)!==JSON.stringify(q.answer)) throw new Error(`相同题目的答案冲突：${same.id} / ${q.id}，请先核对`);
      counts.duplicates++; continue;
    }
    if (existing) {
      const changed=contentKey(existing)!==contentKey(q);
      byContent.delete(fingerprint(existing));
      const originalWrong=existing.myWrongAnswer;
      Object.assign(existing,q); if(!existing.myWrongAnswer)existing.myWrongAnswer=originalWrong; counts.updated++;
      if(changed && next.progress[q.id]) { next.progress[q.id]={...next.progress[q.id],stage:-1,due:now,lastRating:'again',needsRelearn:true}; counts.reset++; }
      byContent.set(fingerprint(existing),existing);
    } else { const copy=structuredClone(q);next.questions.push(copy);byId.set(copy.id,copy);byContent.set(fingerprint(copy),copy);counts.added++; }
    if(q.verification==='pending') counts.pending++;
  }
  return {data:next,counts};
}
export function assess(q, response) {
  if(q.type==='问答题') return null;
  const given=[...new Set(Array.isArray(response)?response:[])].sort();
  return given.length>0 && JSON.stringify(given)===JSON.stringify(q.answer);
}
export function schedule(previous, rating, now=Date.now()) {
  if(!Object.hasOwn(RATINGS,rating)) throw new Error('未知掌握程度');
  const p=previous||{}, current=Number.isInteger(p.stage)?p.stage:-1;
  let stage=current, delay;
  if(rating==='again'){stage=-1;delay=10*60000;}
  else if(rating==='hard'){stage=Math.max(-1,current-1);delay=DAY;}
  else {stage=Math.min(INTERVALS.length-1,Math.max(0,current+(rating==='easy'?2:1)));delay=INTERVALS[stage]*DAY;}
  return {...p,stage,due:now+delay,lastReview:now,lastRating:rating,reviewCount:(p.reviewCount||0)+1,
    lapses:(p.lapses||0)+(rating==='again'?1:0),streak:rating==='again'?0:(p.streak||0)+(rating==='good'||rating==='easy'?1:0),needsRelearn:rating==='again'};
}
export function recordReview(data, id, response, rating, seconds, now=Date.now()) {
  const q=data.questions.find(q=>q.id===id); if(!q || q.verification!=='verified') throw new Error('题目不存在或尚未核对');
  const correct=assess(q,response);
  if(correct===false && rating!=='again') throw new Error('本题答错，请选择“不会 / 答错”');
  if(!Number.isFinite(seconds)||seconds<0) throw new Error('计时数据无效');
  const next=structuredClone(data), old=next.progress[id];
  const p=schedule(old,rating,now);
  p.totalSeconds=(old?.totalSeconds||0)+seconds;p.lastSeconds=seconds;
  p.lastCorrect=correct===null?(rating==='good'||rating==='easy'):correct;
  if(correct===false) p.lastWrongAnswer=(response||[]).join('、')||'未作答';
  next.progress[id]=p;
  next.reviews.push({id:`${now}-${next.reviews.length}`,questionId:id,subject:q.subject,time:now,rating,seconds,response,correct:correct===null?p.lastCorrect:correct,isNew:!old,stage:p.stage,due:p.due});
  return next;
}
export function queueFor(data, mode='due', subject='', category='', now=Date.now()) {
  let qs=data.questions.filter(q=>q.verification==='verified'&&(!subject||q.subject===subject)&&(!category||q.category===category));
  const newUsed=new Set(data.reviews.filter(r=>r.isNew&&dayKey(r.time)===dayKey(now)).map(r=>r.questionId)).size;
  const remaining=Math.max(0,data.settings.dailyNew-newUsed);
  const due=qs.filter(q=>data.progress[q.id]&&data.progress[q.id].due<=now).sort((a,b)=>data.progress[a.id].due-data.progress[b.id].due);
  const unseen=qs.filter(q=>!data.progress[q.id]).slice(0,remaining);
  if(mode==='due') qs=[...due,...unseen];
  else if(mode==='new') qs=unseen;
  else if(mode==='wrong') qs=qs.filter(q=>{const p=data.progress[q.id];return p&&(p.lastRating==='again'||p.lastRating==='hard');});
  else if(mode==='slow') qs=qs.filter(q=>(data.progress[q.id]?.lastSeconds||0)>=data.settings.slowSeconds);
  return qs.slice(0,data.settings.groupSize).map(q=>q.id);
}
export function validateBackup(input) {
  const raw=typeof input==='string'?JSON.parse(input):input;
  if(raw?.kind!=='review-backup'||raw.version!==1||!raw.data)throw new Error('不是本程序的备份文件');
  const d=raw.data;
  const bank=parseBank({kind:'question-bank',version:1,questions:d.questions});
  if(!d.progress||typeof d.progress!=='object'||Array.isArray(d.progress)||!Array.isArray(d.reviews))throw new Error('备份缺少进度或复习记录');
  const ids=new Set(bank.questions.map(q=>q.id));
  for(const [id,p] of Object.entries(d.progress)){
    if(!ids.has(id)||!p||!Number.isFinite(p.due)||!Number.isInteger(p.stage)||p.stage < -1 || p.stage>6||!Number.isFinite(p.reviewCount)||p.reviewCount<0)throw new Error('备份中的复习进度无效');
  }
  for(const r of d.reviews)if(!r||!ids.has(r.questionId)||!Object.hasOwn(RATINGS,r.rating)||!Number.isFinite(r.time)||!Number.isFinite(r.seconds)||r.seconds<0)throw new Error('备份中的历史记录无效');
  const notes={};
  for(const [id,note] of Object.entries(d.notes||{})){if(!ids.has(id)||typeof note!=='string')throw new Error('备份中的笔记无效');notes[id]=note;}
  return {...freshData(),questions:bank.questions,progress:structuredClone(d.progress),notes,reviews:structuredClone(d.reviews),settings:normalizeSettings(d.settings)};
}
export function normalizeSettings(raw={}) {return {dailyNew:Math.max(0,Math.min(200,Math.round(Number(raw.dailyNew) || 0))),groupSize:Math.max(1,Math.min(100,Math.round(Number(raw.groupSize)||20))),slowSeconds:Math.max(5,Math.min(600,Math.round(Number(raw.slowSeconds)||60)))};}
