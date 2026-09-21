const CACHE = 'cadastral-v9-20260921';
const CORE = ['./style.css','./app.js','./manifest.json'];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const req=event.request;
  const url=new URL(req.url);
  // Navigation and program files: network first, so GitHub updates appear immediately.
  if(req.mode==='navigate' || /\/(index\.html|app\.js|style\.css|manifest\.json|sw\.js)$/.test(url.pathname)){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(req,{cache:'no-store'});
        if(fresh.ok){ const c=await caches.open(CACHE); c.put(req,fresh.clone()); }
        return fresh;
      }catch(e){ return (await caches.match(req)) || (await caches.match('./index.html')); }
    })());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(req);
    if(cached) return cached;
    const fresh=await fetch(req);
    if(fresh.ok && url.origin===location.origin){ const c=await caches.open(CACHE); c.put(req,fresh.clone()); }
    return fresh;
  })());
});
