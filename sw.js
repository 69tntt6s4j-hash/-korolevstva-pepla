/* Scope-specific cache only. Cache-safe GitHub Pages release. */
'use strict';
const VERSION='9.2.0';
const SCOPE=self.registration.scope;
const PREFIX='ash-full-fix:'+SCOPE+':';
const CACHE=PREFIX+VERSION;
const FILES=['game.css','scene-camera.js','scene-renderer.js','scene-battle.js','music-engine.js','assets/world-sprites.png','assets/actors-v2.png','assets/terrain-materials.png','release-920.js','index.html','game-data.js','game-core.js','game-controls.js','game-ui.js','manifest.webmanifest','icon-180.png','icon-512.png','hero.jpg','hero-portrait.jpg','mage-portrait.jpg','pikeman-portrait.jpg','archer-portrait.jpg','cavalier-portrait.jpg','griffin-portrait.jpg','mage.jpg','castle.jpg','mine.jpg','sawmill.jpg','chest.jpg','portal.jpg','orc.jpg','wolf.jpg','necromancer.jpg','pikeman.jpg','archer.jpg','cavalier.jpg','griffin.jpg','skeleton.jpg','city.jpg'];
const URLS=new Set(FILES.map(f=>new URL(f,SCOPE).href));
const INDEX=new URL('index.html',SCOPE).href;

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll([...URLS]);
  if(typeof self.skipWaiting==='function')await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));
  if(self.clients&&typeof self.clients.claim==='function')await self.clients.claim();
})()));

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const original=new URL(event.request.url);
  if(original.searchParams.has('qa'))return;
  const clean=new URL(original.href); clean.search=''; clean.hash='';
  const isNavigation=clean.href===SCOPE||clean.href===INDEX;
  if(!isNavigation&&!URLS.has(clean.href))return;

  if(isNavigation){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const response=await fetch(INDEX,{cache:'no-store',credentials:'same-origin'});
        if(response&&response.ok){ await cache.put(INDEX,response.clone()); return response; }
      }catch(_){ }
      const saved=await cache.match(INDEX);
      if(saved)return saved;
      throw new Error('Offline and no cached index.html');
    })());
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const saved=await cache.match(clean.href);
    if(saved)return saved;
    const response=await fetch(event.request);
    if(response&&response.ok)await cache.put(clean.href,response.clone());
    return response;
  })());
});
