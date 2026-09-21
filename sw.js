const CACHE='cadastral-v10-20260921';
self.addEventListener('install',e=>{self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==CACHE)await caches.delete(k);await self.clients.claim();})());});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(e.request.mode==='navigate' || u.origin===self.location.origin){
    e.respondWith((async()=>{try{const r=await fetch(e.request,{cache:'no-store'});if(r.ok){const c=await caches.open(CACHE);c.put(e.request,r.clone());}return r;}catch(err){return (await caches.match(e.request)) || (e.request.mode==='navigate'?caches.match('./index.html'):Response.error());}})());
  }
});
