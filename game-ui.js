/* Browser adapter. Render is read-only; engine commits own persistence boundaries. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./game-core.js'),require('./game-controls.js'),require('./scene-camera.js'),require('./scene-renderer.js'),require('./scene-battle.js'),require('./music-engine.js'));
  else{
    root.AshUI=factory(root.AshCore,root.AshControls,root.AshCamera,root.AshScene,root.AshBattleScene,root.AshMusic);
    root.AshUI.app=root.AshUI.boot(root);
  }
}
)(typeof globalThis!=='undefined'?globalThis:this,function(C,Controls,CameraModule,Scenes,Battles,Music){
  'use strict';
  const D=C.D;
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }
  [c]));
  const label=o=>o.label||o.name||({
    chest:'Сундук',artifact:D.artifactDefs[o.artifact]?.n,portal:'Источник маны'
  }
  )[o.t]||'Объект';
  function loadImages(env){
    return Promise.all(D.imageFiles.map(name=>new Promise(resolve=>{
      const image=new env.Image();
      let done=false;
      const finish=ok=>{
        if(done)return;
        done=true;
        env.clearTimeout(timer);
        resolve({
          name,image:ok?image:null
        }
        )
      }
      ;
      const timer=env.setTimeout(()=>finish(false),15000);
      image.onload=()=>{if(typeof image.decode==='function')image.decode().then(()=>finish(true),()=>finish(false));else finish(true)};
      image.onerror=()=>finish(false);
      image.src=name
    }
    ))).then(items=>({
      assets:Object.fromEntries(items.filter(x=>x.image).map(x=>[x.name,x.image])),missing:items.filter(x=>!x.image).map(x=>x.name)
    }
    ))
  }
  class App{
    constructor(env){
      this.env=env;
      this.doc=env.document;
      this.$=id=>this.doc.getElementById(id);
      this.engine=null;
      this.ready=false;
      this.assets={
      }
      ;
      this.screen='map';
      this.camera=new CameraModule.Camera();
      this.dungeonCamera=new CameraModule.Camera({zoom:.85});
      this.cameraPreferences={surface:.72,dungeon:.85};
      try{if(!env.ASH_QA)Object.assign(this.cameraPreferences,JSON.parse(env.localStorage.getItem('ash-camera-920')||'{}'))}catch(e){}
      this.camera.zoom=this.cameraPreferences.surface;this.dungeonCamera.zoom=this.cameraPreferences.dungeon;
      this.manualPanUntil=0;
      this.frameId=null;
      this.reduceMotion=!!env.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      this.motion=null;
      this.localModal=null;
      this.selection=null;
      this.selectionTimer=null;
      this.lastModal=null;
      this.previousFocus=null;
      this.toastTimer=null;
      this.dayBusy=false;
      this.audio=null;
      this.loading=false;
      this.bootGeneration=0;
      const qaStorage=new Map();
      this.repository=new C.SaveRepository({
        getItem:k=>env.ASH_QA?qaStorage.get(k)||null:env.localStorage.getItem(k),setItem:(k,v)=>env.ASH_QA?qaStorage.set(k,v):env.localStorage.setItem(k,v)
      }
      );
      this.canvas=this.$('mapCanvas');
      this.dungeonCanvas=this.$('dungeonCanvas');
      this.pointer=new Controls.PointerController(this.camera,{
        onTap:(x,y)=>this.mapTap(x,y),onChange:()=>{this.camera.target=null;this.manualPanUntil=this.now()+4000;this.saveCamera();this.requestFrame()},clamp:()=>this.clamp()
      }
      );
      this.configureAccessibility();
      this.bind();
      this.setBusy(true);
    }
    configureAccessibility(){
      for(const modal of this.doc.querySelectorAll('.modal')){
        modal.setAttribute('role','dialog');
        modal.setAttribute('aria-modal','true');
        const dialog=modal.querySelector('.dialog');
        dialog?.setAttribute('tabindex','-1');
        const title=dialog?.querySelector('h2,.title');
        if(title){
          if(!title.id)title.id=modal.id+'Title';
          modal.setAttribute('aria-labelledby',title.id)
        }
        else modal.setAttribute('aria-label','Событие игры')
      }
      const labels={
        enemyInfoClose:'Закрыть сведения о противнике',enemyCancelBtn:'Отменить нападение',spellCancel:'Закрыть книгу боя',retreatBtn:'Отступить в город за 350 золота',objectListClose:'Закрыть список объектов',buildingInfoClose:'Закрыть справку о постройке',buildingInfoClose2:'Закрыть справку о постройке',objectPreviewClose:'Закрыть сведения об объекте',objectPreviewGo:'Подойти к объекту'
      }
      ;
      for(const [id,text]of Object.entries(labels))this.$(id)?.setAttribute('aria-label',text);
      this.canvas.setAttribute('aria-describedby','movesLabel');
    }
    setBusy(on){
      this.ready=!on;
      const main=this.doc.querySelector('main');
      if(main)main.inert=on;
      for(const b of this.doc.querySelectorAll('main button'))b.disabled=on
    }
    reportError(message){
      this.$('persistentStatus').hidden=false;
      this.$('persistentStatus').textContent=message;
      this.$('storageStatus').textContent=message
    }
    clearError(){
      this.$('persistentStatus').hidden=true;
      this.$('storageStatus').textContent='Сохранение работает. Резервная копия хранится отдельно.'
    }
    toast(message){
      const node=this.$('toast');
      node.textContent=message;
      node.classList.add('show');
      this.env.clearTimeout(this.toastTimer);
      this.toastTimer=this.env.setTimeout(()=>node.classList.remove('show'),2500)
    }
    async boot(){
      if(this.loading)return;
      this.loading=true;
      const generation=++this.bootGeneration;
      this.setBusy(true);
      this.showStartup('Загрузка карты и ресурсов…',false);
      const loaded=await loadImages(this.env);
      if(generation!==this.bootGeneration)return;
      this.assets=loaded.assets;
      this.loading=false;
      const required=['assets/world-sprites.png','assets/actors-v2.png','assets/terrain-materials.png','hero.jpg','mage.jpg','necromancer.jpg','city.jpg'];
      const missing=loaded.missing.filter(n=>required.includes(n));
      if(missing.length){
        this.showStartup('Не удалось загрузить: '+missing.join(', ')+'. Проверьте, что архив полностью распакован.',true);
        return
      }
      this.initScenes();
      const saved=this.repository.load();
      if(saved.status==='error'){
        this.showStartup(saved.error,true,true);
        return
      }
      this.installEngine(saved.state||C.initialState());
      this.setBusy(false);
      this.localModal=null;
      this.syncModal();
      this.render();
      this.resize();
      this.center();
      if(saved.status==='empty'){
        const r=this.repository.save(this.engine.export());
        if(!r.ok)this.reportError(r.error)
      }
      if(saved.error)this.reportError(saved.error);
      if(loaded.missing.length)this.toast('Некоторые изображения заменены запасными значками');
      this.offlineSetup();
    }
    showStartup(message,retry,recovery=false){
      this.$('startupMessage').textContent=message;
      this.$('retryLoad').hidden=!retry;
      this.$('recoveryImport').hidden=!recovery;
      this.$('recoveryNew').hidden=!recovery;
      this.localModal='startupModal';
      this.syncModal()
    }
    installEngine(state){
      if(this.engine)this.engine.cancelTimer();
      for(const scene of [this.worldScene,this.dungeonScene])if(scene){scene.lastCapture.clear();scene.captureFx=[];scene.dungeonTrack=null;scene.lastDungeon=null;scene.lastEnemy=null;scene.enemyTrack=null}
      if(this.battleScene){this.battleScene.timeline=new Battles.BattleTimeline();this.battleScene.last=null}
      let audibleState=state;
      this.engine=new C.Engine({
        state,scheduler:{
          set:(fn,ms)=>this.env.setTimeout(fn,ms),clear:id=>this.env.clearTimeout(id)
        }
        ,onChange:()=>{
          const current=this.engine.export();
          if(current.day!==audibleState.day)this.sound(520,.09);
          else if(Object.keys(current.heroes).some(id=>current.heroes[id].x!==audibleState.heroes[id].x||current.heroes[id].y!==audibleState.heroes[id].y))this.sound(300,.03);
          this.worldScene?.observe(current,this.now());this.dungeonScene?.observe(current,this.now());
          this.battleScene?.observe(current.battle,this.now(),current.battle?current.heroes[current.battle.heroId].mana:0);
          audibleState=current;
          const result=this.repository.save(this.engine.export());
          if(!result.ok)this.reportError(result.error);
          else this.clearError();
          this.render();
          this.requestFrame()
        }
        ,onMessage:m=>this.toast(m),onEvent:event=>{
          if(event.type==='battleEnd')this.battleScene?.observe(event.battle,this.now(),event.mana);
          if(event.type==='town'){this.screen='town';this.localModal=null}
          if(event.type==='dungeonMap'){this.localModal=null;this.screen='dungeon';this.dungeonCamera.ready=false;this.centerDungeon();this.requestFrame()}
          if(event.type==='surfaceMap'){this.localModal=null;this.screen='map';this.resize();this.center()}
        }
      }
      );
      this.motion=new Controls.MotionDriver(this.engine,this.env.matchMedia?.('(prefers-reduced-motion: reduce)').matches?1:330);
      this.dungeonMotion=new Controls.DungeonMotionDriver(this.engine,this.reduceMotion?1:280);if(this.dungeonScene)this.dungeonScene.dungeonMotion=this.dungeonMotion;
      if(this.engine.s.dungeon?.inside)this.screen='dungeon';
      this.engine.resume()
    }
    unlockAudio(){
      if(!this.engine?.s.settings.sound&&!this.engine?.s.settings.music)return;
      try{
        const Audio=this.env.AudioContext||this.env.webkitAudioContext;
        if(!Audio)return;
        this.audio=this.audio||new Audio();
        if(this.audio.state==='suspended')this.audio.resume()?.then(()=>this.updateMusic()).catch(()=>{});else this.updateMusic();
      }catch(e){ /* Audio support is optional and never blocks a game command. */ }
    }
    sound(frequency,duration){
      if(!this.engine?.s.settings.sound||!this.audio||this.audio.state!=='running')return;
      try{
        const oscillator=this.audio.createOscillator(),gain=this.audio.createGain();
        oscillator.frequency.value=frequency;
        gain.gain.value=.025;
        oscillator.connect(gain);
        gain.connect(this.audio.destination);
        oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()};
        oscillator.start();
        oscillator.stop(this.audio.currentTime+duration);
      }catch(e){ /* Audio failure must not interrupt movement or persistence. */ }
    }
    musicMode(){const s=this.engine?.s;if(s?.q.siege||s?.battle?.boss)return 'siege';if(s?.battle)return 'battle';if(this.screen==='dungeon')return 'abyss';if((s?.q.threat||0)>=70)return 'danger';if(this.screen==='town')return 'city';return 'world'}
    updateMusic(){if(!this.audio)return;if(!this.music)this.music=new Music.MusicEngine(this.audio,{set:(fn,ms)=>this.env.setTimeout(fn,ms),clear:id=>this.env.clearTimeout(id)});this.music.set(this.musicMode(),!!this.engine?.s.settings.music&&!this.doc.hidden,this.engine?.s.settings.musicVolume??.32)}
    imageSource(name,fallback='hero.jpg'){
      return this.assets[name]?name:fallback;
    }
    portraitSource(name){
      const map={'hero.jpg':'hero-portrait.jpg','mage.jpg':'mage-portrait.jpg','pikeman.jpg':'pikeman-portrait.jpg','archer.jpg':'archer-portrait.jpg','cavalier.jpg':'cavalier-portrait.jpg','griffin.jpg':'griffin-portrait.jpg'};
      if(this.assets[map[name]])return map[name];
      if(this.assets[name])return name;
      return this.assets['hero-portrait.jpg']?'hero-portrait.jpg':'hero.jpg';
    }
    bind(){
      const on=(id,fn)=>{
        this.$(id).onclick=(e)=>{
          if(!this.ready&&!['retryLoad','recoveryImport','recoveryNew'].includes(id))return;
          this.unlockAudio();
          fn(e)
        }
      }
      ;
      on('retryLoad',()=>this.boot());
      on('recoveryImport',()=>this.$('saveFile').click());
      on('recoveryNew',()=>this.newGame());
      on('zoomIn',()=>{
        this.camera.zoomAt(this.camera.zoom+.15);this.saveCamera();
        this.clamp();
        this.requestFrame()
      }
      );
      on('zoomOut',()=>{
        this.camera.zoomAt(this.camera.zoom-.15);this.saveCamera();
        this.clamp();
        this.requestFrame()
      }
      );
      on('switchHero',()=>{
        if(this.engine.selectHero(this.engine.s.activeHero==='arden'?'lyra':'arden').ok){
          this.motion.reset();
          this.clearSelection();
          this.center()
        }
      }
      );
      for(const id of ['save','manualSave'])on(id,()=>{
        const r=this.repository.save(this.engine.export());
        if(r.ok){
          this.clearError();
          this.toast('Игра сохранена')
        }
        else this.reportError(r.error)
      }
      );
      on('soundToggle',()=>{this.engine.setSound(!this.engine.s.settings.sound);this.unlockAudio()});
      on('musicToggle',()=>{this.engine.setMusic(!this.engine.s.settings.music);this.unlockAudio();this.updateMusic()});
      on('dungeonLeaveMap',()=>this.engine.leaveDungeon());
      on('dungeonEndDay',()=>this.engine.nextDay());
      on('dungeonHint',()=>this.toast('Коснитесь пола или объекта для движения. Перетаскивайте карту пальцем; +/− меняют масштаб.'));
      on('dungeonZoomIn',()=>{this.dungeonCamera.zoomAt(this.dungeonCamera.zoom+.12);this.saveCamera();this.clampDungeon();this.requestFrame()});
      on('dungeonZoomOut',()=>{this.dungeonCamera.zoomAt(this.dungeonCamera.zoom-.12);this.saveCamera();this.clampDungeon();this.requestFrame()});
      on('dungeonCenter',()=>this.centerDungeon());
      if(this.dungeonCanvas){
        this.dungeonPointer=new Controls.PointerController(this.dungeonCamera,{onTap:(x,y)=>this.dungeonTap(x,y),onChange:()=>{this.dungeonCamera.target=null;this.manualPanUntil=this.now()+4000;this.saveCamera();this.requestFrame()},clamp:()=>this.clampDungeon()});
        const canvas=this.dungeonCanvas,ptr=this.dungeonPointer;
        for(const kind of ['pointerdown','pointermove','pointerup'])canvas.addEventListener(kind,e=>{if(!this.ready||this.screen!=='dungeon'||this.localModal)return;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(kind==='pointerdown'){this.unlockAudio();ptr.down(e.pointerId,x,y);canvas.setPointerCapture?.(e.pointerId)}else if(kind==='pointermove')ptr.move(e.pointerId,x,y);else{ptr.up(e.pointerId,x,y);if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId)}});
        canvas.addEventListener('pointercancel',()=>ptr.cancel());canvas.addEventListener('lostpointercapture',()=>{if(ptr.points.size)ptr.cancel()});
      }
      on('centerHero',()=>{
        this.switchScreen('map');
        this.center()
      }
      );
      on('newGame',()=>this.newGame());
      on('exportSave',()=>this.exportSave());
      on('importSave',()=>this.$('saveFile').click());
      this.$('saveFile').onchange=e=>this.importFile(e);
      on('endDay',()=>{
        if(this.dayBusy)return;
        this.dayBusy=true;
        this.motion.reset();
        this.engine.nextDay();
        this.render();
        this.env.setTimeout(()=>{
          this.dayBusy=false;
          this.render()
        }
        ,300)
      }
      );
      for(const bt of this.doc.querySelectorAll('.nav button'))bt.onclick=()=>{
        if(this.ready){this.unlockAudio();this.switchScreen(bt.dataset.s)}
      }
      ;
      on('enemyInfoClose',()=>this.closeLocal());
      on('enemyCancelBtn',()=>this.closeLocal());
      on('enemyAttackBtn',()=>{
        const id=this.briefId;
        this.closeLocal();
        this.engine.commandInteract(this.engine.s.activeHero,id)
      }
      );
      on('buildingInfoClose',()=>this.closeBuildingInfo());
      on('buildingInfoClose2',()=>this.closeBuildingInfo());
      this.$('buildingInfoModal').addEventListener('click',e=>{if(e.target===this.$('buildingInfoModal'))this.closeBuildingInfo()});
      on('objectListBtn',()=>{
        this.engine.cancelMovement();
        this.renderObjectList();
        this.localModal='objectListModal';
        this.syncModal()
      }
      );
      on('objectListClose',()=>this.closeLocal());
      on('spellBtn',()=>this.openSpells());
      on('spellCancel',()=>this.closeLocal());
      on('retreatBtn',()=>this.engine.finishBattle('retreat'));
      on('victoryClose',()=>this.engine.closeVictory());
      // Handlers capture the rendered turn token; stale click events cannot consume the next turn.
      for(const [id,type]of [['waitBtn','wait'],['defBtn','defend']])this.$(id).dataset.action=type;
      this.canvas.addEventListener('pointerdown',e=>{
        if(!this.ready||!this.engine.idle()||this.localModal)return;
        this.unlockAudio();
        const p=this.pointerPosition(e);
        this.pointer.down(e.pointerId,p.x,p.y);
        this.canvas.setPointerCapture(e.pointerId)
      }
      );
      this.canvas.addEventListener('pointermove',e=>{
        const p=this.pointerPosition(e);
        this.pointer.move(e.pointerId,p.x,p.y)
      }
      );
      this.canvas.addEventListener('pointerup',e=>{
        const p=this.pointerPosition(e);
        this.pointer.up(e.pointerId,p.x,p.y);
        if(this.canvas.hasPointerCapture?.(e.pointerId))this.canvas.releasePointerCapture(e.pointerId)
      }
      );
      this.canvas.addEventListener('pointercancel',()=>this.pointer.cancel());
      this.doc.addEventListener('dblclick',e=>{if(e.target.closest?.('.app'))e.preventDefault()},{passive:false});
      this.canvas.addEventListener('lostpointercapture',()=>{
        if(this.pointer.points.size)this.pointer.cancel()
      }
      );
      this.canvas.addEventListener('keydown',e=>{
        if(!this.ready)return;
        const d={
          ArrowLeft:[-100,0],ArrowRight:[100,0],ArrowUp:[0,-100],ArrowDown:[0,100]
        }
        [e.key];
        if(d){
          e.preventDefault();
          this.camera.x+=d[0];
          this.camera.y+=d[1];
          this.clamp();
          this.requestFrame()
        }
        if(e.key==='Enter'){
          e.preventDefault();
          this.$('objectListBtn').click()
        }
      }
      );
      this.env.addEventListener('resize',()=>this.resize());
      this.doc.addEventListener('visibilitychange',()=>{
        this.motion?.reset();if(this.dungeonMotion)this.dungeonMotion.step=null;this.pointer.cancel();this.dungeonPointer?.cancel();this.battlePointer?.cancel();
        if(this.doc.hidden){if(this.frameId!==null)this.env.cancelAnimationFrame?.(this.frameId);this.frameId=null;this.music?.stop();this.audio?.suspend?.().catch(()=>{});}
        else{this.audio?.resume?.().then(()=>this.updateMusic()).catch(()=>{});this.dungeonScene?.observe(this.engine.s,this.now());this.requestFrame()}
      });
      this.doc.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
      this.doc.addEventListener('gesturechange',e=>e.preventDefault(),{passive:false});
      if(this.$('musicVolume'))this.$('musicVolume').oninput=e=>{this.engine.setMusicVolume(Number(e.target.value));this.updateMusic()};
      this.doc.addEventListener('keydown',e=>this.modalKey(e));
    }
    pointerPosition(e){
      const r=this.canvas.getBoundingClientRect();
      return {
        x:e.clientX-r.left,y:e.clientY-r.top
      }
    }
    closeLocal(){
      this.localModal=null;
      this.clearSelection();
      this.syncModal()
    }
    clearSelection(){
      this.selection=null;
      this.env.clearTimeout(this.selectionTimer);
      this.$('objectInfo').classList.add('hidden')
    }
    switchScreen(name){
      if(!this.ready)return;
      if(name==='map'&&this.engine.s.dungeon?.inside)name='dungeon';
      if(this.engine.s.movement){
        this.engine.cancelMovement();
        this.motion.reset()
      }
      this.clearSelection();
      this.screen=name;
      this.camera.target=null;this.dungeonCamera.target=null;
      if(name!=='dungeon')this.dungeonMotion?.reset();
      if(name==='town')this.engine.visitTown();
      this.render();
      if(name==='map')this.resize()
    }
    render(){
      if(!this.engine)return;
      this.$('threatHud').hidden=!['map','dungeon'].includes(this.screen);
      const s=this.engine.s,h=s.heroes[s.activeHero];
      for(const k of ['gold','wood','ore','gems','crystal','day','week','month'])this.$(k).textContent=s[k];
      this.$('hudName').textContent=h.name;
      this.$('hudPortrait').src=h.img;
      this.$('hudPortrait').alt=h.name;
      this.$('lvlm').textContent=h.level;
      this.$('pow').textContent=Object.values(h.army).reduce((a,b)=>a+b,0);
      this.$('movesLabel').textContent='Движение '+h.moves+'/'+h.maxMoves;
      const route=s.movement?.heroId===h.id?s.movement:null;
      if(route)this.$('movesLabel').textContent+=' · путь '+route.path.length;
      this.$('movesLabel').title=route?'Зелёный путь доступен сегодня, серый — сверх запаса движения. Следующий день сбросит маршрут.':'';
      this.$('mvbar').style.width=h.moves/h.maxMoves*100+'%';
      for(const sc of this.doc.querySelectorAll('.screen'))sc.classList.toggle('active',sc.id==='s-'+this.screen);
      for(const bt of this.doc.querySelectorAll('.nav button')){
        bt.classList.toggle('active',bt.dataset.s===this.screen);
        bt.setAttribute('aria-current',bt.dataset.s===this.screen?'page':'false')
      }
      this.$('endDay').disabled=!this.engine.idle()||this.dayBusy;
      this.$('switchHero').disabled=!this.engine.idle();
      if(this.screen==='dungeon')this.renderDungeonMap();
      if(this.screen==='hero')this.renderHero();
      if(this.screen==='town')this.renderTown();
      if(this.screen==='magic')this.renderMagic();
      if(this.screen==='quests')this.renderQuests();
      if(this.screen==='settings'){if(this.$('musicVolume'))this.$('musicVolume').value=s.settings.musicVolume;this.$('soundToggle').textContent='Звуки: '+(s.settings.sound?'вкл':'выкл');this.$('musicToggle').textContent='Музыка: '+(s.settings.music?'вкл':'выкл')}
      this.$('threatValue').textContent=(s.q.threat||0)+'%';this.$('siegeState').innerHTML=s.q.siege?'<span class="siege">⚠ ОСАДА</span>':'';this.$('threatHud').classList.toggle('threatHigh',(s.q.threat||0)>=70);this.updateMusic();
      if(s.battle)this.renderBattle();
      else this.battleVisual=null;
      if(!s.battle&&s.levelChoices.length)this.renderLevel();
      this.syncModal();
      this.requestFrame();
    }
    renderHero(){
      const s=this.engine.s,h=s.heroes[s.activeHero];
      this.$('heroSelect').innerHTML=Object.values(s.heroes).map(x=>'<button class="btn heroBtn '+(x===h?'active':'')+'" data-hero="'+x.id+'"><img src="'+this.portraitSource(x.img)+'" alt=""><span><b>'+x.name+'</b><small>Ур. '+x.level+'</small></span></button>').join('');
      for(const bt of this.$('heroSelect').querySelectorAll('[data-hero]'))bt.onclick=()=>{
        if(this.engine.selectHero(bt.dataset.hero).ok){
          this.switchScreen('map');
          this.center()
        }
      }
      ;
      this.$('heroPortrait').src=this.portraitSource(h.img);
      this.$('heroPortrait').alt=h.name;
      this.$('heroName').textContent=h.name;
      this.$('heroClass').textContent=h.cls;
      for(const k of ['atk','def','magic','knowledge','level','xp'])this.$(k).textContent=h[k]; const xpNext=h.level*100; const xn=this.$('xpNext'),xb=this.$('xpBar'); if(xn)xn.textContent=xpNext; if(xb)xb.style.width=Math.max(0,Math.min(100,h.xp/xpNext*100))+'%';
      this.$('army').innerHTML=Object.entries(D.units).map(([k,u])=>{const lv=s.troopLevels[k]||1,tr=D.battleTraits?.[k],extra=tr?.levelTraits?.[lv]||tr?.levelTraits?.[lv>=5?5:lv>=3?3:0]||tr?.traitText||'';return '<div class="unitcard"><img src="'+this.portraitSource(u.img)+'" alt=""><div class="txt"><b>'+u.n+'</b><span class="unitQty">'+h.army[k]+'</span><span class="small">Уровень '+lv+'</span><span class="unitAbility">'+extra+'</span></div></div>'}).join('');
      this.$('skills').innerHTML=Object.entries(h.skills).filter(([,r])=>r>0).map(([k,r])=>'<div class="skill"><b>'+D.skills[k].name+' · ранг '+r+'</b><div class="small">'+D.skills[k].description+'</div></div>').join('')||'<div class="small">Навыки появятся при повышении уровня.</div>';
      this.$('artifacts').innerHTML=h.artifacts.map(k=>'<div class="quest">'+D.artifactDefs[k].icon+' '+D.artifactDefs[k].n+'</div>').join('')||'<div class="small">Артефактов пока нет.</div>';
      const a=s.heroes.arden,b=s.heroes.lyra,can=C.distance(a,b)<=1;
      this.$('transferPanel').innerHTML='<div class="row"><b>Иван ⇄ Варвара</b><span class="small">'+(can?'Передача доступна':'Герои должны стоять рядом')+'</span></div>'+Object.keys(D.units).map(k=>'<div class="transferRow"><span>'+D.units[k].n+': '+a.army[k]+' / '+b.army[k]+'</span><button class="miniBtn" data-transfer="'+k+':arden" '+(!can||!a.army[k]?'disabled':'')+' aria-label="Передать '+D.units[k].n+' Варваре">→</button><button class="miniBtn" data-transfer="'+k+':lyra" '+(!can||!b.army[k]?'disabled':'')+' aria-label="Передать '+D.units[k].n+' Ивану">←</button></div>').join('');
      for(const bt of this.$('transferPanel').querySelectorAll('[data-transfer]'))bt.onclick=()=>{
        const [k,from]=bt.dataset.transfer.split(':');
        this.engine.transfer(from,from==='arden'?'lyra':'arden',k)
      }
      ;
    }
    openBuildingInfo(id){
      const d=D.builds[id],s=this.engine.s;if(!d)return;
      const req=d.req?'Требование: '+D.builds[d.req].n+'. ':'Без предварительных построек. ';
      let extra='';
      if(id==='citadel')extra='<p><b>Эффект:</b> армия героя получает +25% эффективной защиты в боях рядом со Стальным Холмом. Также Цитадель открывает IV и V уровни улучшений войск.</p>';
      if(id==='training')extra='<p><b>Развитие:</b> копейщики, стрелки, рыцари и грифоны улучшаются с I до V уровня. Каждый новый уровень даёт +10% базового урона.</p>';
      if(id==='arcaneTower')extra='<p><b>Развитие:</b> маги улучшаются с I до V уровня. Каждый новый уровень даёт +12% базового урона магов.</p>';
      this.$('buildingInfoName').textContent=d.n;
      this.$('buildingInfoBody').innerHTML='<p>'+escape(d.desc||'Городская постройка.')+'</p><p>'+escape(req)+'</p><p><b>Стоимость:</b> '+d.cost[0]+'🪙 '+d.cost[1]+'🪵 '+d.cost[2]+'🪨</p><p><b>Статус:</b> '+(s.build[id]?'Построено':'Не построено')+'</p>'+extra;
      this.localModal='buildingInfoModal';
      this.syncModal();
    }
    closeBuildingInfo(){
      if(this.localModal==='buildingInfoModal')this.localModal=null;
      this.syncModal();
    }
    renderTown(){
      const s=this.engine.s,h=s.heroes[s.activeHero],local=C.atTown(s,h.id),inc=C.income(s);
      this.$('econGrid').innerHTML=Object.entries(inc).map(([k,n])=>'<div class="econCard">'+({
        gold:'🪙',wood:'🪵',ore:'🪨',gems:'💎'
      }
      )[k]+'<b>'+n+'</b><span class="small">/день</span></div>').join('');
      this.$('econHint').textContent=(s.build.market?'Рынок: +100 золота в день. ':'Рынок даёт +100 золота в день. ')+'Найм всегда пополняет армию выбранного героя: '+h.name+'.';
      const garAny=Object.keys(D.units).some(k=>s.garrison[k]>0),heroAny=Object.keys(D.units).some(k=>h.army[k]>0);
      this.$('garrison').innerHTML='<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-garrison-all="out" '+(!local||!garAny?'disabled':'')+'>Всех → герой</button><button class="btn" data-garrison-all="in" '+(!local||!heroAny?'disabled':'')+'>Всех → гарнизон</button></div>'+Object.keys(D.units).map(k=>'<div class="garrisonRow"><span>'+D.units[k].n+': <b>'+s.garrison[k]+'</b></span><button class="miniBtn" data-garrison="'+k+':in" '+(!local||!h.army[k]?'disabled':'')+' aria-label="В гарнизон: '+D.units[k].n+'">+1</button><button class="miniBtn" data-garrison="'+k+':out" '+(!local||!s.garrison[k]?'disabled':'')+' aria-label="Забрать из гарнизона: '+D.units[k].n+'">−1</button></div>').join('');
      for(const bt of this.$('garrison').querySelectorAll('[data-garrison]'))bt.onclick=()=>{
        const [k,d]=bt.dataset.garrison.split(':');
        this.engine.garrison(h.id,k,d)
      };
      for(const bt of this.$('garrison').querySelectorAll('[data-garrison-all]'))bt.onclick=()=>this.engine.garrisonAll(h.id,bt.dataset.garrisonAll);
      this.$('buildings').innerHTML=Object.entries(D.builds).map(([k,d])=>{
        const reason=s.build[k]?'Построено':d.req&&!s.build[d.req]?'Нужно: '+D.builds[d.req].n:s.gold<d.cost[0]||s.wood<d.cost[1]||s.ore<d.cost[2]?'Не хватает ресурсов':'';
        return '<div class="buildingWrap"><button class="btn building '+(s.build[k]?'built':'')+'" data-build="'+k+'" '+(reason?'disabled':'')+'><b>'+d.n+'</b><br><span class="small">'+(reason||d.cost[0]+'🪙 '+d.cost[1]+'🪵 '+d.cost[2]+'🪨')+'</span></button><button class="helpBtn" data-build-help="'+k+'" aria-label="Справка: '+d.n+'">?</button></div>'
      }).join('');
      for(const bt of this.$('buildings').querySelectorAll('[data-build]'))bt.onclick=()=>this.engine.build(bt.dataset.build);
      for(const bt of this.$('buildings').querySelectorAll('[data-build-help]'))bt.onclick=e=>{e.stopPropagation();this.openBuildingInfo(bt.dataset.buildHelp)};
      this.$('upgrades').innerHTML=Object.entries(D.units).map(([k,u])=>{
        const level=s.troopLevels[k]||1,max=D.troopUpgrades.maxLevel,magic=D.troopUpgrades.magic.includes(k),building=magic?'arcaneTower':'training';
        let reason='';let costText='Максимальный уровень';
        if(level<max){const c=D.troopUpgrades.costs[k][level-1];costText=c[0]+'🪙 '+c[1]+'🪵 '+c[2]+'🪨'+(c[3]?' '+c[3]+'💎':'');reason=!s.build[building]?'Нужно: '+D.builds[building].n:level>=3&&!s.build.citadel?'Нужна Цитадель':s.gold<c[0]||s.wood<c[1]||s.ore<c[2]||s.gems<c[3]?'Не хватает ресурсов':''}
        const bonus=Math.round((level-1)*(D.troopUpgrades.damagePerLevel[k]||0)*100);
        return '<button class="btn upgradeCard" data-upgrade="'+k+'" '+(level>=max||reason?'disabled':'')+'><img src="'+this.portraitSource(u.img)+'" alt=""><span class="troopCardBody"><span class="troopCardTitle">'+u.n+'</span><span class="troopCardLevel">Уровень '+level+'/'+max+'</span><span class="troopCardMeta">Урон +'+bonus+'%</span><span class="troopCardMeta troopCardCost">'+(reason||costText)+'</span></span></button>'
      }).join('');
      for(const bt of this.$('upgrades').querySelectorAll('[data-upgrade]'))bt.onclick=()=>this.engine.upgradeTroop(bt.dataset.upgrade);
      this.$('recruits').innerHTML=Object.entries(D.units).map(([k,u])=>{
        const reason=!s.build[u.req]?'Нужно: '+D.builds[u.req].n:s.avail[k]<u.qty?'Мало доступных воинов':s.gold<u.cost?'Не хватает золота':'';
        return '<button class="btn recruitCard" data-recruit="'+k+'" '+(reason?'disabled':'')+'><img src="'+this.portraitSource(u.img)+'" alt=""><span class="troopCardBody"><span class="troopCardTitle">'+u.n+'</span><span class="troopCardMeta">'+(reason||'Доступно: '+s.avail[k])+'</span><span class="troopCardMeta troopCardCost">'+(reason?'':'Найм: '+u.qty+' · '+u.cost+' 🪙')+'</span></span></button>'
      }
      ).join('');
      for(const bt of this.$('recruits').querySelectorAll('[data-recruit]'))bt.onclick=()=>this.engine.recruit(bt.dataset.recruit);
    }
    renderMagic(){
      const h=this.engine.s.heroes[this.engine.s.activeHero];
      this.$('mana').textContent=h.mana;
      this.$('manaMax').textContent=h.manaMax;
      this.$('spells').innerHTML='<div class="quest"><b>🔥 Огненный шар</b><div class="small">4 маны · 30 + 14 × Магия урона</div></div><div class="quest"><b>⚡ Молния</b><div class="small">6 маны · 48 + 18 × Магия урона</div></div><div class="quest"><b>🛡️ Каменная кожа</b><div class="small">4 маны · −28% урона, включая контратаки, до конца боя</div></div><div class="quest"><b>💚 Исцеление</b><div class="small">5 маны · 22 + 10 × Магия HP выжившим; не воскрешает</div></div>'
    }
    renderQuests(){
      const s=this.engine.s;
      this.$('worldStats').textContent='Исследовано '+s.seen.length+'/'+(D.W*D.H)+' клеток · Непосещённых объектов: '+C.allObjects(s).filter(o=>o.t!=='castle'&&o.owner!=='player').length+' · Репутация: '+s.reputation+' · ☠ Угроза: '+(s.q.threat||0)+'%';
      this.$('storyProgress').innerHTML=['ivan','varvara','world'].map(k=>'<div class="storyCard"><b>'+({
        ivan:'Иван — Наследие Стального Холма',varvara:'Варвара — Тайна Пепельной магии',world:'Мировые события'
      }
      )[k]+'</b><div class="small">Этап '+s.story[k]+'/2</div></div>').join('');
      this.$('quests').innerHTML=[['Сделать первый ход героем',s.q.tutorialMove],['Открыть экран города',s.q.tutorialTown],['Захватить лесопилку',s.q.wood],['Захватить железную шахту',s.q.ore],['Захватить шахту самоцветов',s.q.gems],['Использовать Алтарь магии',s.q.altar],['Активировать сторожевую башню',s.q.obelisk],['Завершить цепочку Ивана',s.story.ivan>=2],['Завершить цепочку Варвары',s.story.varvara>=2],['Помочь 2 поселениям',s.q.villages>=2],['Исследовать 2 руины',s.q.ruins>=2],['Найти 2 артефакта',s.q.artifacts>=2],['Исследовать Пещеру Бездны',s.q.dungeonLevel>=1],['Победить Хранителя Бездны',s.q.dungeonCleared],[(!s.enemy.alive?'Угроза осады Стального Холма устранена':'Отбить осаду Стального Холма'),s.q.siegeWins>=1||s.q.siegeResolved],['Победить гарнизон Морвейна в Некрополе',s.q.boss]].map(([text,done])=>'<div class="quest '+(done?'done':'')+'">'+(done?'✅ ':'⬜ ')+text+'</div>').join('');
      this.$('log').innerHTML=s.logs.map(t=>'<div>'+escape(t)+'</div>').join('')
    }
    dungeonZoneName(x,y){const z=D.dungeon.zones.find(z=>x>=z.x1&&x<=z.x2&&y>=z.y1&&y<=z.y2);return z?.name||'Глубинные переходы'}
    renderDungeonMap(t=0){if(!this.dungeonScene||!this.engine.s.dungeon.inside)return;if(!this.dungeonCamera.ready)this.centerDungeon();this.dungeonScene.draw(this.engine.s,this.motion,this.selection,t);const d=this.engine.s.dungeon,h=this.engine.s.heroes[d.inside];this.$('dungeonZone').textContent=this.dungeonZoneName(d.x,d.y);this.$('dungeonHud').textContent=h.name+' · движение '+h.moves+'/'+h.maxMoves;}
    dungeonTap(sx,sy){if(!this.dungeonScene||!this.engine.idle())return;const hit=this.dungeonScene.hit(sx,sy),cell=this.dungeonScene.cellAt(sx,sy),d=this.engine.s.dungeon;if(!d.seen.includes(cell.x+','+cell.y)&&!hit)return;const object=hit?this.engine.dungeonObject(hit):null;const result=object?this.dungeonMotion.command(object.x,object.y,hit):this.dungeonMotion.command(cell.x,cell.y);if(!result.ok)this.toast(result.reason||'Путь закрыт');this.requestFrame()}
    renderBattle(){
      const b=this.engine.s.battle||this.battleScene?.timeline.snapshot;if(!b)return;const a=C.selectedStack(b),player=!!this.engine.s.battle&&b.phase==='player'&&!this.battleScene?.timeline.busy(this.now());
      this.$('battleName').textContent=b.name;
      const battleModal=this.$('battleModal');
      if(battleModal)battleModal.dataset.env=(b.source?.kind==='dungeon'?'dungeon':'surface');
      this.$('battleRound').textContent='Раунд '+b.round;
      this.$('battleHint').textContent=player?'Выберите доступную клетку или цель. ':b.phase==='enemy'?'Ход противника…':'Действие выполняется…';
      const h=this.engine.s.heroes[b.heroId];
      this.$('battleStatus').textContent='Мана '+h.mana+'/'+h.manaMax+' · '+(a?C.stackDef(a).n+' · Инициатива '+(C.stackDef(a).init??C.stackDef(a).spd):'Завершение хода');
      this.$('turnbar').innerHTML=b.order.map(id=>b.stacks.find(st=>st.id===id&&st.hp>0)).filter(Boolean).map(st=>'<div class="turnchip '+(st.id===b.selectedId?'active':'')+'" title="'+escape(C.stackDef(st).traitText||'')+'">'+(st.side==='p'?'🟦 ':'🟥 ')+C.stackDef(st).n+' · ⚡'+(C.stackDef(st).init??C.stackDef(st).spd)+'</div>').join('');
      const board=this.$('bgrid');
      board.innerHTML='';
      const battleId=b.id,turnId=b.turnId;
      for(let y=0;
      y<5;
      y++)for(let x=0;
      x<8;
      x++){
        const occ=C.stackAt(b,x,y),cell=this.doc.createElement('button');
        cell.className='cell';
        const canAttack=player&&occ&&occ.side!=='p'&&C.distance(a,occ)<=C.stackDef(a).range;
        const canMove=player&&!occ&&!!C.tacticalPath(b,a,x,y);
        cell.disabled=!canAttack&&!canMove;
        if(canAttack){cell.classList.add('attack');cell.classList.add(C.distance(a,occ)>1?'rangedAttack':'meleeAttack');}
        if(canMove)cell.classList.add('move');
        if(occ?.id===b.selectedId)cell.classList.add('sel');
        cell.setAttribute('aria-label','Клетка '+(x+1)+','+(y+1)+(occ?': '+C.stackDef(occ).n+', '+occ.qty+', '+occ.hp+' HP'+(occ.side==='p'?', союзники':', противник'):canMove?', переместиться':', недоступна'));
        cell.textContent=occ?C.stackDef(occ).n+' ×'+occ.qty:'Клетка '+(x+1)+','+(y+1);
        cell.onclick=()=>this.engine.battleAction(canAttack?{
          type:'attack',targetId:occ.id
        }
        :{
          type:'move',x,y
        }
        ,battleId,turnId);
        board.appendChild(cell)
      }
      for(const [id,type]of [['waitBtn','wait'],['defBtn','defend']]){
        this.$(id).disabled=!player;
        this.$(id).onclick=()=>this.engine.battleAction({
          type
        }
        ,battleId,turnId)
      }
      this.$('battleHint').textContent=player&&a?(C.stackDef(a).traitText||'Выберите доступную клетку или цель.'):(b.phase==='enemy'?'Ход противника…':'Действие выполняется…');
      this.$('spellBtn').disabled=!player;
      this.$('retreatBtn').disabled=b.phase==='resolving';
      this.$('retreatBtn').onclick=()=>{
        if(this.engine.s.battle?.id===battleId)this.engine.finishBattle('retreat')
      }
      this.battleScene?.draw(b,this.now());
      ;
    }
    renderLevel(){
      const c=this.engine.s.levelChoices[0],h=this.engine.s.heroes[c.heroId],box=this.$('levelChoices');
      this.$('levelModal').querySelector('.small').textContent=h.name+' · уровень '+c.level+'. Выберите навык.';
      box.innerHTML='';
      for(const skill of c.options){
        const bt=this.doc.createElement('button');
        bt.className='btn';
        bt.innerHTML=skill==='training'?'<b>Военное мастерство</b><br>+1 Атака':'<b>'+D.skills[skill].name+' · ранг '+((h.skills[skill]||0)+1)+'</b><br><span class="small">'+D.skills[skill].description+'</span>';
        bt.onclick=()=>this.engine.chooseSkill(c.id,skill);
        box.appendChild(bt)
      }
    }
    openSpells(){
      const b=this.engine.s.battle;
      if(b?.phase!=='player')return;
      const box=this.$('spellChoices');
      box.innerHTML='';
      const battleId=b.id,turnId=b.turnId;
      for(const [kind,name]of [['fire','🔥 Огненный шар'],['lightning','⚡ Молния'],['stone','🛡️ Каменная кожа'],['heal','💚 Исцеление']]){
        const info=this.engine.spellInfo(kind),bt=this.doc.createElement('button');
        bt.className='btn blue';
        bt.disabled=!info.ok;
        bt.innerHTML='<b>'+name+'</b><br><span class="small">'+(info.ok?info.cost+' маны · цель: '+C.stackDef(info.target).n+' ('+info.target.qty+')':escape(info.reason))+'</span>';
        bt.onclick=()=>{
          const r=this.engine.battleAction({
            type:'spell',spell:kind,targetId:info.target?.id
          }
          ,battleId,turnId);
          if(r.ok)this.closeLocal()
        }
        ;
        box.appendChild(bt)
      }
      this.localModal='spellModal';
      this.syncModal()
    }

    objectDescription(o){
      if(o.t==='sawmill')return 'Источник древесины. После захвата приносит ресурсы каждый день.';
      if(o.t==='mine')return o.kind==='gems'?'Шахта самоцветов. После захвата приносит самоцветы каждый день.':'Рудник. После захвата приносит руду каждый день.';
      if(o.t==='chest')return 'Сундук может содержать золото, знания или редкий артефакт.';
      if(o.t==='portal')return 'Магический портал перемещает героя в другую область карты.';
      if(o.t==='castle')return 'Стальной Холм: строительство, найм, гарнизон и развитие армии.';
      if(o.t==='enemy')return 'Вражеский отряд охраняет территорию и награду.';
      return 'Разведанный объект мира.'
    }
    openObjectPreview(id){
      const s=this.engine.s,o=C.worldObject(s,id); if(!o||!C.isSeen(s,o))return;
      if(o.t==='enemy'){this.openEnemy(id);return}
      this.previewId=id; this.engine.cancelMovement();
      this.$('objectPreviewName').textContent=label(o);
      this.$('objectPreviewImg').src=this.imageSource(o.img,'chest.jpg');
      this.$('objectPreviewImg').alt=label(o);
      this.$('objectPreviewType').textContent=o.owner==='player'?'Ваш объект':'Разведано';
      this.$('objectPreviewDesc').textContent=this.objectDescription(o);
      const path=C.pathToInteract(s,s.activeHero,id);
      this.$('objectPreviewReward').textContent=path?'Расстояние до взаимодействия: '+path.length+' клеток.':'Подход к объекту сейчас недоступен.';
      this.$('objectPreviewGo').disabled=!path;
      this.$('objectPreviewGo').onclick=()=>{const pid=this.previewId;this.closeLocal(); if(pid){const oo=C.worldObject(this.engine.s,pid),r=this.engine.commandInteract(this.engine.s.activeHero,pid);if(r.ok&&oo?.t==='castle'&&C.atTown(this.engine.s,this.engine.s.activeHero))this.switchScreen('town')}};
      this.localModal='objectPreviewModal';this.syncModal();
    }
    openEnemy(id){
      const s=this.engine.s,o=C.worldObject(s,id);
      if(!o||!C.isSeen(s,o))return;
      this.engine.cancelMovement();
      this.briefId=id;
      this.$('enemyInfoName').textContent=label(o);
      this.$('enemyInfoImg').src=this.imageSource(o.img,'necromancer.jpg');
      this.$('enemyInfoImg').alt=label(o);
      const power=o.stacks.reduce((n,[t,q])=>n+D.enemies[t].p*q,0)/Math.max(1,C.heroPower(s.heroes[s.activeHero]));
      this.$('enemyInfoDanger').textContent='Примерная опасность: '+(power<.55?'низкая':power<.9?'средняя':power<1.25?'высокая':'смертельная');
      const path=C.pathToInteract(s,s.activeHero,id);
      this.$('enemyInfoDesc').textContent=path?'Охрана преграждает путь. Подход: '+path.length+' клеток. Оценка опасности не учитывает все тактические обстоятельства.':'Подход закрыт водой, горами или другой охраной.';
      this.$('enemyInfoStacks').innerHTML=o.stacks.map(([t,q])=>'<div class="row"><span>'+D.enemies[t].n+'</span><b>'+q+'</b></div>').join('');
      this.$('enemyInfoReward').textContent=o.reward+' золота · '+o.xp+' опыта';
      this.$('enemyAttackBtn').disabled=!path;
      this.localModal='enemyModal';
      this.syncModal()
    }
    renderObjectList(){
      const s=this.engine.s,box=this.$('knownObjects'),h=s.heroes[s.activeHero];
      box.innerHTML='';
      for(const o of this.entities().filter(o=>C.isSeen(s,o)).sort((a,b)=>C.distance(h,a)-C.distance(h,b))){
        const b=this.doc.createElement('button');
        b.className='btn';
        b.textContent=label(o)+' · '+C.distance(h,o)+' клеток'+(o.owner==='player'?' · ваш объект':'');
        b.onclick=()=>{
          this.closeLocal();
          this.openObjectPreview(o.id)
        }
        ;
        box.appendChild(b)
      }
    }
    mapTap(sx,sy){
      if(!this.ready||!this.engine.idle()||this.localModal||!this.worldScene)return;
      const s=this.engine.s,id=this.worldScene.hit(sx,sy),cell=this.worldScene.cellAt(sx,sy);
      if(id){const o=C.worldObject(s,id);if(!o||!C.isSeen(s,o))return;if(this.selection!==id){this.selection=id;this.$('objectInfo').textContent=label(o)+' · нажмите ещё раз для подхода';this.$('objectInfo').classList.remove('hidden');this.requestFrame();return}this.clearSelection();if(o.t==='enemy')this.openEnemy(id);else this.engine.commandInteract(s.activeHero,id)}else{this.clearSelection();this.engine.commandMove(s.activeHero,cell.x,cell.y)}this.requestFrame()
    }
    entities(){
      const s=this.engine.s;
      return [...C.allObjects(s),...(s.enemy.alive?[C.worldObject(s,s.enemy.id)]:[])]
    }
    objectPosition(o){return this.worldScene?this.worldScene.projection.cell(o.x,o.y):{x:o.x*100+50,y:o.y*100+50}}
    syncModal(){
      const s=this.engine?.s;
      let active=this.localModal;
      if(!active&&s){
        if(s.battle||this.battleScene?.timeline.holdUntil>this.now())active='battleModal';
        else if(s.levelChoices.length)active='levelModal';
        else if(s.victoryPending)active='victoryModal'
      }
      if(!this.ready&&!active)active='startupModal';
      for(const m of this.doc.querySelectorAll('.modal')){
        const visible=m.id===active;
        m.classList.toggle('hidden',!visible);
        m.setAttribute('aria-hidden',String(!visible));
        m.inert=!visible
      }
      const main=this.doc.querySelector('main');
      if(main)main.inert=!!active||!this.ready;
      if(this.lastModal!==active){
        if(active){
          if(!this.lastModal)this.previousFocus=this.doc.activeElement;
          const modal=this.$(active),target=modal.querySelector('button:not([disabled]):not([hidden])')||modal.querySelector('.dialog');
          target?.focus()
        }
        else if(this.previousFocus?.isConnected)this.previousFocus.focus();
        this.lastModal=active
      }
    }
    modalKey(e){
      if(!this.lastModal)return;
      if(e.key==='Escape'&&this.localModal&&this.localModal!=='startupModal'){
        e.preventDefault();
        this.closeLocal();
        return
      }
      if(e.key!=='Tab')return;
      const nodes=[...this.$(this.lastModal).querySelectorAll('button:not([disabled]):not([hidden]),[tabindex="0"]')];
      if(!nodes.length){
        e.preventDefault();
        this.$(this.lastModal).querySelector('.dialog')?.focus();
        return
      }
      const i=nodes.indexOf(this.doc.activeElement);
      if(e.shiftKey&&(i<=0)){
        e.preventDefault();
        nodes[nodes.length-1].focus()
      }
      else if(!e.shiftKey&&(i===-1||i===nodes.length-1)){
        e.preventDefault();
        nodes[0].focus()
      }
    }
    now(){return this.env.performance?.now?.()??performance.now()}
    saveCamera(){try{if(!this.env.ASH_QA)this.env.localStorage.setItem('ash-camera-920',JSON.stringify({surface:this.camera.zoom,dungeon:this.dungeonCamera.zoom}))}catch(e){}}
    initScenes(){
      this.worldScene=new Scenes.WorldScene({canvas:this.canvas,doc:this.doc,assets:this.assets});
      this.dungeonScene=new Scenes.WorldScene({canvas:this.dungeonCanvas,doc:this.doc,assets:this.assets,dungeon:true});
      for(const [scene,cam]of [[this.worldScene,this.camera],[this.dungeonScene,this.dungeonCamera]]){cam.worldWidth=scene.projection.worldWidth;cam.worldHeight=scene.projection.worldHeight;scene.camera=cam;scene.resize()}
      try{const debug=new URLSearchParams(this.env.location.search||'').get('debug-nav')==='1';this.worldScene.debug=debug;this.dungeonScene.debug=debug}catch(e){}
      this.battleScene=new Battles.BattleScene(this.$('battleCanvas'),this.doc,this.assets);
      const bc=this.$('battleCanvas');this.battlePointer=new Controls.PointerController({x:0,y:0,zoom:1},{onTap:(x,y)=>{const hit=this.battleScene.hit(x,y);if(hit&&!this.battleScene.timeline.busy(this.now()))this.engine.battleAction(hit.action,hit.battleId,hit.turnId)}});
      for(const [event,method]of [['pointerdown','down'],['pointermove','move'],['pointerup','up']])bc.addEventListener(event,e=>{e.preventDefault();const r=bc.getBoundingClientRect();if(event==='pointerdown')bc.setPointerCapture?.(e.pointerId);this.battlePointer[method](e.pointerId,e.clientX-r.left,e.clientY-r.top)});
      for(const event of ['pointercancel','lostpointercapture'])bc.addEventListener(event,()=>this.battlePointer.cancel());
    }
    requestFrame(){
      if(this.frameId!==null||this.doc.hidden)return;
      this.frameId=this.env.requestAnimationFrame(t=>{
        this.frameId=null;if(!this.ready||!this.engine||this.doc.hidden)return;
        const moving=this.motion.frame(t),dungeonMoving=this.dungeonMotion?.frame(t);
        if(moving&&t>this.manualPanUntil&&!this.pointer.points.size&&this.worldScene){const q=this.motion.position(this.engine.s.activeHero);this.camera.animateTo(this.worldScene.projection.project(q.x,q.y))}
        if(this.screen==='map')this.drawMap(t);
        if(dungeonMoving&&t>this.manualPanUntil&&!this.dungeonPointer.points.size){const q=this.dungeonMotion.position();this.dungeonCamera.animateTo(this.dungeonScene.projection.project(q.x,q.y))}
        if(this.screen==='dungeon')this.renderDungeonMap(t);
        const wasBusy=this.battleWasBusy,busy=this.battleScene?.timeline.busy(t);if(this.engine.s.battle||busy)this.battleScene?.draw(this.engine.s.battle,t);if(wasBusy&&!busy){if(this.engine.s.battle)this.renderBattle();this.syncModal()}this.battleWasBusy=busy;
        if(moving||dungeonMoving||busy||this.camera.target||this.dungeonCamera.target||(!this.reduceMotion&&['map','dungeon'].includes(this.screen)))this.requestFrame();
      });
    }
    resize(){this.worldScene?.resize();this.dungeonScene?.resize();this.requestFrame()}
    clamp(){this.camera.clamp()}
    clampDungeon(){this.dungeonCamera.clamp()}
    centerDungeon(){if(!this.engine||!this.dungeonScene)return;const d=this.engine.s.dungeon;this.dungeonScene.resize();this.dungeonCamera.centerOn(this.dungeonScene.projection.cell(d.x,d.y));this.requestFrame()}
    center(){if(!this.engine||!this.worldScene)return;const h=this.engine.s.heroes[this.engine.s.activeHero];this.worldScene.resize();this.camera.centerOn(this.worldScene.projection.cell(h.x,h.y));this.requestFrame()}
    image(ctx,name,x,y,w,h){
      const image=this.assets[name];
      if(image)ctx.drawImage(image,x,y,w,h);
      else{
        ctx.fillStyle='#283b2b';
        ctx.fillRect(x,y,w,h);
        ctx.fillStyle='#ddb45c';
        ctx.font='22px sans-serif';
        ctx.fillText('◆',x+w/2-9,y+h/2+8)
      }
    }
    round(ctx,x,y,w,h,r){
      ctx.beginPath();
      if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);
      else ctx.rect(x,y,w,h)
    }
    drawMap(t=0){this.worldScene?.draw(this.engine.s,this.motion,this.selection,t)}
    async importFile(event){
      const file=event.target.files?.[0];
      event.target.value='';
      if(!file)return;
      try{
        if(file.size>5*1024*1024)throw Error('Файл слишком большой');
        const raw=await file.text(),parsed=this.repository.import(raw);
        if(!this.env.confirm('Загрузить это сохранение? Текущая кампания будет сохранена в резервной копии.'))return;
        const result=this.repository.newGame(parsed.state);
        if(!result.ok)throw Error(result.error);
        this.installEngine(parsed.state);
        this.setBusy(false);
        this.localModal=null;
        this.screen='map';
        this.render();
        this.resize();
        this.center();
        this.toast('Сохранение загружено')
      }
      catch(e){
        this.reportError('Ошибка импорта: '+e.message)
      }
    }
    exportSave(){
      try{
        const blob=new this.env.Blob([this.repository.export(this.engine.export())],{
          type:'application/json'
        }
        ),url=this.env.URL.createObjectURL(blob),a=this.doc.createElement('a');
        a.href=url;
        a.download='korolevstva-pepla-'+D.VERSION+'-day-'+this.engine.s.day+'.json';
        this.doc.body.appendChild(a);
        a.click();
        a.remove();
        this.env.setTimeout(()=>this.env.URL.revokeObjectURL(url),1000)
      }
      catch(e){
        this.reportError('Не удалось экспортировать: '+e.message)
      }
    }
    newGame(){
      if(!this.env.confirm('Начать новую игру? Существующие сохранения будут архивированы.'))return;
      const state=C.initialState(),r=this.repository.newGame(state);
      if(!r.ok){
        this.reportError(r.error);
        return
      }
      this.installEngine(state);
      this.setBusy(false);
      this.localModal=null;
      this.screen='map';
      this.render();
      this.resize();
      this.center()
    }
    async offlineSetup(){
      if(this.env.ASH_QA)return;
      const node=this.$('offlineStatus');
      if(this.env.location.protocol==='file:'){
        node.textContent='Локальная версия: храните все файлы рядом. Для установки приложения откройте игру по HTTPS.';
        return
      }
      if(!this.env.navigator.serviceWorker||!this.env.isSecureContext){
        node.textContent='Установка офлайн-версии доступна по HTTPS.';
        return
      }
      try{
        await this.env.navigator.serviceWorker.register('./sw.js');
        node.textContent='Офлайн-кэш игры зарегистрирован. Первый запуск требует загрузки ресурсов.'
      }
      catch(e){
        node.textContent='Офлайн-кэш недоступен: '+e.message
      }
    }
  }
  function boot(env){
    const app=new App(env);
    app.readyPromise=app.boot().catch(e=>app.showStartup('Ошибка запуска: '+e.message,true,true));
    return app
  }
  return {
    App,loadImages,boot
  }
  ;
}
);
