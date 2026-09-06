/* Browser adapter. Render is read-only; engine commits own persistence boundaries. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./game-core.js'),require('./game-controls.js'));
  else{
    root.AshUI=factory(root.AshCore,root.AshControls);
    root.AshUI.boot(root);
  }
}
)(typeof globalThis!=='undefined'?globalThis:this,function(C,Controls){
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
      image.onload=()=>finish(true);
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
      this.camera={
        x:0,y:0,zoom:.58
      }
      ;
      this.frameId=null;
      this.motion=null;
      this.localModal=null;
      this.selection=null;
      this.selectionTimer=null;
      this.lastModal=null;
      this.previousFocus=null;
      this.fogKey='';
      this.seenKey='';
      this.seen=new Set();
      this.toastTimer=null;
      this.dayBusy=false;
      this.audio=null;
      this.loading=false;
      this.bootGeneration=0;
      this.labelHits=[];
      this.repository=new C.SaveRepository({
        getItem:k=>env.localStorage.getItem(k),setItem:(k,v)=>env.localStorage.setItem(k,v)
      }
      );
      this.canvas=this.$('mapCanvas');
      this.fog=this.doc.createElement('canvas');
      this.fog.width=D.WORLD_W;
      this.fog.height=D.WORLD_H;
      this.pointer=new Controls.PointerController(this.camera,{
        onTap:(x,y)=>this.mapTap(x,y),onChange:()=>this.requestFrame(),clamp:()=>this.clamp()
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
        enemyInfoClose:'Закрыть сведения о противнике',enemyCancelBtn:'Отменить нападение',spellCancel:'Закрыть книгу боя',retreatBtn:'Отступить в город за 350 золота',objectListClose:'Закрыть список объектов'
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
      const required=['world-v6.jpg','hero.jpg','mage.jpg','necromancer.jpg','battlefield.jpg','city.jpg'];
      const missing=loaded.missing.filter(n=>required.includes(n));
      if(missing.length){
        this.showStartup('Не удалось загрузить: '+missing.join(', ')+'. Проверьте, что архив полностью распакован.',true);
        return
      }
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
      let audibleState=state;
      this.engine=new C.Engine({
        state,scheduler:{
          set:(fn,ms)=>this.env.setTimeout(fn,ms),clear:id=>this.env.clearTimeout(id)
        }
        ,onChange:()=>{
          const current=this.engine.export();
          if(current.day!==audibleState.day)this.sound(520,.09);
          else if(Object.keys(current.heroes).some(id=>current.heroes[id].x!==audibleState.heroes[id].x||current.heroes[id].y!==audibleState.heroes[id].y))this.sound(300,.03);
          audibleState=current;
          const result=this.repository.save(this.engine.export());
          if(!result.ok)this.reportError(result.error);
          else this.clearError();
          this.render();
          this.requestFrame()
        }
        ,onMessage:m=>this.toast(m),onEvent:event=>{
          if(event.type==='town'){
            this.screen='town';
            this.localModal=null
          }
        }
      }
      );
      this.motion=new Controls.MotionDriver(this.engine,this.env.matchMedia?.('(prefers-reduced-motion: reduce)').matches?1:330);
      this.engine.resume()
    }
    unlockAudio(){
      if(!this.engine?.s.settings.sound)return;
      try{
        const Audio=this.env.AudioContext||this.env.webkitAudioContext;
        if(!Audio)return;
        this.audio=this.audio||new Audio();
        if(this.audio.state==='suspended')this.audio.resume()?.catch(()=>{});
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
    imageSource(name,fallback='hero.jpg'){
      return this.assets[name]?name:fallback;
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
        this.camera.zoom=Math.min(1.8,this.camera.zoom+.15);
        this.clamp();
        this.requestFrame()
      }
      );
      on('zoomOut',()=>{
        this.camera.zoom=Math.max(.38,this.camera.zoom-.15);
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
      on('soundToggle',()=>{
        this.engine.setSound(!this.engine.s.settings.sound);
        this.unlockAudio();
      });
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
        this.motion?.reset();
        this.pointer.cancel();
        if(!this.doc.hidden)this.requestFrame()
      }
      );
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
      if(this.engine.s.movement){
        this.engine.cancelMovement();
        this.motion.reset()
      }
      this.clearSelection();
      this.screen=name;
      if(name==='town')this.engine.visitTown();
      this.render();
      if(name==='map')this.resize()
    }
    render(){
      if(!this.engine)return;
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
      if(this.screen==='hero')this.renderHero();
      if(this.screen==='town')this.renderTown();
      if(this.screen==='magic')this.renderMagic();
      if(this.screen==='quests')this.renderQuests();
      if(this.screen==='settings')this.$('soundToggle').textContent='Звук: '+(s.settings.sound?'вкл':'выкл');
      if(s.battle)this.renderBattle();
      if(!s.battle&&s.levelChoices.length)this.renderLevel();
      this.syncModal();
      this.requestFrame();
    }
    renderHero(){
      const s=this.engine.s,h=s.heroes[s.activeHero];
      this.$('heroSelect').innerHTML=Object.values(s.heroes).map(x=>'<button class="btn heroBtn '+(x===h?'active':'')+'" data-hero="'+x.id+'"><img src="'+x.img+'" alt=""><span><b>'+x.name+'</b><br>Ур. '+x.level+'</span></button>').join('');
      for(const bt of this.$('heroSelect').querySelectorAll('[data-hero]'))bt.onclick=()=>{
        if(this.engine.selectHero(bt.dataset.hero).ok){
          this.switchScreen('map');
          this.center()
        }
      }
      ;
      this.$('heroPortrait').src=h.img;
      this.$('heroPortrait').alt=h.name;
      this.$('heroName').textContent=h.name;
      this.$('heroClass').textContent=h.cls;
      for(const k of ['atk','def','magic','knowledge','level','xp'])this.$(k).textContent=h[k];
      this.$('army').innerHTML=Object.entries(D.units).map(([k,u])=>'<div class="unitcard"><img src="'+this.imageSource(u.img)+'" alt=""><div class="txt"><b>'+h.army[k]+'</b><span class="small">'+u.n+'</span></div></div>').join('');
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
    renderTown(){
      const s=this.engine.s,h=s.heroes[s.activeHero],local=C.atTown(s,h.id),inc=C.income(s);
      this.$('econGrid').innerHTML=Object.entries(inc).map(([k,n])=>'<div class="econCard">'+({
        gold:'🪙',wood:'🪵',ore:'🪨',gems:'💎'
      }
      )[k]+'<b>'+n+'</b><span class="small">/день</span></div>').join('');
      this.$('econHint').textContent=(s.build.market?'Рынок: +100 золота в день. ':'Рынок даёт +100 золота в день. ')+(local?'Найм пополняет армию '+h.name+'.':'Герой далеко: найм пополняет гарнизон.');
      this.$('garrison').innerHTML=Object.keys(D.units).map(k=>'<div class="garrisonRow"><span>'+D.units[k].n+': <b>'+s.garrison[k]+'</b></span><button class="miniBtn" data-garrison="'+k+':in" '+(!local||!h.army[k]?'disabled':'')+' aria-label="В гарнизон: '+D.units[k].n+'">+1</button><button class="miniBtn" data-garrison="'+k+':out" '+(!local||!s.garrison[k]?'disabled':'')+' aria-label="Забрать из гарнизона: '+D.units[k].n+'">−1</button></div>').join('');
      for(const bt of this.$('garrison').querySelectorAll('[data-garrison]'))bt.onclick=()=>{
        const [k,d]=bt.dataset.garrison.split(':');
        this.engine.garrison(h.id,k,d)
      }
      ;
      this.$('buildings').innerHTML=Object.entries(D.builds).map(([k,d])=>{
        let reason=s.build[k]?(k==='citadel'?'Построено ранее; эффект не определён':'Построено'):k==='citadel'?'Недоступна: эффект не определён':d.req&&!s.build[d.req]?'Нужно: '+D.builds[d.req].n:s.gold<d.cost[0]||s.wood<d.cost[1]||s.ore<d.cost[2]?'Не хватает ресурсов':'';
        return '<button class="btn building '+(s.build[k]?'built':'')+'" data-build="'+k+'" '+(reason?'disabled':'')+'><b>'+d.n+'</b><br><span class="small">'+(reason||d.cost[0]+'🪙 '+d.cost[1]+'🪵 '+d.cost[2]+'🪨')+'</span></button>'
      }
      ).join('');
      for(const bt of this.$('buildings').querySelectorAll('[data-build]'))bt.onclick=()=>this.engine.build(bt.dataset.build);
      this.$('recruits').innerHTML=Object.entries(D.units).map(([k,u])=>{
        const reason=!s.build[u.req]?'Нужно: '+D.builds[u.req].n:s.avail[k]<u.qty?'Мало доступных воинов':s.gold<u.cost?'Не хватает золота':'';
        return '<button class="unitcard" data-recruit="'+k+'" '+(reason?'disabled':'')+'><img src="'+this.imageSource(u.img)+'" alt=""><div class="txt"><b>'+u.n+'</b><span class="small">'+(reason||'Доступно '+s.avail[k]+' · '+u.qty+' за '+u.cost+'🪙')+'</span></div></button>'
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
      this.$('worldStats').textContent='Исследовано '+s.seen.length+'/'+(D.W*D.H)+' клеток · Непосещённых объектов: '+C.allObjects(s).filter(o=>o.t!=='castle'&&o.owner!=='player').length+' · Репутация: '+s.reputation;
      this.$('storyProgress').innerHTML=['ivan','varvara','world'].map(k=>'<div class="storyCard"><b>'+({
        ivan:'Иван — Наследие Стального Холма',varvara:'Варвара — Тайна Пепельной магии',world:'Мировые события'
      }
      )[k]+'</b><div class="small">Этап '+s.story[k]+'/2</div></div>').join('');
      this.$('quests').innerHTML=[['Сделать первый ход героем',s.q.tutorialMove],['Открыть экран города',s.q.tutorialTown],['Захватить лесопилку',s.q.wood],['Захватить железную шахту',s.q.ore],['Захватить шахту самоцветов',s.q.gems],['Использовать Алтарь магии',s.q.altar],['Активировать сторожевую башню',s.q.obelisk],['Завершить цепочку Ивана',s.story.ivan>=2],['Завершить цепочку Варвары',s.story.varvara>=2],['Помочь 2 поселениям',s.q.villages>=2],['Исследовать 2 руины',s.q.ruins>=2],['Найти 2 артефакта',s.q.artifacts>=2],['Победить гарнизон Морвейна в Некрополе',s.q.boss]].map(([text,done])=>'<div class="quest '+(done?'done':'')+'">'+(done?'✅ ':'⬜ ')+text+'</div>').join('');
      this.$('log').innerHTML=s.logs.map(t=>'<div>'+escape(t)+'</div>').join('')
    }
    renderBattle(){
      const b=this.engine.s.battle,a=C.selectedStack(b),player=b.phase==='player';
      this.$('battleName').textContent=b.name;
      this.$('battleRound').textContent='Раунд '+b.round;
      this.$('battleHint').textContent=player?'Выберите доступную клетку или цель. Поле можно прокрутить.':b.phase==='enemy'?'Ход противника…':'Действие выполняется…';
      const h=this.engine.s.heroes[b.heroId];
      this.$('battleStatus').textContent='Мана '+h.mana+'/'+h.manaMax+' · '+(a?C.stackDef(a).n:'Завершение хода');
      this.$('turnbar').innerHTML=b.order.map(id=>b.stacks.find(st=>st.id===id&&st.hp>0)).filter(Boolean).map(st=>'<div class="turnchip '+(st.id===b.selectedId?'active':'')+'">'+(st.side==='p'?'🟦 ':'🟥 ')+C.stackDef(st).n+'</div>').join('');
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
        if(canAttack)cell.classList.add('attack');
        if(canMove)cell.classList.add('move');
        if(occ?.id===b.selectedId)cell.classList.add('sel');
        cell.setAttribute('aria-label','Клетка '+(x+1)+','+(y+1)+(occ?': '+C.stackDef(occ).n+', '+occ.qty+', '+occ.hp+' HP'+(occ.side==='p'?', союзники':', противник'):canMove?', переместиться':', недоступна'));
        if(occ){
          const st=this.doc.createElement('span');
          st.className='stack '+(occ.side==='p'?'player':'enemy');
          st.style.backgroundImage="url('"+this.imageSource(C.stackDef(occ).img,occ.side==='e'?'necromancer.jpg':'hero.jpg')+"')";
          const q=this.doc.createElement('span');
          q.className='qty';
          q.textContent=occ.qty;
          st.appendChild(q);
          cell.appendChild(st)
        }
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
      this.$('spellBtn').disabled=!player;
      this.$('retreatBtn').disabled=b.phase==='resolving';
      this.$('retreatBtn').onclick=()=>{
        if(this.engine.s.battle?.id===battleId)this.engine.finishBattle('retreat')
      }
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
          if(o.t==='enemy')this.openEnemy(o.id);
          else{
            const r=this.engine.commandInteract(s.activeHero,o.id);
            if(r.ok&&o.t==='castle'&&C.atTown(s,s.activeHero))this.switchScreen('town')
          }
        }
        ;
        box.appendChild(b)
      }
    }
    mapTap(sx,sy){
      if(!this.ready||!this.engine.idle()||this.localModal)return;
      const s=this.engine.s,wx=sx/this.camera.zoom+this.camera.x,wy=sy/this.camera.zoom+this.camera.y;
      let chosen=null;
      const hit=this.labelHits.find(r=>wx>=r.x&&wx<=r.x+r.w&&wy>=r.y&&wy<=r.y+r.h&&C.worldObject(s,r.id)&&C.isSeen(s,C.worldObject(s,r.id)));
      if(hit)chosen={
        o:C.worldObject(s,hit.id),dist:-1
      }
      ;
      for(const o of this.entities()){
        if(!C.isSeen(s,o))continue;
        const p=this.objectPosition(o),dist=Math.hypot(wx-p.x,wy-p.y);
        if(dist<=Math.max(o.radius,22/this.camera.zoom)&&(!chosen||dist<chosen.dist))chosen={
          o,dist
        }
      }
      const tx=Math.floor(wx/100),ty=Math.floor(wy/100);
      if(!chosen){
        const o=C.objectAt(s,tx,ty);
        if(o&&C.isSeen(s,o))chosen={
          o
        }
      }
      if(chosen){
        const o=chosen.o;
        if(this.selection!==o.id){
          this.selection=o.id;
          this.$('objectInfo').textContent=label(o)+(o.owner==='player'?' · ваш объект':'')+'. Нажмите ещё раз для подхода.';
          this.$('objectInfo').classList.remove('hidden');
          this.env.clearTimeout(this.selectionTimer);
          this.selectionTimer=this.env.setTimeout(()=>this.clearSelection(),2600);
          return
        }
        this.clearSelection();
        if(o.t==='enemy')this.openEnemy(o.id);
        else{
          const r=this.engine.commandInteract(s.activeHero,o.id);
          if(r.ok&&o.t==='castle'&&C.atTown(s,s.activeHero))this.switchScreen('town')
        }
        return
      }
      this.clearSelection();
      this.engine.commandMove(s.activeHero,tx,ty)
    }
    entities(){
      const s=this.engine.s;
      return [...C.allObjects(s),...(s.enemy.alive?[C.worldObject(s,s.enemy.id)]:[])]
    }
    objectPosition(o){
      return {
        x:o.x*100+50+(o.offset?.[0]||0),y:o.y*100+50+(o.offset?.[1]||0)
      }
    }
    syncModal(){
      const s=this.engine?.s;
      let active=this.localModal;
      if(!active&&s){
        if(s.battle)active='battleModal';
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
    requestFrame(){
      if(this.frameId!==null||this.doc.hidden)return;
      this.frameId=this.env.requestAnimationFrame(t=>{
        this.frameId=null;
        if(!this.ready||!this.engine||this.doc.hidden)return;
        const moving=this.motion.frame(t);
        if(this.screen==='map')this.drawMap(t);
        if(moving)this.requestFrame()
      }
      )
    }
    resize(){
      const r=this.canvas.getBoundingClientRect(),dpr=Math.min(2,this.env.devicePixelRatio||1);
      if(!r.width||!r.height)return;
      this.canvas.width=Math.round(r.width*dpr);
      this.canvas.height=Math.round(r.height*dpr);
      this.dpr=dpr;
      this.clamp();
      this.requestFrame()
    }
    clamp(){
      const r=this.canvas.getBoundingClientRect(),vw=r.width/this.camera.zoom,vh=r.height/this.camera.zoom;
      this.camera.x=vw>D.WORLD_W?-(vw-D.WORLD_W)/2:Math.max(-160,Math.min(D.WORLD_W-vw+160,this.camera.x));
      this.camera.y=vh>D.WORLD_H?-(vh-D.WORLD_H)/2:Math.max(-120,Math.min(D.WORLD_H-vh+120,this.camera.y))
    }
    center(){
      if(!this.engine)return;
      const p=this.motion.position(this.engine.s.activeHero),r=this.canvas.getBoundingClientRect();
      this.camera.x=p.x-r.width/(2*this.camera.zoom);
      this.camera.y=p.y-r.height/(2*this.camera.zoom)-60/this.camera.zoom;
      this.clamp();
      this.requestFrame()
    }
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
    updateFog(){
      const s=this.engine.s,signature=s.seen.join('|');
      if(signature===this.fogKey)return;
      this.fogKey=signature;
      this.seen=new Set(s.seen);
      const ctx=this.fog.getContext('2d');
      ctx.clearRect(0,0,D.WORLD_W,D.WORLD_H);
      ctx.fillStyle='rgba(2,6,4,.55)';
      ctx.fillRect(0,0,D.WORLD_W,D.WORLD_H);
      for(const k of this.seen){
        const [x,y]=k.split(',').map(Number);
        ctx.clearRect(x*100,y*100,100,100);
        ctx.fillStyle='rgba(2,6,4,.08)';
        ctx.fillRect(x*100,y*100,100,100)
      }
    }
    drawMap(t=0){
      if(!this.engine||!this.ready)return;
      const s=this.engine.s,ctx=this.canvas.getContext('2d'),r=this.canvas.getBoundingClientRect(),z=this.camera.zoom;
      ctx.setTransform(this.dpr||1,0,0,this.dpr||1,0,0);
      ctx.clearRect(0,0,r.width,r.height);
      ctx.fillStyle='#050705';
      ctx.fillRect(0,0,r.width,r.height);
      ctx.save();
      ctx.scale(z,z);
      ctx.translate(-this.camera.x,-this.camera.y);
      this.image(ctx,'world-v6.jpg',0,0,D.WORLD_W,D.WORLD_H);
      this.updateFog();
      ctx.drawImage(this.fog,0,0);
      this.labelHits=[];
      const m=s.movement;
      if(m){
        let p=this.motion.position(m.heroId);
        ctx.lineWidth=3/z;
        ctx.setLineDash([8/z,8/z]);
        for(const [i,[x,y]]of m.path.entries()){
          ctx.beginPath();
          ctx.moveTo(p.x,p.y);
          p={x:x*100+50,y:y*100+50};
          ctx.lineTo(p.x,p.y);
          ctx.strokeStyle=i<s.heroes[m.heroId].moves?'#92e48d':'#9a9c97';
          ctx.stroke();
        }
        ctx.setLineDash([])
      }
      for(const o of C.allObjects(s)){
        if(!C.isSeen(s,o))continue;
        const p=this.objectPosition(o);
        if(p.x<this.camera.x-240||p.y<this.camera.y-180||p.x>this.camera.x+r.width/z+240||p.y>this.camera.y+r.height/z+180)continue;
        const border=o.owner==='player'?'#72b8ff':'#d7b35d';
        if(!o.landmark){
          ctx.save();
          this.round(ctx,p.x-34,p.y-34,68,68,10/z);
          ctx.clip();
          this.image(ctx,o.img,p.x-34,p.y-34,68,68);
          ctx.restore();
          this.round(ctx,p.x-34,p.y-34,68,68,10/z);
          ctx.strokeStyle=border;
          ctx.lineWidth=2/z;
          ctx.stroke()
        }
        if(o.landmark||o.label){
          const text=label(o)+(o.owner==='player'?' ✓':''),yy=o.landmark?p.y-o.radius*.63:p.y+47;
          ctx.font='600 '+14/z+'px sans-serif';
          const w=ctx.measureText(text).width+16/z;
          this.labelHits.push({
            id:o.id,x:p.x-w/2,y:yy-17/z,w,h:26/z
          }
          );
          this.round(ctx,p.x-w/2,yy-17/z,w,26/z,7/z);
          ctx.fillStyle='rgba(5,10,7,.86)';
          ctx.fill();
          ctx.strokeStyle=border;
          ctx.lineWidth=1/z;
          ctx.stroke();
          ctx.fillStyle='#f5e8c6';
          ctx.textAlign='center';
          ctx.fillText(text,p.x,yy+1/z)
        }
      }
      if(s.enemy.alive&&this.seen.has(C.key(s.enemy.x,s.enemy.y))){
        const x=s.enemy.x*100+50,y=s.enemy.y*100+50;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x,y,32,0,Math.PI*2);
        ctx.clip();
        this.image(ctx,'necromancer.jpg',x-32,y-32,64,64);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(x,y,32,0,Math.PI*2);
        ctx.strokeStyle='#e36b61';
        ctx.lineWidth=3/z;
        ctx.stroke()
      }
      for(const id of ['arden','lyra']){
        const h=s.heroes[id],p=this.motion.position(id),active=id===s.activeHero,bob=m?.heroId===id?Math.sin(t*.01)*2:0;
        ctx.save();
        ctx.translate(p.x,p.y+bob);
        const sprite=id==='arden'?'ivan-rider.png':'varvara-map.png';
        if(id==='arden')this.image(ctx,this.assets[sprite]?sprite:h.img,-64,-84,128,147);
        else this.image(ctx,this.assets[sprite]?sprite:h.img,-46,-54,92,92);
        ctx.restore();
        if(active){
          ctx.beginPath();
          ctx.ellipse(p.x,p.y+35,36,11,0,0,Math.PI*2);
          ctx.strokeStyle='#f0c55e';
          ctx.lineWidth=3/z;
          ctx.stroke()
        }
      }
      ctx.restore();
    }
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
    app.boot().catch(e=>app.showStartup('Ошибка запуска: '+e.message,true,true));
    return app
  }
  return {
    App,loadImages,boot
  }
  ;
}
);
