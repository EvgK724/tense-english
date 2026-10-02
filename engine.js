export const DAY = 86400000;
export const INTERVALS = [1, 3, 7, 14, 30, 60, 120, 180];
export const STORAGE_KEY = 'tense-progress-v1';
export const localDay = (now = Date.now()) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export function freshState(now = Date.now()) { return { schema:1, createdAt:now, cards:{}, mistakes:{}, days:{}, lessons:{}, settings:{ rate:1, font:16, goal:10 }, session:null }; }
export function normalize(text) {
  return String(text).normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/\bwon't\b/g,'will not').replace(/\bcan't\b/g,'cannot').replace(/\bshan't\b/g,'shall not')
    .replace(/\b([a-z]+)n't\b/g,'$1 not').replace(/\bi'm\b/g,'i am').replace(/\b(you|we|they)'re\b/g,'$1 are').replace(/\b(i|you|we|they)'ve\b/g,'$1 have').replace(/\b([a-z]+)'ll\b/g,'$1 will').replace(/\b(he|she|it)'s\b/g,'$1 is').replace(/\banalyz/g,'analys').replace(/\btraveling\b/g,'travelling').replace(/[.,!?;:"()]/g,'').replace(/\s+/g,' ').trim();
}
export function checkAnswer(card, input, kind = card.kind) {
  const target = kind === 'fix' ? [card.full, ...(card.fullAlternatives || [])] : [card.answer, ...(card.alternatives || [])];
  const variants = target.flatMap(t=>[t,t.replace(/\b(He|She|It|he|she|it) has\b/g,"$1's"),t.replace(/\b(I|You|He|She|We|They|i|you|he|she|we|they) had\b/g,"$1'd")]);
  return variants.some(t => normalize(t) === normalize(input));
}
export function planReview(old = {}, rating, now = Date.now(), recovery = false) {
  const stage = Number.isInteger(old.stage) ? old.stage : -1;
  let nextStage, interval;
  if (rating === 'again') { nextStage = -1; interval = 10 / 1440; }
  else if (rating === 'hard') { nextStage = Math.max(-1, stage); interval = Math.max(1, Math.round((old.interval || 1) * .5)); }
  else { nextStage = Math.min(INTERVALS.length - 1, Math.max(0, stage + (rating === 'easy' ? 2 : 1))); interval = INTERVALS[nextStage]; }
  if (recovery && rating !== 'again') { nextStage = 0; interval = 1; }
  let due=now + interval * DAY;
  // Extra practice before the due time cannot artificially promote a card.
  if(old.due>now && old.lastRating!=='again' && !recovery && rating!=='again'){
    if(rating==='hard'){due=Math.min(old.due,due);}
    else {due=old.due;nextStage=old.stage;interval=old.interval;}
  }
  return { due, stage: nextStage, interval, reviews: (old.reviews || 0) + 1, lapses:(old.lapses || 0) + (rating === 'again' ? 1 : 0), last:now, lastRating:rating };
}
export function dueCards(cards, state, now = Date.now()) { return cards.filter(c => state.cards[c.id] && state.cards[c.id].due <= now).sort((a,b)=>state.cards[a.id].due - state.cards[b.id].due); }
export function buildQueue(cards, state, {mode='daily', lesson=null, now=Date.now(), limit=10}={}) {
  const available = lesson ? cards.filter(c=>c.lesson===lesson) : cards;
  const due = dueCards(available,state,now);
  if (mode==='due') return due.slice(0,limit).map(c=>c.id);
  if (mode==='mistakes') return available.filter(c=>state.mistakes[c.id] && !state.mistakes[c.id].resolved).sort((a,b)=>state.mistakes[b.id].last - state.mistakes[a.id].last).slice(0,limit).map(c=>c.id);
  if (lesson) return [...due,...available.filter(c=>!due.some(d=>d.id===c.id))].slice(0,limit).map(c=>c.id);
  if (mode==='daily') {
    // Prioritise overdue cards. Fill with new material in a gradual curriculum.
    return [...due,...available.filter(c=>!state.cards[c.id])].slice(0,limit).map(c=>c.id);
  }
  if (mode==='listen') return shuffled(available.filter(c=>!['future-forms','choose-tense'].includes(c.lesson))).slice(0,limit).map(c=>c.id);
  const studied=available.filter(c=>state.cards[c.id]);
  const pool = studied.length >= 10 ? studied : available.filter(c=>['present-simple','present-continuous','past-simple','choose-tense'].includes(c.lesson));
  return shuffled(pool).slice(0,limit).map(c=>c.id);
}
export function shuffled(arr) { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
export function applyGrade(state, card, rating, {now=Date.now(), recovery=false, answer='', wrong=false}={}) {
  state.cards[card.id] = planReview(state.cards[card.id],rating,now,recovery);
  const day=localDay(now);
  if (!state.days[day]) state.days[day]={answers:0,correct:0,ids:[]};
  state.days[day].answers++;
  if(rating!=='again'&&!wrong)state.days[day].correct++;
  if(!state.days[day].ids.includes(card.id)) state.days[day].ids.push(card.id);
  if(wrong||rating==='again') {
    const m=state.mistakes[card.id]||{count:0};
    state.mistakes[card.id]={count:m.count+1,last:now,lastAnswer:answer.slice(0,500),resolved:false,successDays:[]};
  } else if(state.mistakes[card.id]) {
    const m=state.mistakes[card.id];
    if(localDay(m.last)!==day&&!m.successDays.includes(day)) m.successDays.push(day);
    m.resolved=m.successDays.length>=2;
  }
  return state;
}
export function validateState(input, ids) {
  if(!input||input.schema!==1||typeof input!=='object'||!input.cards||typeof input.cards!=='object')throw Error('Это не резервная копия Tense версии 1.');
  const state=freshState();
  state.createdAt=Number.isFinite(input.createdAt)?input.createdAt:state.createdAt;
  for (const id of ids) {
    const c=input.cards[id];
    if(c && Number.isFinite(c.due)&&Number.isFinite(c.interval)&&c.interval>=0&&c.interval<=3650&&Number.isInteger(c.stage)&&c.stage>=-1&&c.stage<INTERVALS.length) state.cards[id]={due:c.due,stage:c.stage,interval:c.interval,reviews:Math.max(0,Number(c.reviews)||0),lapses:Math.max(0,Number(c.lapses)||0),last:Number(c.last)||0,lastRating:['again','hard','good','easy'].includes(c.lastRating)?c.lastRating:'good'};
    const m=input.mistakes?.[id];
    if(m && Number.isFinite(m.last)) state.mistakes[id]={count:Math.max(1,Number(m.count)||1),last:m.last,lastAnswer:String(m.lastAnswer||'').slice(0,500),resolved:!!m.resolved,successDays:Array.isArray(m.successDays)?m.successDays.filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)).slice(-10):[]};
  }
  for(const [date,value] of Object.entries(input.days||{}))if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&value&&Array.isArray(value.ids)) state.days[date]={answers:Math.max(0,Number(value.answers)||0),correct:Math.max(0,Number(value.correct)||0),ids:[...new Set(value.ids.filter(id=>ids.includes(id)))]};
  const settings=input.settings||{};
  if([.8,1,1.15].includes(Number(settings.rate)))state.settings.rate=Number(settings.rate);
  if([16,18,20].includes(Number(settings.font)))state.settings.font=Number(settings.font);
  if([5,10,15].includes(Number(settings.goal)))state.settings.goal=Number(settings.goal);
  for(const [id,value] of Object.entries(input.lessons||{}))if(ids.some(c=>c.startsWith(id+'-')) && value===true) state.lessons[id]=true;
  const s=input.session;
  if(s&&Array.isArray(s.queue)&&s.queue.every(id=>ids.includes(id))&&s.queue.length<=60&&Number.isInteger(s.index)&&s.index>=0&&s.index<=s.queue.length&&Array.isArray(s.results)&&['daily','due','mixed','mistakes','listen','recall','lesson'].includes(s.mode)) {
    state.session={mode:s.mode,lesson:typeof s.lesson==='string'?s.lesson:null,queue:s.queue,index:s.index,initial:Number(s.initial)||10,results:s.results.filter(r=>ids.includes(r.id)&&['again','hard','good','easy'].includes(r.rating)),retries:Object.fromEntries(Object.entries(s.retries||{}).filter(([id,n])=>ids.includes(id)&&n===1)),failed:Array.isArray(s.failed)?s.failed.filter(id=>ids.includes(id)):[],started:Number(s.started)||Date.now()};
  }
  return state;
}
