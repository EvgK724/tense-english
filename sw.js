const SHELL='tense-shell-v1-20261002-type2';
const AUDIO='tense-audio-v1';
const BASE=new URL('./',self.location).href;
const CORE=['./','index.html','app.js','engine.js','webmcp.js','content.js','styles.css','manifest.webmanifest','audio-manifest.json','icon.svg','icon-180.png','icon-192.png','icon-512.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(SHELL);await cache.addAll(CORE.map(p=>new URL(p,BASE).href));await self.skipWaiting();})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('tense-shell-')&&key!==SHELL)await caches.delete(key);await self.clients.claim();})()));
async function ranged(response,range){
 const data=await response.arrayBuffer(),size=data.byteLength;
 const m=/^bytes=(\d*)-(\d*)$/.exec(range||'');
 if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
 let start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
 let end=m[1]?(m[2]?Math.min(Number(m[2]),size-1):size-1):size-1;
 if(start>=size||end<start)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
 return new Response(data.slice(start,end+1),{status:206,headers:{'Content-Type':'audio/mpeg','Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${size}`,'Accept-Ranges':'bytes'}});
}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(BASE))return;
 if(url.pathname.endsWith('.mp3')){event.respondWith((async()=>{const cache=await caches.open(AUDIO);let response=await cache.match(url.href);if(!response){response=await fetch(new Request(url.href,{credentials:'same-origin'}));if(response.ok&&response.status===200&&response.headers.get('content-type')?.includes('audio'))await cache.put(url.href,response.clone());}return request.headers.has('Range')&&response.status===200?ranged(response,request.headers.get('Range')):response;})());return;}
 if(request.mode==='navigate'){event.respondWith((async()=>{try{const response=await fetch(request);if(response.ok)return response;}catch(_){}return (await caches.open(SHELL)).match(new URL('index.html',BASE).href);})());return;}
 if(CORE.some(p=>new URL(p,BASE).href===url.href)){event.respondWith((async()=>{return (await caches.open(SHELL)).match(request)||fetch(request);})());}
});
