const {chromium,webkit}=require('playwright');
const fs=require('fs');
const http=require('node:http'),path=require('node:path');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.mp3':'audio/mpeg','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/tense-english/')){res.writeHead(404);res.end();return;}const relative=url.pathname.slice('/tense-english/'.length)||'index.html';const file=path.resolve(relative);if(!file.startsWith(process.cwd()+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(file,(err,body)=>{res.writeHead(err?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(err?'not found':body);});});
async function startOrigin(){await new Promise(r=>server.listen(8768,'127.0.0.1',r));}
async function stopOrigin(){const done=new Promise(r=>server.close(r));server.closeAllConnections();await done;}
const base='http://127.0.0.1:8768/tense-english/';
(async()=>{
 await startOrigin();
 const browser=await (process.env.QA_BROWSER==='webkit'?webkit:chromium).launch({headless:true});fs.mkdirSync('outputs',{recursive:true});fs.mkdirSync('work',{recursive:true});
 const report={viewports:[],errors:[],flows:[]};
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,acceptDownloads:true});
 const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 async function clickChoice(value){const index=await page.locator('.choice').evaluateAll((els,v)=>els.findIndex(el=>el.dataset.value===v),value);if(index<0)throw Error('Missing choice '+value);await page.locator('.choice').nth(index).click();}
 await page.goto(base);await page.waitForFunction(()=>document.querySelector('[data-action=start]'));
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
 for(const [width,height,name] of [[390,844,'iPhone'],[320,740,'small'],[820,1180,'iPad'],[1366,900,'desktop']]){
  await page.setViewportSize({width,height});
  for(const path of ['today','map','lesson/present-perfect','practice','mistakes','vocab','compare']){
   await page.goto(base+'#'+path);await page.waitForTimeout(70);
   const overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,view:innerWidth}));
   if(overflow.scroll>width+1)throw Error(`Overflow ${name} ${path} ${JSON.stringify(overflow)}`);
   report.viewports.push({width,path,overflow:false});
  }
  await page.goto(base+'#today');
  if(name==='iPhone'||name==='iPad')await page.screenshot({path:`outputs/Tense-${name}.png`,fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});await page.goto(base+'#today');
 await page.locator('button[data-action=audio]').first().click();
 await page.waitForFunction(()=>document.querySelector('button.playing'));
 await page.waitForTimeout(800);
 report.flows.push('Ryan audio starts after a tap');
 await page.locator('[data-action=start][data-mode=daily]').click();
 await page.waitForURL('**#session');await page.waitForSelector('#exercise-controls');
 let steps=0,firstFailure=true;
 while(await page.locator('#exercise-controls').count()){
   const data=await page.evaluate(async()=>{
    const {CONTENT:C}=await import('./content.js');const s=JSON.parse(localStorage.getItem('tense-progress-v1')).session;const c=C.cards.find(c=>c.id===s.queue[s.index]);return {c,index:s.index};
   });
   if(await page.locator('.choice').count()){
    if(firstFailure){await clickChoice(data.c.options[1]);firstFailure=false;}
    else {await clickChoice(data.c.answer);}
   }else if(await page.locator('#answer-input').count()){
    await page.locator('#answer-input').fill(data.c.kind==='fix'?data.c.full:data.c.answer);
    await page.locator('#answer-form button').click();
   }else {await page.locator('[data-action=show-answer]').click();}
   await page.waitForSelector('[data-action=grade]');
   const grade=await page.locator('[data-grade=again]').count()&&!(await page.locator('[data-grade=good]').count())?'again':'good';
   if(await page.locator(`[data-grade=${grade}]`).count())await page.locator(`[data-grade=${grade}]`).click();else await page.locator('[data-grade=hard]').click();
   if(++steps>30)throw Error('Unbounded loop');
 }
 if(steps!==11)throw Error(`Expected 10 + retry, got ${steps}`);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('tense-progress-v1')));
 if(Object.keys(saved.cards).length!==10||Object.keys(saved.mistakes).length!==1)throw Error('Progress counts');
 report.flows.push('10 questions plus delayed retry; first error retained; 10 saved cards');
 await page.reload();await page.waitForSelector('[data-action=finish]');report.flows.push('Session summary survives reload');
 await page.locator('[data-action=finish-mistakes]').click();await page.waitForSelector('.error-card');
 await page.locator('.error-card details summary').click();
 await page.screenshot({path:'outputs/Tense-errors.png',fullPage:true});
 await page.locator('[data-action=settings]').click();
 await page.locator('#font').selectOption('20');
 const over20=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(over20)throw Error('20px overflow');
 await page.locator('#font').selectOption('18');
 await page.locator('#rate').selectOption('0.8');
 const downloadPromise=page.waitForEvent('download');await page.locator('[data-action=export]').click();const download=await downloadPromise;await download.saveAs('work/qa-progress.json');
 const copy=JSON.parse(fs.readFileSync('work/qa-progress.json'));if(Object.keys(copy.cards).length!==10)throw Error('Export missing progress');report.flows.push('Font controls, audio speed and JSON export');
 await page.locator('#import-file').setInputFiles('work/qa-progress.json');await page.locator('#confirm-import').click();await page.waitForURL('**#today');report.flows.push('Import confirms and restores progress');
 await page.locator('[data-action=settings]').click();await page.locator('[data-action=offline]').click();await page.waitForFunction(()=>document.querySelector('#offline-status')?.textContent.startsWith('Готово'),null,{timeout:60000});
 const audioCount=await page.evaluate(async()=> (await(await caches.open('tense-audio-v1')).keys()).length);if(audioCount!==214)throw Error('Incomplete offline audio '+audioCount);
 await page.locator('[data-action=close]').click();if(process.env.QA_BROWSER==='webkit'){await stopOrigin();let unreachable=false;try{await fetch(base+'uncached-outage-probe');}catch{unreachable=true;}if(!unreachable)throw Error('Origin must be unreachable');report.outageMethod='Origin stopped; avoids Playwright WebKit offline-emulation issue 42775';}else{await context.setOffline(true);report.outageMethod='Browser network offline';}await page.reload();await page.waitForSelector('[data-action=start]');
 await page.goto(base+'#lesson/present-perfect');await page.waitForSelector('.example');
 const audioCheck=await page.evaluate(async()=>{const m=await(await fetch('./audio-manifest.json')).json();const f=Object.values(m.files)[0];const response=await fetch(f.src,{headers:{Range:'bytes=0-1023'}});return {status:response.status,size:(await response.arrayBuffer()).byteLength};});
 if(audioCheck.status!==206||audioCheck.size!==1024)throw Error('Offline audio range '+JSON.stringify(audioCheck));
 await page.locator('.example .audio-btn').first().click();await page.waitForTimeout(500);if(!(await page.locator('.audio-btn.playing').count()))throw Error('Offline audio did not start');
 report.flows.push('Full offline reload, lesson content, audio playback and 206 byte-range serving');
 if(process.env.QA_BROWSER==='webkit')await startOrigin();else await context.setOffline(false);
 await page.goto(base+'#practice');await page.locator('[data-action=start][data-mode=listen]').click();await page.waitForURL('**#session');await page.waitForSelector('#exercise-controls');await page.locator('[data-action=audio]').click();await page.waitForTimeout(200);
 const answer=await page.evaluate(async()=>{const {CONTENT:C}=await import('./content.js');const s=JSON.parse(localStorage.getItem('tense-progress-v1')).session;const c=C.cards.find(c=>c.id===s.queue[s.index]);return C.lessons.find(l=>l.id===c.lesson).name;});
 await clickChoice(answer);await page.waitForSelector('.feedback:not(.bad)');report.flows.push('Listening question, Ryan playback and tense feedback');
 await page.screenshot({path:'outputs/Tense-practice.png',fullPage:true});
 if(report.errors.length)throw Error(JSON.stringify(report.errors)); fs.writeFileSync('outputs/browser-qa-'+process.env.QA_BROWSER+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();await stopOrigin();
})().catch(e=>{console.error(e);fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync('outputs/failure.txt',String(e));process.exit(1)});
