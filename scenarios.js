/* Deterministic visual fixtures, only loaded by visual.html with in-memory saves. */
(async()=>{
 const app=AshUI.app;await app.readyPromise;if(!app.ready)return;const C=AshCore,D=C.D,scenario=new URLSearchParams(location.search).get('scene')||'map',s=C.initialState(920),all=Array.from({length:D.W*D.H},(_,i)=>C.key(i%D.W,Math.floor(i/D.W)));
 s.settings.music=false;s.settings.sound=false;s.gold=17220;s.wood=253;s.ore=500;s.gems=245;s.crystal=6;
 s.heroes.arden.army={pikes:28,bows:24,cavs:12,griffins:6,mages:8};
 if(scenario!=='map'&&scenario!=='dungeon')s.seen=all;
 if(['dungeon','dungeon-fog','battle-abyss'].includes(scenario)){s.dungeon.inside='arden';if(scenario==='dungeon-fog'){s.dungeon.x=8;s.dungeon.y=7;s.dungeon.seen=Array.from({length:130},(_,i)=>C.key(i%13,Math.floor(i/13))).filter(k=>{const [x,y]=k.split(',').map(Number);return y>2||x<8})}else if(scenario==='battle-abyss'){s.dungeon.x=4;s.dungeon.y=8}}
 if(scenario==='threat'){s.q.threat=92;s.q.siege=true;s.enemy.power=6;s.enemy.x=12;s.enemy.y=7}
 app.installEngine(s);app.localModal=null;
 if(['dungeon','dungeon-fog'].includes(scenario)){app.engine.dungeonReveal();app.screen='dungeon';app.centerDungeon()}
 else if(scenario==='battle-abyss'){app.engine.dungeonReveal();app.engine.startBattle('arden',{kind:'dungeon',id:'d-guard'})}
 else if(scenario==='battle-surface'){app.engine.s.heroes.arden.x=8;app.engine.s.heroes.arden.y=2;app.engine.startBattle('arden',{kind:'object',id:'object-8-3'})}
 else if(scenario==='city')app.switchScreen('town');
 else if(scenario==='hero')app.switchScreen('hero');
 else{app.screen='map';app.center();if(scenario==='selected'){app.selection='castle';app.$('objectInfo').textContent='Стальной Холм · столица · нажмите для входа';app.$('objectInfo').classList.remove('hidden')}if(scenario==='movement'){app.motion.duration=3000;app.engine.commandMove('arden',16,8);app.motion.frame(app.now()-1500);}}
 const timings=[];const scene=app.engine.s.battle?app.battleScene:app.screen==='dungeon'?app.dungeonScene:app.worldScene;const draw=scene.draw.bind(scene);scene.draw=(...args)=>{const start=performance.now();const r=draw(...args);if(timings.length<180){timings.push(performance.now()-start);if(timings.length===180){const sorted=[...timings].sort((a,b)=>a-b);document.documentElement.dataset.qaPerformance=JSON.stringify({frames:180,mean:timings.reduce((a,b)=>a+b,0)/180,p95:sorted[171],max:sorted[179]})}}return r};
 app.render();app.requestFrame();document.documentElement.dataset.qaScene=scenario;document.documentElement.dataset.qaReady='true';
 const status=document.createElement('output');status.id='qaStatus';status.hidden=true;status.textContent=JSON.stringify({scenario,version:D.VERSION,saves:'memory-only'});document.body.appendChild(status);
})();
