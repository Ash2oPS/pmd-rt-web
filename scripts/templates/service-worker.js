const CACHE = __CACHE__;
const ASSETS = __ASSETS__;
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await Promise.all((await caches.keys()).filter(key=>key.startsWith('pmd-field-')&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
  event.respondWith((async()=>{
    // Only build-emitted public assets are cached; preview CORS headers may vary by Origin.
    const cached=await caches.match(event.request,{ignoreVary:true});if(cached)return cached;
    try{
      const response=await fetch(event.request);
      if(response.ok&&url.pathname.startsWith(new URL('./pokemon/',self.registration.scope).pathname)){
        const cache=await caches.open(CACHE);await cache.put(event.request,response.clone());
      }
      return response;
    }
    catch{if(event.request.mode==='navigate')return caches.match(new URL('./index.html',self.registration.scope));return Response.error();}
  })());
});
