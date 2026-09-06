/* Scope-specific cache only. Never unregister another service worker. */
'use strict';
const VERSION='8.9.0';
const SCOPE=self.registration.scope;
const PREFIX='ash-full-fix:'+SCOPE+':';
const CACHE=PREFIX+VERSION;
const FILES=['water-mask.png','foam-mask.png','index.html','game-data.js','game-core.js','game-controls.js','game-ui.js','manifest.webmanifest','icon-180.png','icon-512.png','ivan-rider.png','varvara-map.png','world-v6.jpg','hero.jpg','mage.jpg','castle.jpg','mine.jpg','sawmill.jpg','chest.jpg','portal.jpg','orc.jpg','wolf.jpg','necromancer.jpg','pikeman.jpg','archer.jpg','cavalier.jpg','griffin.jpg','skeleton.jpg','battlefield.jpg','city.jpg'];
const URLS=new Set(FILES.map(f=>new URL(f,SCOPE).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll([...URLS]))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  url.search='';
  if(!URLS.has(url.href)&&url.href!==SCOPE)return;
  const normalized=url.href===SCOPE?new URL('index.html',SCOPE).href:url.href;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    // An installed version uses one consistent set of code/data/assets until update activation.
    const saved=await cache.match(normalized);
    if(saved)return saved;
    const response=await fetch(event.request);
    if(response.ok)await cache.put(normalized,response.clone());
    return response;
  }
  )());
}
);
