/* Pure rules and serializable state. No DOM, RAF or browser storage side effects. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./game-data.js'));
  else root.AshCore=factory(root.AshData);
}
)(typeof globalThis!=='undefined'?globalThis:this,function(D){
  'use strict';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const key=(x,y)=>x+','+y;
  const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  const validCell=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<D.W&&y>=0&&y<D.H;
  const passable=(x,y)=>validCell(x,y)&&['land','bridge'].includes(D.terrain[y][x]);
  const neighbors=(x,y)=>[[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
  const troopTypes=Object.keys(D.units),heroIds=['arden','lyra'];
  const emptyArmy=()=>Object.fromEntries(troopTypes.map(k=>[k,0]));
  const rank=(hero,k)=>Math.min(D.skills[k]?.max||0,hero.skills[k]||0);
  function hero(id){
    const isIvan=id==='arden';
    return {
      id,name:isIvan?'Иван':'Варвара',cls:isIvan?'Рыцарь':'Боевой маг',img:isIvan?'hero.jpg':'mage.jpg',x:isIvan?12:14,y:isIvan?8:12,atk:isIvan?2:1,def:isIvan?2:1,magic:isIvan?1:3,knowledge:isIvan?1:2,level:1,xp:0,mana:14,manaMax:14,moves:12,maxMoves:12,skills:{
      }
      ,artifacts:[],army:isIvan?{
        pikes:24,bows:10,cavs:0,griffins:0,mages:0
      }
      :{
        pikes:10,bows:7,cavs:0,griffins:0,mages:2
      }
    }
  }
  function initialState(seed=Date.now()>>>0){
    return {
      schemaVersion:D.SCHEMA,gameVersion:D.VERSION,seed:seed||1,nextId:1,revision:0,day:1,week:1,month:1,gold:2800,wood:12,ore:10,gems:3,crystal:2,activeHero:'arden',heroes:{
        arden:hero('arden'),lyra:hero('lyra')
      }
      ,objects:Object.fromEntries(D.objects.map(o=>[o.id,{
        status:'active',owner:o.owner||null
      }
      ])),enemy:{
        id:'morvein-field',x:15,y:11,power:1,alive:true
      }
      ,build:Object.fromEntries(Object.keys(D.builds).map(k=>[k,false])),troopLevels:Object.fromEntries(troopTypes.map(k=>[k,1])),avail:{
        pikes:16,bows:0,cavs:0,griffins:0,mages:0
      }
      ,garrison:emptyArmy(),seen:[],q:{
        threat:18,siege:false,siegeWins:0,dungeonLevel:0,dungeonCleared:false,dungeonLoot:0,
        wood:false,ore:false,gems:false,artifacts:0,boss:false,tutorialMove:false,tutorialTown:false,altar:false,obelisk:false,villages:0,ruins:0
      }
      ,story:{
        ivan:0,varvara:0,world:0
      }
      ,reputation:0,settings:{
        sound:true,music:true,musicVolume:0.32
      }
      ,logs:[],movement:null,battle:null,levelChoices:[],victoryPending:false,freePlay:false
    }
  }
  function worldObject(s,id){
    if(id==='morvein-field')return s.enemy.alive?{
      id,x:s.enemy.x,y:s.enemy.y,t:'enemy',name:'Полевой отряд Морвейна',img:'necromancer.jpg',stacks:[['necros',5+s.enemy.power],['skeletons',16+s.enemy.power*3]],reward:1500,xp:140,owner:null,radius:44,offset:[0,0]
    }
    :null;
    const def=D.byId[id],state=s.objects[id];
    return def&&state&&state.status==='active'?{
      ...def,status:state.status,owner:state.owner
    }
    :null
  }
  function allObjects(s){
    return D.objects.map(o=>worldObject(s,o.id)).filter(Boolean)
  }
  function objectAt(s,x,y){
    return D.objects.find(o=>o.x===x&&o.y===y&&s.objects[o.id]?.status==='active')||null
  }
  function isSeen(s,o){
    return o.t==='castle'||s.seen.includes(key(o.x,o.y))
  }
  function canInteract(s,heroId,id){
    const h=s.heroes[heroId],o=worldObject(s,id);
    return !!(h&&o&&isSeen(s,o)&&distance(h,o)<=1&&passable(h.x,h.y))
  }
  function guardAt(s,x,y){
    if(s.enemy.alive&&s.enemy.x===x&&s.enemy.y===y)return {
      kind:'roaming',id:s.enemy.id
    }
    ;
    const o=objectAt(s,x,y);
    return o?.t==='enemy'?{
      kind:'object',id:o.id
    }
    :null
  }
  function search(sx,sy,isGoal,canEnter,max=Infinity,width=D.W,height=D.H){
    const start=key(sx,sy),q=[[sx,sy]],prev=new Map([[start,null]]),depth=new Map([[start,0]]);
    let found=null;
    for(let head=0;
    head<q.length;
    head++){
      const [x,y]=q[head],k=key(x,y),d=depth.get(k);
      if(isGoal(x,y)){
        found=k;
        break
      }
      if(d>=max)continue;
      for(const [nx,ny]of neighbors(x,y)){
        const nk=key(nx,ny);
        if(nx<0||nx>=width||ny<0||ny>=height||prev.has(nk)||!canEnter(nx,ny))continue;
        prev.set(nk,k);
        depth.set(nk,d+1);
        q.push([nx,ny])
      }
    }
    if(found===null)return null;
    const route=[];
    for(let k=found;
    k!==start;
    k=prev.get(k))route.push(k.split(',').map(Number));
    return route.reverse();
  }
  function pathfind(s,heroId,tx,ty,{
    ignoreGuards=false,allowTargetGuard=false
  }
  ={
  }
  ){
    const h=s.heroes[heroId];
    if(!h||!passable(tx,ty))return null;
    return search(h.x,h.y,(x,y)=>x===tx&&y===ty,(x,y)=>passable(x,y)&&(ignoreGuards||!guardAt(s,x,y)||(allowTargetGuard&&x===tx&&y===ty)))
  }
  function pathToInteract(s,heroId,id){
    const h=s.heroes[heroId],o=worldObject(s,id);
    if(!h||!o)return null;
    return search(h.x,h.y,(x,y)=>passable(x,y)&&Math.abs(x-o.x)+Math.abs(y-o.y)<=1&&!guardAt(s,x,y),(x,y)=>passable(x,y)&&!guardAt(s,x,y))
  }
  function nearestLand(x,y,occupied=new Set()){
    let found=null;
    for(let r=0;
    r<Math.max(D.W,D.H);
    r++){
      for(let yy=0;
      yy<D.H;
      yy++)for(let xx=0;
      xx<D.W;
      xx++)if(Math.abs(xx-x)+Math.abs(yy-y)===r&&passable(xx,yy)&&!occupied.has(key(xx,yy)))return [xx,yy]
    }
    return found
  }
  function reveal(s){
    const seen=new Set(s.seen);
    for(const h of Object.values(s.heroes))for(let dy=-3;
    dy<=3;
    dy++)for(let dx=-3;
    dx<=3;
    dx++){
      const x=h.x+dx,y=h.y+dy;
      if(validCell(x,y))seen.add(key(x,y))
    }
    s.seen=[...seen]
  }
  function heroPower(h){
    let p=troopTypes.reduce((n,k)=>n+h.army[k]*D.units[k].p*(k==='bows'?1+.15*rank(h,'archery'):1),0);
    return p*(1+.1*rank(h,'leadership'))*(1+.04*h.atk)*(1+.04*h.def)**.5
  }
  function income(s){
    let gold=300+heroIds.reduce((n,id)=>n+150*rank(s.heroes[id],'estates'),0)+(s.build.market?100:0),wood=0,ore=0,gems=0;
    for(const o of allObjects(s)){
      if(o.owner!=='player')continue;
      if(o.t==='sawmill')wood+=2;
      if(o.kind==='ore')ore+=2;
      if(o.kind==='gems')gems++
    }
    return {
      gold,wood,ore,gems
    }
  }
  function atTown(s,id){
    return distance(s.heroes[id],D.byId.castle)<=1
  }
  const growth={
    pikes:16,bows:10,cavs:4,griffins:2,mages:2
  }
  ;
  function stackDef(st){
    const defs=st.side==='p'?D.units:D.enemies;if(!Object.hasOwn(defs,st.type))return undefined;return Object.assign({},defs[st.type],D.battleTraits?.[st.type]||{})
  }
  function stackAt(b,x,y){
    return b.stacks.find(st=>st.hp>0&&st.x===x&&st.y===y)||null
  }
  function selectedStack(b){
    return b?.stacks.find(st=>st.id===b.selectedId&&st.hp>0)||null
  }
  function tacticalPath(b,st,x,y){
    if(stackAt(b,x,y)&&!(x===st.x&&y===st.y))return null;
    return search(st.x,st.y,(xx,yy)=>xx===x&&yy===y,(xx,yy)=>!stackAt(b,xx,yy),stackDef(st).spd,8,5)
  }
  function applyDamage(st,amount){
    st.hp=Math.max(0,st.hp-amount);
    st.qty=Math.ceil(st.hp/stackDef(st).hp);
  }
  class Engine{
    constructor(options={
    }
    ){
      this.scheduler=options.scheduler||{
        set:(fn,ms)=>setTimeout(fn,ms),clear:id=>clearTimeout(id)
      }
      ;
      this.onChange=options.onChange||(()=>{
      }
      );
      this.onMessage=options.onMessage||(()=>{
      }
      );
      this.onEvent=options.onEvent||(()=>{
      }
      );
      this.randomOverride=options.random;
      this.epoch=0;
      this.timer=null;
      this.s=options.state?validateState(clone(options.state)):initialState(options.seed);
      reveal(this.s);
      this.prepareChoice();
    }
    get state(){
      return this.s
    }
    random(){
      if(this.randomOverride)return this.randomOverride();
      let n=this.s.seed>>>0;
      n^=n<<13;
      n^=n>>>17;
      n^=n<<5;
      this.s.seed=n>>>0||1;
      return (this.s.seed>>>0)/4294967296
    }
    id(prefix){
      return prefix+'-'+this.s.nextId++
    }
    log(t){
      this.s.logs.unshift('• '+t);
      this.s.logs=this.s.logs.slice(0,80)
    }
    fail(reason){
      this.onMessage(reason);
      return {
        ok:false,reason
      }
    }
    atomic(fn){
      this.depth=(this.depth||0)+1;
      try{
        return fn()
      }
      finally{
        this.depth--;
        if(!this.depth&&this.dirty){
          this.dirty=false;
          this.commit()
        }
      }
    }
    commit(){
      if(this.depth){
        this.dirty=true;
        return {
          ok:true
        }
      }
      this.s.revision++;
      this.onChange(this.export());
      return {
        ok:true
      }
    }
    export(){
      return clone(this.s)
    }
    idle(){
      return !this.s.battle&&!this.s.levelChoices.length&&!this.s.victoryPending
    }
    cancelTimer(){
      this.epoch++;
      if(this.timer!==null)this.scheduler.clear(this.timer);
      this.timer=null
    }
    later(fn,ms,battleId,turnId){
      this.cancelTimer();
      const epoch=this.epoch;
      this.timer=this.scheduler.set(()=>{
        this.timer=null;
        if(epoch!==this.epoch||this.s.battle?.id!==battleId||this.s.battle?.turnId!==turnId)return;
        fn()
      }
      ,ms)
    }
    resume(){
      this.cancelTimer();
      const b=this.s.battle;
      if(b){
        if(b.phase==='resolving')this.later(()=>this.advanceBattle(),100,b.id,b.turnId);
        else if(b.phase==='enemy')this.scheduleEnemy()
      }
      this.onChange(this.export())
    }
    replaceState(state){
      const valid=validateState(clone(state));
      this.cancelTimer();
      this.s=valid;
      reveal(this.s);
      this.prepareChoice();
      this.resume()
    }
    newGame(seed){
      this.cancelTimer();
      this.s=initialState(seed);
      reveal(this.s);
      this.log('Кампания началась. Морвейн укрепляет восточные земли.');
      return this.commit()
    }
    selectHero(id){
      if(!heroIds.includes(id))return this.fail('Неизвестный герой');
      if(!this.idle())return this.fail('Сначала завершите текущее событие');
      this.s.movement=null;
      this.s.activeHero=id;
      return this.commit()
    }
    cancelMovement(){
      if(this.s.movement){
        this.s.movement=null;
        return this.commit()
      }
      return {
        ok:true
      }
    }
    commandMove(id,tx,ty){
      if(!this.idle())return this.fail('Сначала завершите текущее событие');
      const path=pathfind(this.s,id,tx,ty);
      if(!path)return this.fail('Нет доступного пути: вода, горы или охрана');
      if(!path.length)return {
        ok:true
      }
      ;
      if(this.s.heroes[id].moves<=0)return this.fail('Движение закончилось. Начните следующий день');
      this.s.movement={
        id:this.id('move'),heroId:id,path,targetId:null
      }
      ;
      return this.commit()
    }
    commandInteract(heroId,id){
      if(!this.idle())return this.fail('Сначала завершите текущее событие');
      const o=worldObject(this.s,id);
      if(!o)return this.fail('Объект уже посещён или уничтожен');
      if(!isSeen(this.s,o))return this.fail('Сначала разведайте эту область');
      if(canInteract(this.s,heroId,id)){
        this.s.movement=null;
        return this.interact(heroId,id)
      }
      const path=pathToInteract(this.s,heroId,id);
      if(!path)return this.fail('Нет доступного подхода: путь закрыт');
      if(this.s.heroes[heroId].moves<=0)return this.fail('Недостаточно движения');
      this.s.movement={
        id:this.id('move'),heroId,path,targetId:id
      }
      ;
      return this.commit()
    }
    movementStep(token){
      return this.atomic(()=>this.applyMovementStep(token))
    }
    applyMovementStep(token){
      const m=this.s.movement;
      if(!this.idle()||!m||m.id!==token)return false;
      const h=this.s.heroes[m.heroId];
      if(!m.path.length||h.moves<=0)return false;
      const [x,y]=m.path[0];
      if(!passable(x,y)||Math.abs(h.x-x)+Math.abs(h.y-y)!==1){
        this.s.movement=null;
        this.fail('Маршрут изменился. Выберите цель заново');
        this.commit();
        return false
      }
      const guarding=guardAt(this.s,x,y);
      if(guarding){
        this.s.movement=null;
        this.startBattle(m.heroId,guarding);
        return false
      }
      m.path.shift();
      h.x=x;
      h.y=y;
      h.moves--;
      this.s.q.tutorialMove=true;
      reveal(this.s);
      // Mandatory contact always has priority over the destination's optional event.
      if(this.checkContact(m.heroId))return true;
      const walked=objectAt(this.s,x,y);
      if(walked&&walked.id!==m.targetId&&walked.t!=='enemy')this.interact(m.heroId,walked.id,{
        auto:true
      }
      );
      if(this.s.movement?.id===token&&this.idle()&&m.targetId&&canInteract(this.s,m.heroId,m.targetId)){
        this.s.movement=null;
        this.interact(m.heroId,m.targetId)
      }
      else if(this.s.movement?.id===token&&!m.path.length)this.s.movement=null;
      this.commit();
      return true;
    }
    checkContact(id){
      if(this.s.battle)return true;
      if(this.s.levelChoices.length||this.s.victoryPending)return false;
      const h=this.s.heroes[id],g=guardAt(this.s,h.x,h.y);
      if(g){
        this.s.movement=null;
        if(!troopTypes.some(k=>h.army[k]>0)){
          h.x=D.byId.castle.x;
          h.y=D.byId.castle.y;
          h.moves=0;
          reveal(this.s);
          this.log(h.name+': нет армии для защиты. Герой вернулся в Стальной Холм');
          this.commit();
          return true;
        }
        return this.startBattle(id,g).ok
      }
      return false
    }
    addXP(id,amount){
      const h=this.s.heroes[id];
      h.xp+=amount;
      while(h.xp>=h.level*100){
        h.level++;
        h.atk++;
        h.def++;
        this.s.levelChoices.push({
          id:this.id('level'),heroId:id,level:h.level,options:null
        }
        )
      }
      this.prepareChoice();
      if(this.s.levelChoices.length)this.s.movement=null
    }
    prepareChoice(){
      const c=this.s.levelChoices[0];
      if(!c||c.options)return;
      const h=this.s.heroes[c.heroId];
      const choices=Object.keys(D.skills).filter(k=>(h.skills[k]||0)<D.skills[k].max);
      for(let i=choices.length-1;
      i>0;
      i--){
        const j=Math.floor(this.random()*(i+1));
        [choices[i],choices[j]]=[choices[j],choices[i]]
      }
      c.options=choices.length?choices.slice(0,2):['training']
    }
    chooseSkill(choiceId,skill){
      if(this.s.battle)return this.fail('Сначала завершите бой');
      const c=this.s.levelChoices[0];
      if(!c||c.id!==choiceId||!c.options.includes(skill))return this.fail('Этот выбор уже обработан');
      const h=this.s.heroes[c.heroId];
      if(skill==='training')h.atk++;
      else{
        h.skills[skill]=(h.skills[skill]||0)+1;
        if(skill==='logistics'){
          h.maxMoves=12+2*rank(h,'logistics');
          h.moves=Math.min(h.maxMoves,h.moves+2)
        }
        if(skill==='wisdom'){
          h.manaMax+=5;
          h.mana=Math.min(h.manaMax,h.mana+5)
        }
      }
      this.log(h.name+': '+(D.skills[skill]?.name||'Военное мастерство'));
      this.s.levelChoices.shift();
      this.prepareChoice();
      return this.commit()
    }
    visitTown(){
      this.s.q.tutorialTown=true;
      return this.commit()
    }
    interact(heroId,id,{
      auto=false
    }
    ={
    }
    ){
      if(!this.idle())return this.fail('Сначала завершите текущее событие');
      if(!canInteract(this.s,heroId,id))return this.fail('Нужно подойти к разведанному объекту');
      const s=this.s,h=s.heroes[heroId],o=worldObject(s,id),record=s.objects[id];
      if(o.t==='enemy')return this.startBattle(heroId,{
        kind:id===s.enemy.id?'roaming':'object',id
      }
      );
      if(o.t==='castle'){
        if(!auto){
          s.q.tutorialTown=true;
          s.movement=null;
          this.onEvent({
            type:'town',heroId
          }
          );
          this.onMessage('Стальной Холм')
        }
        return this.commit()
      }
      if(o.t==='sawmill'||o.t==='mine'){
        if(record.owner==='player')return this.fail('Объект уже принадлежит вам');
        record.owner='player';
        if(o.t==='sawmill')s.q.wood=true;
        if(o.kind==='ore')s.q.ore=true;
        if(o.kind==='gems')s.q.gems=true;
        this.log((o.label||'Объект')+' захвачен');
        return this.commit()
      }
      if(o.t==='cave'){
        s.movement=null;
        this.onEvent({type:'dungeon',heroId});
        this.onMessage('Пещера Бездны');
        return this.commit()
      }
      if(o.t==='event'){
        const result=this.storyEvent(heroId,o);
        if(!result.ok){
          if(!auto)this.fail(result.reason);
          return result
        }
      }
      else if(o.t==='chest'){
        if(this.random()<.5){
          s.gold+=1000;
          this.log('Сундук: +1000 золота')
        }
        else{
          this.addXP(heroId,85);
          this.log('Сундук знаний: +85 опыта')
        }
      }
      else if(o.t==='portal'){
        h.mana=Math.min(h.manaMax,h.mana+6);
        this.log('Источник маны: +6 маны')
      }
      else if(o.t==='artifact'){
        const a=D.artifactDefs[o.artifact];
        h[a.stat]+=a.v;
        h.artifacts.push(o.artifact);
        s.q.artifacts++;
        this.log('Найден артефакт: '+a.n)
      }
      else if(o.t==='altar'){
        h.magic++;
        h.mana=h.manaMax;
        s.q.altar=true;
        this.log(h.name+': Алтарь магии, +1 Магия')
      }
      else if(o.t==='obelisk'){
        s.q.obelisk=true;
        const seen=new Set(s.seen);
        for(let y=0;
        y<D.H;
        y++)for(let x=0;
        x<D.W;
        x++)if(Math.hypot(x-o.x,y-o.y)<=5.2)seen.add(key(x,y));
        s.seen=[...seen];
        this.log('Сторожевая башня открыла область карты')
      }
      else if(o.t==='shrine'){
        const roll=this.random();
        if(roll<.34)h.atk++;
        else if(roll<.67)h.def++;
        else{
          h.magic++;
          h.mana=h.manaMax
        }
        this.log('Святилище усилило героя')
      }
      else if(o.t==='camp'){
        const u=this.random()<.55?'pikes':'bows',n=u==='pikes'?8:5;
        h.army[u]+=n;
        this.log('Лагерь: '+D.units[u].n+' +'+n)
      }
      else if(o.t==='caravan'){
        if(s.gold>=500&&this.random()<.5){
          s.gold-=500;
          s.wood+=6;
          s.ore+=6;
          this.log('Караван: 500 золота за 6 дерева и 6 руды')
        }
        else{
          s.gold+=650;
          this.log('Караван: +650 золота')
        }
      }
      else if(o.t==='trap'){
        if(this.random()<.5){
          this.addXP(heroId,90);
          this.log('Найдены карты: +90 опыта')
        }
        else{
          h.moves=Math.max(0,h.moves-3);
          this.log('Ловушка: −3 движения')
        }
      }
      else if(o.t==='village'){
        const r=this.random();
        if(r<.34){
          s.gold+=500;
          this.log(o.label+': +500 золота')
        }
        else if(r<.67){
          h.army.pikes+=5;
          h.army.bows+=3;
          this.log(o.label+': +8 воинов')
        }
        else{
          h.moves=Math.min(h.maxMoves,h.moves+4);
          h.mana=Math.min(h.manaMax,h.mana+5);
          this.log(o.label+': отдых')
        }
        s.q.villages++;
        s.reputation++
      }
      else if(o.t==='ruins'){
        const r=this.random();
        if(r<.33){
          this.addXP(heroId,120);
          this.log(o.label+': +120 опыта')
        }
        else if(r<.66){
          s.gems+=2;
          s.crystal++;
          this.log(o.label+': +2 самоцвета, +1 кристалл')
        }
        else{
          h.atk++;
          h.def++;
          this.log(o.label+': +1 Атака и Защита')
        }
        s.q.ruins++
      }
      record.status='completed';
      record.visitedBy=heroId;
      if(s.levelChoices.length)s.movement=null;
      return this.commit();
    }
    storyEvent(id,o){
      const s=this.s,h=s.heroes[id],e=o.event,chain=e.startsWith('ivan')?'ivan':e.startsWith('varvara')?'varvara':'world',stage=Number(e.slice(-1));
      if(chain==='ivan'&&id!=='arden')return {
        ok:false,reason:'Это событие связано с Иваном'
      }
      ;
      if(chain==='varvara'&&id!=='lyra')return {
        ok:false,reason:'Это событие связано с Варварой'
      }
      ;
      if(stage===2&&s.story[chain]<1)return {
        ok:false,reason:'Сначала завершите первый этап этой цепочки'
      }
      ;
      if(s.story[chain]>=stage)return {
        ok:true
      }
      ;
      if(e==='ivan1'){
        this.addXP(id,100);
        s.gold+=350;
        this.log('Иван нашёл след отряда: +100 опыта, +350 золота')
      }
      if(e==='ivan2'){
        h.atk++;
        h.army.cavs+=2;
        s.reputation+=2;
        this.log('Иван поднял знамя: +1 Атака, +2 рыцаря')
      }
      if(e==='varvara1'){
        h.magic++;
        h.mana=h.manaMax;
        this.log('Варвара очистила источник: +1 Магия')
      }
      if(e==='varvara2'){
        h.knowledge++;
        h.manaMax+=4;
        h.mana=h.manaMax;
        s.crystal+=2;
        this.log('Варвара изучила кристалл: +1 Знания, +4 маны')
      }
      if(e==='world1'){
        s.gold+=800;
        s.reputation++;
        this.log('Ультиматум отвергнут: +800 золота')
      }
      if(e==='world2'){
        s.crystal+=3;
        s.reputation+=3;
        for(const hero of Object.values(s.heroes)){
          hero.magic++;
          hero.mana=hero.manaMax
        }
        this.log('Разлом Пепла запечатан: оба героя получают +1 Магию')
      }
      s.story[chain]=stage;
      return {
        ok:true
      }
      ;
    }
    nextDay(){
      return this.atomic(()=>this.applyNextDay())
    }
    applyNextDay(){
      if(!this.idle())return this.fail('Сначала завершите бой или выбор награды');
      const s=this.s;
      s.movement=null;
      s.day++;
      s.week=Math.floor((s.day-1)/7)+1;
      s.month=Math.floor((s.day-1)/28)+1;
      if((s.day-1)%7===0){
        for(const k of troopTypes)if(s.build[D.units[k].req])s.avail[k]+=growth[k];
        if(s.enemy.alive)s.enemy.power++;
        this.log('Новая неделя: прирост войск')
      }
      const inc=income(s);
      for(const k of Object.keys(inc))s[k]+=inc[k];
      for(const h of Object.values(s.heroes)){
        h.maxMoves=12+2*rank(h,'logistics');
        h.moves=h.maxMoves;
        h.mana=Math.min(h.manaMax,h.mana+3+h.knowledge)
      }
      this.log('День '+s.day+'. Доход: '+inc.gold+' золота.');
      this.enemyWorldTurn();
      if(!s.battle)this.dailyEvent();
      return this.commit();
    }
    enemyWorldTurn(){
      const s=this.s;if(!s.enemy.alive||s.battle||s.levelChoices.length)return;
      for(const id of heroIds)if(s.heroes[id].x===s.enemy.x&&s.heroes[id].y===s.enemy.y){this.checkContact(id);return}
      s.q.threat=Math.min(100,(s.q.threat||0)+3+(s.day%7===0?5:0));
      const castle=D.byId.castle;
      const resources=allObjects(s).filter(o=>(o.t==='mine'||o.t==='sawmill')&&o.owner==='player');
      let target=castle;
      if(s.q.threat<65&&resources.length){resources.sort((a,b)=>distance(s.enemy,a)-distance(s.enemy,b));target=resources[0]}
      const path=search(s.enemy.x,s.enemy.y,(x,y)=>x===target.x&&y===target.y,(x,y)=>passable(x,y)&&objectAt(s,x,y)?.t!=='enemy');
      if(path&&path.length)[s.enemy.x,s.enemy.y]=path[0];
      const captured=resources.find(o=>o.x===s.enemy.x&&o.y===s.enemy.y);
      if(captured){s.objects[captured.id].owner='enemy';s.q.threat=Math.min(100,s.q.threat+8);this.log('☠ Некрополь захватил: '+captured.label)}
      if(castle&&distance(s.enemy,castle)<=1){
        s.q.siege=true;s.q.threat=100;
        const defense=Object.entries(s.garrison).reduce((n,[k,q])=>n+q*D.units[k].p,0)*(s.build.citadel?1.45:1)*(s.build.barracks?1.1:1);
        const attack=90+s.enemy.power*28;
        if(defense>=attack){s.q.siegeWins=(s.q.siegeWins||0)+1;s.q.siege=false;s.q.threat=55;s.enemy.x=23;s.enemy.y=4;s.enemy.power++;this.log('🏰 Гарнизон отбил осаду Стального Холма!')}
        else this.log('⚠️ Стальной Холм осаждён! Верните героя или усилите гарнизон.')
      }
      for(const id of heroIds)if(s.heroes[id].x===s.enemy.x&&s.heroes[id].y===s.enemy.y){this.checkContact(id);break}
    }
    dailyEvent(){
      const s=this.s;
      if(s.day<3||this.random()>.28)return;
      const h=s.heroes[s.activeHero],event=Math.floor(this.random()*4);
      if(event===0){
        s.gold+=250;
        this.log('Торговцы собрали +250 золота')
      }
      if(event===1){
        s.wood+=2;
        s.ore+=2;
        this.log('Обоз: +2 дерева, +2 руды')
      }
      if(event===2){
        h.moves=Math.max(0,h.moves-2);
        this.log(h.name+': ливень, −2 движения')
      }
      if(event===3){
        this.addXP(h.id,35);
        this.log(h.name+': сведения разведчиков, +35 опыта')
      }
    }
    build(id){
      if(!this.idle())return this.fail('Сначала завершите событие');
      const s=this.s,d=D.builds[id];
      if(!d)return this.fail('Неизвестное здание');
      if(s.build[id])return this.fail('Уже построено');
      if(d.req&&!s.build[d.req])return this.fail('Сначала постройте '+D.builds[d.req].n);
      if(s.gold<d.cost[0]||s.wood<d.cost[1]||s.ore<d.cost[2])return this.fail('Не хватает ресурсов');
      s.gold-=d.cost[0];
      s.wood-=d.cost[1];
      s.ore-=d.cost[2];
      s.build[id]=true;
      for(const u of troopTypes)if(D.units[u].req===id)s.avail[u]+=growth[u];
      if(id==='mage')for(const h of Object.values(s.heroes)){
        h.magic++;
        h.manaMax+=5;
        h.mana=h.manaMax
      }
      if(id==='citadel')this.log('Построена Цитадель: +25% защиты в боях у Стального Холма и открыт доступ к высшим улучшениям');
      else this.log('Построено: '+d.n);
      return this.commit()
    }
    upgradeTroop(type){
      if(!this.idle())return this.fail('Сначала завершите событие');
      const s=this.s,u=D.units[type],cfg=D.troopUpgrades;
      if(!u||!cfg)return this.fail('Неизвестный тип войск');
      const magic=cfg.magic.includes(type),building=magic?'arcaneTower':'training';
      if(!s.build[building])return this.fail('Сначала постройте '+D.builds[building].n);
      const level=s.troopLevels[type]||1;
      if(level>=cfg.maxLevel)return this.fail('Достигнут максимальный уровень');
      if(level>=3&&!s.build.citadel)return this.fail('Для IV и V уровня требуется Цитадель');
      const cost=cfg.costs[type][level-1], [gold,wood,ore,gems]=cost;
      if(s.gold<gold||s.wood<wood||s.ore<ore||s.gems<gems)return this.fail('Не хватает ресурсов для улучшения');
      s.gold-=gold;s.wood-=wood;s.ore-=ore;s.gems-=gems;
      s.troopLevels[type]=level+1;
      const bonus=Math.round(cfg.damagePerLevel[type]*100*(level));
      this.log(D.units[type].n+' улучшены до уровня '+(level+1)+' · бонус базового урона +'+bonus+'%');
      return this.commit()
    }
    recruit(id,heroId=this.s.activeHero){
      if(!this.idle())return this.fail('Сначала завершите событие');
      const s=this.s,u=D.units[id];
      if(!u)return this.fail('Неизвестный отряд');
      if(!s.build[u.req])return this.fail('Сначала постройте '+D.builds[u.req].n);
      if(s.avail[id]<u.qty)return this.fail('Недостаточно доступных воинов');
      if(s.gold<u.cost)return this.fail('Не хватает золота');
      s.gold-=u.cost;
      s.avail[id]-=u.qty;
      const hero=s.heroes[heroId];
      if(!hero)return this.fail('Неизвестный герой');
      hero.army[id]+=u.qty;
      this.log(u.n+' +'+u.qty+' — '+hero.name);
      return this.commit()
    }
    transfer(from,to,type,count=1){
      if(!this.idle())return this.fail('Сначала завершите событие');
      const a=this.s.heroes[from],b=this.s.heroes[to];
      if(!a||!b||a===b||!D.units[type]||!Number.isInteger(count)||count<=0)return this.fail('Неверная передача');
      if(distance(a,b)>1)return this.fail('Герои должны стоять рядом');
      const n=Math.min(count,a.army[type]);
      if(!n)return this.fail('Нет воинов для передачи');
      a.army[type]-=n;
      b.army[type]+=n;
      return this.commit()
    }
    garrison(heroId,type,direction,count=1){
      if(!this.idle())return this.fail('Сначала завершите событие');
      if(!D.units[type]||!Number.isInteger(count)||count<=0||!['in','out'].includes(direction))return this.fail('Неверная передача');
      if(!atTown(this.s,heroId))return this.fail('Для передачи гарнизона герой должен быть у города');
      const hero=this.s.heroes[heroId].army,gar=this.s.garrison,from=direction==='in'?hero:gar,to=direction==='in'?gar:hero,n=Math.min(count,from[type]);
      if(!n)return this.fail('Нет воинов для передачи');
      from[type]-=n;
      to[type]+=n;
      return this.commit()
    }
    garrisonAll(heroId,direction){
      if(!this.idle())return this.fail('Сначала завершите событие');
      if(!['in','out'].includes(direction))return this.fail('Неверная передача');
      if(!atTown(this.s,heroId))return this.fail('Для передачи гарнизона герой должен быть у города');
      const hero=this.s.heroes[heroId].army,gar=this.s.garrison,from=direction==='in'?hero:gar,to=direction==='in'?gar:hero;
      let moved=0;
      for(const type of troopTypes){
        const n=from[type]||0;
        if(!n)continue;
        from[type]-=n;
        to[type]+=n;
        moved+=n
      }
      if(!moved)return this.fail(direction==='out'?'Гарнизон пуст':'Армия героя пуста');
      this.log((direction==='out'?'Вся армия гарнизона передана герою ':'Вся армия героя передана в гарнизон: ')+this.s.heroes[heroId].name);
      return this.commit()
    }
    dungeonEncounter(heroId){
      if(!this.idle())return this.fail('Сначала завершите текущее событие');
      const s=this.s,h=s.heroes[heroId],level=Math.min(3,(s.q.dungeonLevel||0)+1);
      if(s.q.dungeonCleared)return this.fail('Сердце Бездны уже очищено');
      const need=[0,85,150,235][level],power=heroPower(h);
      if(power<need)return this.fail('Армия слишком слаба. Рекомендуемая сила: '+need);
      const loss=Math.max(1,Math.round((level*4)/(1+h.def*.08)));
      for(const k of troopTypes){if(h.army[k]>0){h.army[k]=Math.max(0,h.army[k]-Math.min(h.army[k],Math.ceil(loss/(level+2))));break}}
      const rewards=[null,[650,2,0],[1100,0,2],[2400,2,2]][level];s.gold+=rewards[0];s.gems+=rewards[1];s.crystal+=rewards[2];s.q.dungeonLoot=(s.q.dungeonLoot||0)+1;s.q.dungeonLevel=level;
      s.q.threat=Math.max(0,(s.q.threat||0)-(level===3?30:8));
      if(level===3){s.q.dungeonCleared=true;if(!h.artifacts.includes('crown')){h.artifacts.push('crown');h.knowledge+=D.artifactDefs.crown?.v||1}this.log('🔥 Хранитель Бездны повержен. Источник силы Некрополя ослаблен.')}
      else this.log('🕯 Подземелье: очищен уровень '+level+'. Найдены сокровища.');
      this.log('Подземная экспедиция заняла целый день. Мир наверху продолжил движение.');
      return this.applyNextDay()
    }
    setMusic(on){this.s.settings.music=!!on;return this.commit()}
    setSound(on){
      this.s.settings.sound=!!on;
      return this.commit()
    }
    closeVictory(){
      if(!this.s.victoryPending)return {
        ok:true
      }
      ;
      this.s.victoryPending=false;
      this.s.freePlay=true;
      return this.commit()
    }
    startBattle(heroId,source){
      const s=this.s;
      if(s.battle)return this.fail('Бой уже начался');
      if(s.levelChoices.length||s.victoryPending)return this.fail('Сначала завершите выбор награды');
      const h=s.heroes[heroId];
      let o;
      if(source.kind==='object'){
        o=worldObject(s,source.id);
        if(!o||o.t!=='enemy')return this.fail('Отряд уже уничтожен');
        if(!canInteract(s,heroId,source.id))return this.fail('Подойдите к противнику')
      }
      else if(source.kind==='roaming'){
        if(!s.enemy.alive||distance(h,s.enemy)>1)return this.fail('Полевой отряд недоступен');
        o={
          name:'Полевой отряд Морвейна',stacks:[['necros',5+s.enemy.power],['skeletons',16+s.enemy.power*3]],reward:1500,xp:140,boss:false
        }
      }
      else return this.fail('Неизвестный источник боя');
      if(!troopTypes.some(k=>h.army[k]>0))return this.fail('У героя нет армии');
      this.cancelTimer();
      s.movement=null;
      s.activeHero=heroId;
      const stacks=[];
      for(const type of troopTypes){
        const qty=h.army[type];
        if(qty)stacks.push({
          id:this.id('stack'),side:'p',type,qty,hp:qty*D.units[type].hp,initialQty:qty,x:0,y:stacks.length,defending:false,stone:false,counterRound:0
        }
        )
      }
      for(const [i,[type,qty]]of o.stacks.entries())stacks.push({
        id:this.id('stack'),side:'e',type,qty,hp:qty*D.enemies[type].hp,initialQty:qty,x:7,y:i+1,defending:false,stone:false,counterRound:0
      }
      );
      s.battle={
        id:this.id('battle'),source:clone(source),heroId,name:o.name||o.label,reward:o.reward,xp:o.xp,boss:!!o.boss,stacks,order:[],index:0,round:0,turnId:0,selectedId:null,phase:'resolving'
      }
      ;
      this.advanceBattle();
      return {
        ok:true
      }
      ;
    }
    advanceBattle(){
      const b=this.s.battle;
      if(!b)return;
      this.cancelTimer();
      const p=b.stacks.some(st=>st.side==='p'&&st.hp>0),e=b.stacks.some(st=>st.side==='e'&&st.hp>0);
      if(!p||!e){
        this.finishBattle(p?'win':'loss');
        return
      }
      let selected=null;
      for(let guard=0;
      guard<20&&!selected;
      guard++){
        if(b.index>=b.order.length){
          b.round++;
          b.order=b.stacks.filter(st=>st.hp>0).sort((a,c)=>(stackDef(c).init??stackDef(c).spd)-(stackDef(a).init??stackDef(a).spd)||stackDef(c).spd-stackDef(a).spd||a.id.localeCompare(c.id)).map(st=>st.id);
          b.index=0
        }
        const id=b.order[b.index++];
        selected=b.stacks.find(st=>st.id===id&&st.hp>0)
      }
      if(!selected)throw Error('Battle has no selectable living stack');
      selected.defending=false;
      b.selectedId=selected.id;
      b.turnId++;
      b.phase=selected.side==='p'?'player':'enemy';
      this.commit();
      if(b.phase==='enemy')this.scheduleEnemy()
    }
    scheduleEnemy(){
      const b=this.s.battle;
      if(!b||b.phase!=='enemy')return;
      this.later(()=>this.enemyBattleAction(b.id,b.turnId),300,b.id,b.turnId)
    }
    damage(attacker,target,{
      counter=false
    }
    ={
    }
    ){
      const b=this.s.battle,h=this.s.heroes[b.heroId],d=stackDef(attacker);
      let value=attacker.qty*d.p;
      if(attacker.side==='p'){
        value*=1+.04*h.atk;
        value*=1+.1*rank(h,'leadership');
        if(attacker.type==='bows')value*=1+.15*rank(h,'archery');
        const level=this.s.troopLevels?.[attacker.type]||1;
        value*=1+(level-1)*(D.troopUpgrades?.damagePerLevel?.[attacker.type]||0)
      }
      // Quality & Depth: troop level unlocks real battlefield traits, not only flat damage.
      const troopLevel=attacker.side==='p'?(this.s.troopLevels?.[attacker.type]||1):1;
      if(attacker.type==='pikes'&&target.type==='cavs')value*=troopLevel>=5?1.75:1.5;
      if(attacker.type==='bows'&&troopLevel>=3)value*=1.10;
      if(attacker.type==='bows'&&troopLevel>=5&&distance(attacker,target)>1)value*=1.15;
      if(attacker.type==='cavs'&&!counter&&attacker.attackRound!==b.round)value*=troopLevel>=5?1.45:1.25;
      if(attacker.type==='griffins'&&troopLevel>=3)value*=1.10;
      if(attacker.type==='griffins'&&troopLevel>=5)value*=1.10;
      if(attacker.type==='mages'&&troopLevel>=3)value*=1.15;
      if(attacker.type==='orcs'&&distance(attacker,target)<=1)value*=1.15;
      if(attacker.type==='wolves'&&attacker.qty>=4)value*=1.2;
      value*=counter?.55*(.85+this.random()*.25):.78+this.random()*.35;
      if(target.side==='p'){
        const defenceFactor=1+.04*h.def;
        value/=attacker.type==='mages'?1+(defenceFactor-1)*((attacker.side==='p'&&(this.s.troopLevels?.mages||1)>=5)?.55:.75):defenceFactor;
        value*=1-.1*rank(h,'resistance');
        if(this.s.build.citadel&&atTown(this.s,b.heroId))value*=.80
      }
      if(target.side==='p'){const tl=this.s.troopLevels?.[target.type]||1;if(tl>=3&&(target.type==='pikes'||target.type==='cavs'))value*=.90;}
      if(target.stone)value*=.72;
      if(target.defending)value*=.75;
      return Math.max(1,Math.round(value));
    }
    strike(a,t){
      const b=this.s.battle,amount=this.damage(a,t);
      a.attackRound=b.round;
      applyDamage(t,amount);
      this.log(stackDef(a).n+' наносят '+amount+' урона');
      if(t.hp>0&&distance(a,t)<=1&&stackDef(t).range===1&&stackDef(a).trait!=='noCounter'&&t.counterRound!==b.round){
        t.counterRound=b.round;
        const counter=this.damage(t,a,{
          counter:true
        }
        );
        applyDamage(a,counter);
        this.log(stackDef(t).n+' контратакуют: '+counter)
      }
    }
    battleAction(action,expectedBattleId,expectedTurnId,{
      enemy=false
    }
    ={
    }
    ){
      const b=this.s.battle,a=selectedStack(b);
      if(!b||b.id!==expectedBattleId||b.turnId!==expectedTurnId||!a||b.phase!==(enemy?'enemy':'player'))return this.fail('Этот ход уже обработан');
      if(action.type==='move'){
        const path=tacticalPath(b,a,action.x,action.y);
        if(!path?.length)return this.fail('Клетка недоступна');
        a.x=action.x;
        a.y=action.y
      }
      else if(action.type==='attack'){
        const target=b.stacks.find(st=>st.id===action.targetId&&st.hp>0);
        if(!target||target.side===a.side||distance(a,target)>stackDef(a).range)return this.fail('Цель вне дальности');
        this.strike(a,target)
      }
      else if(action.type==='defend')a.defending=true;
      else if(action.type==='wait')this.log(stackDef(a).n+' пропускают ход');
      else if(action.type==='spell'){
        const result=this.castSpell(action.spell,action.targetId);
        if(!result.ok)return this.fail(result.reason)
      }
      else return this.fail('Неизвестное действие');
      b.phase='resolving';
      this.commit();
      this.later(()=>this.advanceBattle(),100,b.id,b.turnId);
      return {
        ok:true
      }
      ;
    }
    spellInfo(kind,targetId){
      const b=this.s.battle,h=b&&this.s.heroes[b.heroId],a=selectedStack(b);
      if(!b||!h||!a||b.phase!=='player')return {
        ok:false,reason:'Дождитесь своего хода'
      }
      ;
      const costs={
        fire:4,lightning:6,stone:4,heal:5
      }
      ;
      if(!costs[kind])return {
        ok:false,reason:'Неизвестное заклинание'
      }
      ;
      if(h.mana<costs[kind])return {
        ok:false,reason:'Недостаточно маны'
      }
      ;
      let targets=b.stacks.filter(st=>st.hp>0&&st.side===(['fire','lightning'].includes(kind)?'e':'p'));
      if(kind==='heal')targets=targets.filter(st=>st.hp<st.qty*stackDef(st).hp);
      if(kind==='stone')targets=targets.filter(st=>!st.stone);
      if(!targets.length)return {
        ok:false,reason:kind==='heal'?'Все выжившие полностью здоровы':'Нет подходящей цели'
      }
      ;
      let target=targetId?targets.find(st=>st.id===targetId):null;
      if(targetId&&!target)return {
        ok:false,reason:'Цель недоступна'
      }
      ;
      if(!target){
        if(kind==='fire')targets.sort((a,c)=>a.qty-c.qty);
        if(kind==='lightning')targets.sort((a,c)=>stackDef(c).p-stackDef(a).p);
        target=(['heal','stone'].includes(kind)&&targets.includes(a)?a:targets[0])
      }
      return {
        ok:true,cost:costs[kind],target
      }
      ;
    }
    castSpell(kind,targetId){
      const info=this.spellInfo(kind,targetId);
      if(!info.ok)return info;
      const b=this.s.battle,h=this.s.heroes[b.heroId],t=info.target;
      h.mana-=info.cost;
      if(kind==='fire')applyDamage(t,30+h.magic*14);
      if(kind==='lightning'){const raw=48+h.magic*18,mitigation=['undead','undeadMage'].includes(stackDef(t).trait)?.75:1;applyDamage(t,Math.round(raw*mitigation));}
      if(kind==='stone')t.stone=true;
      if(kind==='heal')t.hp=Math.min(t.qty*stackDef(t).hp,t.hp+22+h.magic*10);
      this.log(({
        fire:'Огненный шар',lightning:'Молния',stone:'Каменная кожа',heal:'Исцеление'
      }
      )[kind]+': '+stackDef(t).n);
      return {
        ok:true
      }
    }
    enemyBattleAction(battleId,turnId){
      const b=this.s.battle,a=selectedStack(b);
      if(!b||b.id!==battleId||b.turnId!==turnId||b.phase!=='enemy'||a?.side!=='e')return;
      const targets=b.stacks.filter(st=>st.side==='p'&&st.hp>0).sort((u,v)=>distance(a,u)-distance(a,v)||u.hp-v.hp);
      const inRange=targets.find(t=>distance(a,t)<=stackDef(a).range);
      if(inRange){
        this.battleAction({
          type:'attack',targetId:inRange.id
        }
        ,b.id,b.turnId,{
          enemy:true
        }
        );
        return
      }
      let best=null;
      for(const t of targets){
        const path=search(a.x,a.y,(x,y)=>Math.abs(t.x-x)+Math.abs(t.y-y)<=stackDef(a).range&&!stackAt(b,x,y),(x,y)=>!stackAt(b,x,y),Infinity,8,5);
        if(path?.length&&(!best||path.length<best.length))best=path
      }
      if(best){
        const [x,y]=best[Math.min(stackDef(a).spd,best.length)-1];
        this.battleAction({
          type:'move',x,y
        }
        ,b.id,b.turnId,{
          enemy:true
        }
        )
      }
      else this.battleAction({
        type:'wait'
      }
      ,b.id,b.turnId,{
        enemy:true
      }
      );
    }
    syncArmy(b){
      const h=this.s.heroes[b.heroId];
      h.army=emptyArmy();
      for(const st of b.stacks)if(st.side==='p')h.army[st.type]+=st.qty
    }
    finishBattle(result){
      const b=this.s.battle;
      if(!b||!['win','loss','retreat'].includes(result))return this.fail('Нет активного боя');
      this.cancelTimer();
      const s=this.s,h=s.heroes[b.heroId];
      this.syncArmy(b);
      s.movement=null;
      s.battle=null;
      if(result==='win'){
        s.gold+=b.reward;
        this.addXP(b.heroId,b.xp);
        if(b.source.kind==='object')s.objects[b.source.id].status='defeated';
        else s.enemy.alive=false;
        if(b.boss){
          s.q.boss=true;
          s.enemy.alive=false;
          s.victoryPending=true
        }
        this.log('Победа! +'+b.reward+' золота, +'+b.xp+' опыта')
      }
      else{
        h.x=D.byId.castle.x;
        h.y=D.byId.castle.y;
        h.moves=0;
        if(result==='retreat')s.gold=Math.max(0,s.gold-350);
        this.log(result==='retreat'?'Отступление в Стальной Холм: −350 золота':'Поражение. Герой вернулся в Стальной Холм');
        reveal(s)
      }
      return this.commit();
    }
  }
  function ensure(condition,message){
    if(!condition)throw Error('Некорректное сохранение: '+message)
  }
  function integer(n,label,min=0,max=1e9){
    ensure(Number.isInteger(n)&&n>=min&&n<=max,label)
  }
  function validateState(s){
    ensure(s&&typeof s==='object'&&!Array.isArray(s),'формат');
    ensure(s.schemaVersion===D.SCHEMA,'неподдерживаемая версия схемы');
    for(const k of ['day','week','month','gold','wood','ore','gems','crystal','reputation','revision','nextId'])integer(s[k],k);
    integer(s.seed,'seed',1,4294967295);
    ensure(s.day>=1&&s.nextId>=1&&s.seed<=4294967295,'день или идентификатор');
    ensure(s.week===Math.floor((s.day-1)/7)+1&&s.month===Math.floor((s.day-1)/28)+1,'календарь');
    ensure(heroIds.includes(s.activeHero),'активный герой');
    ensure(s.heroes&&Object.keys(s.heroes).length===2,'реестр героев');
    for(const id of heroIds){
      const h=s.heroes?.[id];
      ensure(h&&h.id===id,'герой '+id);
      ensure(validCell(h.x,h.y)&&passable(h.x,h.y),'позиция '+id);
      for(const n of ['atk','def','magic','knowledge','level','xp','mana','manaMax','moves','maxMoves'])integer(h[n],id+'.'+n);
      ensure(h.level>=1&&h.level<=10000&&h.level===Math.floor(h.xp/100)+1,'уровень и опыт');ensure(h.level>=1&&h.mana<=h.manaMax&&h.moves<=h.maxMoves,'параметры героя');
      ensure(h.skills&&typeof h.skills==='object'&&!Array.isArray(h.skills),'навыки');
      for(const [k,r]of Object.entries(h.skills)){
        ensure(Object.hasOwn(D.skills,k),'неизвестный навык');
        integer(r,'ранг',0,D.skills[k].max)
      }
      ensure(h.maxMoves===12+2*rank(h,'logistics'),'максимум движения');
      ensure(Array.isArray(h.artifacts)&&h.artifacts.every(k=>Object.hasOwn(D.artifactDefs,k)),'артефакты');
      ensure(h.army&&typeof h.army==='object'&&Object.keys(h.army).length===troopTypes.length&&Object.keys(h.army).every(k=>troopTypes.includes(k)),'армия');
      for(const k of troopTypes)integer(h.army[k],'армия '+k,0,1000000);
      ensure(h.name===(id==='arden'?'Иван':'Варвара')&&h.img===(id==='arden'?'hero.jpg':'mage.jpg'),'личность героя')
    }
    ensure(s.objects&&Object.keys(s.objects).length===D.objects.length,'реестр объектов');
    for(const o of D.objects){
      const st=s.objects[o.id];
      ensure(st&&['active','completed','defeated'].includes(st.status),'состояние '+o.id);
      ensure([null,'player','enemy'].includes(st.owner),'владелец '+o.id);
      ensure(Object.keys(st).every(k=>['status','owner','visitedBy'].includes(k))&&(!st.visitedBy||heroIds.includes(st.visitedBy)),'поля объекта '+o.id)
    }
    ensure(s.enemy?.id==='morvein-field'&&typeof s.enemy.alive==='boolean'&&validCell(s.enemy.x,s.enemy.y)&&passable(s.enemy.x,s.enemy.y),'полевой противник');
    integer(s.enemy.power,'сила противника',1,10000);
    for(const k of Object.keys(D.builds))ensure(typeof s.build?.[k]==='boolean','здание '+k);
    ensure(s.troopLevels&&typeof s.troopLevels==='object','уровни войск');
    for(const k of troopTypes)integer(s.troopLevels[k],'уровень '+k,1,D.troopUpgrades.maxLevel);
    for(const k of troopTypes){
      integer(s.avail?.[k],'найм '+k,0,1000000);
      integer(s.garrison?.[k],'гарнизон '+k,0,1000000)
    }
    ensure(Array.isArray(s.seen)&&s.seen.length<=D.W*D.H&&new Set(s.seen).size===s.seen.length&&s.seen.every(k=>typeof k==='string'&&/^\d+,\d+$/.test(k)&&validCell(...k.split(',').map(Number))),'разведка');
    ensure(Array.isArray(s.logs)&&s.logs.length<=80&&s.logs.every(l=>typeof l==='string'&&l.length<=2000),'журнал');
    ensure(s.settings&&typeof s.settings.sound==='boolean','звук'); if(s.settings.music===undefined)s.settings.music=true; if(s.settings.musicVolume===undefined)s.settings.musicVolume=.32;
    ensure(s.q&&s.story,'кампания'); if(s.q.threat===undefined)s.q.threat=18;if(s.q.siege===undefined)s.q.siege=false;if(s.q.siegeWins===undefined)s.q.siegeWins=0;if(s.q.dungeonLevel===undefined)s.q.dungeonLevel=0;if(s.q.dungeonCleared===undefined)s.q.dungeonCleared=false;if(s.q.dungeonLoot===undefined)s.q.dungeonLoot=0;
    for(const k of ['wood','ore','gems','boss','tutorialMove','tutorialTown','altar','obelisk'])ensure(typeof s.q[k]==='boolean','задание '+k);
    for(const k of ['artifacts','villages','ruins'])integer(s.q[k],'счётчик '+k);
    for(const k of ['ivan','varvara','world'])integer(s.story[k],'сюжет '+k,0,2);
    ensure(typeof s.freePlay==='boolean'&&typeof s.victoryPending==='boolean','победа');
    ensure(Array.isArray(s.levelChoices)&&s.levelChoices.length<=10000,'повышения уровня');
    const choiceIds=new Set();
    for(let i=0;
    i<s.levelChoices.length;
    i++){
      const c=s.levelChoices[i];
      ensure(c&&typeof c.id==='string'&&!choiceIds.has(c.id)&&heroIds.includes(c.heroId),'выбор уровня');
      choiceIds.add(c.id);
      integer(c.level,'новый уровень',2,s.heroes[c.heroId].level);
      ensure(c.options===null&&i>0||Array.isArray(c.options)&&c.options.length>=1&&c.options.length<=2&&new Set(c.options).size===c.options.length&&c.options.every(k=>k==='training'||D.skills[k]&&rank(s.heroes[c.heroId],k)<D.skills[k].max),'набор навыков')
    }
    if(s.movement){
      const m=s.movement;
      ensure(!s.battle&&!s.levelChoices.length&&!s.victoryPending,'одновременные действия');
      ensure(typeof m.id==='string'&&heroIds.includes(m.heroId)&&Array.isArray(m.path)&&m.path.length<=D.W*D.H,'маршрут');
      ensure(m.targetId===null||!!D.byId[m.targetId]||m.targetId===s.enemy.id,'цель движения');
      let {
        x,y
      }
      =s.heroes[m.heroId];
      for(const p of m.path){
        ensure(Array.isArray(p)&&p.length===2&&validCell(...p)&&passable(...p)&&Math.abs(x-p[0])+Math.abs(y-p[1])===1,'шаг маршрута');
        [x,y]=p
      }
    }
    if(s.battle){
      const b=s.battle;
      ensure(typeof b.id==='string'&&heroIds.includes(b.heroId)&&['player','enemy','resolving'].includes(b.phase),'фаза боя');
      ensure(b.source&&(b.source.kind==='roaming'&&b.source.id===s.enemy.id||b.source.kind==='object'&&D.byId[b.source.id]?.t==='enemy'),'источник боя');
      ensure(b.source.kind==='roaming'?s.enemy.alive:s.objects[b.source.id].status==='active','уничтоженный источник боя');
      ensure(typeof b.name==='string'&&b.name.length<=200&&typeof b.boss==='boolean','описание боя');
      for(const k of ['reward','xp','round','turnId','index'])integer(b[k],'бой '+k);
      ensure(Array.isArray(b.stacks)&&b.stacks.length>0&&b.stacks.length<=10,'стеки');
      const ids=new Set(),occupied=new Set();
      for(const st of b.stacks){
        ensure(typeof st.id==='string'&&!ids.has(st.id)&&['p','e'].includes(st.side)&&!!stackDef(st),'идентификатор стека');
        ids.add(st.id);
        for(const k of ['qty','hp','initialQty','counterRound'])integer(st[k],'стек '+k,0,100000000);
        ensure(st.qty<=st.initialQty&&st.hp<=st.qty*stackDef(st).hp&&st.qty===Math.ceil(st.hp/stackDef(st).hp),'HP/численность');
        ensure(Number.isInteger(st.x)&&st.x>=0&&st.x<8&&Number.isInteger(st.y)&&st.y>=0&&st.y<5,'клетка стека');
        ensure(typeof st.defending==='boolean'&&typeof st.stone==='boolean','эффект');
        if(st.hp>0){
          ensure(!occupied.has(key(st.x,st.y)),'два стека в клетке');
          occupied.add(key(st.x,st.y))
        }
      }
      ensure(Array.isArray(b.order)&&b.order.length<=b.stacks.length&&new Set(b.order).size===b.order.length&&b.order.every(id=>ids.has(id))&&b.index<=b.order.length,'порядок боя');
      const sel=selectedStack(b);
      ensure(b.phase==='resolving'||sel&&sel.side===(b.phase==='player'?'p':'e'),'выбранный стек');
    }
    return s;
  }
  const LEGACY_KEYS=['ash-v8-6-5-kingdom','ash-v8-6-4-kingdom','ash-v8-6-3-kingdom','ash-v8-6-2-kingdom','ash-v8-6-1-kingdom','ash-v8-6-kingdom','ash-v8-5-2-kingdom','ash-v8-5-1-kingdom','ash-v8-5-kingdom','ash-v8-4-1-kingdom','ash-v8-4-kingdom','ash-v8-3-2-kingdom','ash-v8-3-kingdom','ash-v8-2-kingdom','ash-v8-1-dev-kingdom','ash-v8-dev-kingdom','ash-v7-5-dev-kingdom'];
  function migrateLegacy(q){
    ensure(q&&q.heroes?.arden&&q.objects&&typeof q.objects==='object'&&!Array.isArray(q.objects),'старый формат');
    const s=initialState(123456789),notes=[];
    for(const k of ['gold','wood','ore','gems','crystal','day','reputation'])if(q[k]!==undefined)s[k]=q[k];
    s.week=Math.floor((s.day-1)/7)+1;
    s.month=Math.floor((s.day-1)/28)+1;
    s.activeHero=heroIds.includes(q.activeHero)?q.activeHero:'arden';
    s.settings.sound=q.settings?.sound!==false;
    for(const id of heroIds){
      const old=q.heroes[id];
      if(!old)continue;
      const h=s.heroes[id];
      for(const k of ['x','y','atk','def','magic','knowledge','level','xp','mana','manaMax','moves'])if(old[k]!==undefined)h[k]=old[k];
      integer(h.level,'старый уровень',1,10000);integer(h.xp,'старый опыт',0,999999);const earnedLevel=Math.floor(h.xp/100)+1;ensure(h.level<=earnedLevel,'старый уровень превышает опыт');const missingLevels=earnedLevel-h.level;h.level=earnedLevel;h.atk+=missingLevels;h.def+=missingLevels;ensure(validCell(h.x,h.y),'старая позиция '+id);
      if(!passable(h.x,h.y)){
        [h.x,h.y]=nearestLand(h.x,h.y);
        notes.push(h.name+': позиция перенесена на берег из старой карты коллизий')
      }
      for(const [k,r]of Object.entries(old.skills||{
      }
      )){
        ensure(Object.hasOwn(D.skills,k),'неизвестный старый навык');
        ensure(r===true||Number.isInteger(r)&&r>=0,'ранг навыка');
        h.skills[k]=Math.min(Number(r),D.skills[k].max)
      }
      h.maxMoves=12+2*rank(h,'logistics');
      h.moves=Math.min(h.maxMoves,h.moves);
      h.artifacts=clone(old.artifacts||[]);
      for(const k of troopTypes)h.army[k]=old.army?.[k]??0;
    }
    for(const o of D.objects){
      const candidates=o.legacyKeys.map(k=>q.objects[k]).filter(v=>v&&v.t===o.t&&(o.t!=='event'||v.event===o.event));
      if(o.id==='white-springs'&&q.objects['3,8']?.t==='village')candidates.push(q.objects['3,8']);
      const old=candidates.find(v=>v.owner==='player')||candidates[0];
      if(old)s.objects[o.id]={
        status:'active',owner:old.owner||null
      }
      ;
      else s.objects[o.id].status=o.t==='enemy'?'defeated':'completed';
      if(o.id==='castle')s.objects[o.id]={
        status:'active',owner:'player'
      }
      ;
      if(o.id==='white-springs'&&!old)s.objects[o.id].status='active';
      if(o.id==='altar')s.objects[o.id].status=q.q?.altar?'completed':'active';
      if(o.id==='obelisk')s.objects[o.id].status=q.q?.obelisk?'completed':'active';
    }
    for(const k of Object.keys(s.build))s.build[k]=!!q.build?.[k];
    for(const k of troopTypes){
      s.avail[k]=q.avail?.[k]??0;
      s.garrison[k]=q.garrison?.[k]??0
    }
    for(const k of Object.keys(s.q))if(q.q?.[k]!==undefined)s.q[k]=q.q[k];
    for(const k of Object.keys(s.story))s.story[k]=Math.max(q.story?.[k]||0,k==='ivan'?q.q?.ivanStory||0:k==='varvara'?q.q?.varvaraStory||0:0);
    for(const chain of ['ivan','varvara','world'])for(let i=1;
    i<=s.story[chain];
    i++){
      const record=s.objects['event-'+chain+i];
      if(record)record.status='completed'
    }
    s.q.boss=!!q.q?.boss;
    if(s.q.boss)s.objects.necropolis.status='defeated';
    s.q.wood=s.q.wood||s.objects.sawmill.owner==='player';
    s.q.ore=s.q.ore||s.objects.ironmine.owner==='player';
    s.q.gems=s.q.gems||allObjects(s).some(o=>o.kind==='gems'&&o.owner==='player');
    s.seen=Array.isArray(q.seen)?[...new Set(q.seen.filter(k=>typeof k==='string'&&/^\d+,\d+$/.test(k)&&validCell(...k.split(',').map(Number))))]:[];
    s.logs=Array.isArray(q.logs)?q.logs.filter(l=>typeof l==='string').slice(0,80).map(l=>l.slice(0,2000)):[];
    if(q.enemy){
      ensure(typeof q.enemy.alive==='boolean'&&validCell(q.enemy.x,q.enemy.y),'старый полевой противник');
      s.enemy={
        ...s.enemy,...q.enemy,id:'morvein-field'
      }
      ;
      if(!passable(s.enemy.x,s.enemy.y))[s.enemy.x,s.enemy.y]=nearestLand(s.enemy.x,s.enemy.y)
    }
    if(s.q.boss)s.enemy.alive=false;
    s.freePlay=!!q.freePlay;
    // Old routes/pixel coordinates were not atomic: resume at a stable cell, never an unvalidated waypoint.
    if(q.battle){
      const old=q.battle,heroId=old.hero||s.activeHero,def=old.k?D.objects.find(o=>o.t==='enemy'&&o.legacyKeys.includes(old.k)):null;
      ensure(!old.k||def,'старый источник боя');
      const source=old.k?{
        kind:'object',id:def.id
      }
      :{
        kind:'roaming',id:s.enemy.id
      }
      ;
      if(def)s.objects[def.id].status='active';
      else s.enemy.alive=true;
      ensure(Array.isArray(old.stacks)&&old.stacks.length,'старые стеки');
      const stacks=old.stacks.map((st,i)=>{
        ensure(['p','e'].includes(st.side)&&!!stackDef(st),'старый тип стека');
        integer(st.qty,'старое количество');
        const hp=Math.max(0,Math.min(st.hp,st.qty*stackDef(st).hp));
        return {
          id:'migrated-stack-'+i,side:st.side,type:st.type,qty:Math.ceil(hp/stackDef(st).hp),hp,initialQty:Math.max(st.qty,st.side==='p'?s.heroes[heroId].army[st.type]:st.qty),x:st.x,y:st.y,defending:false,stone:st.side==='p'&&old.stoneSkin===st.type,counterRound:old.countered?.[st.side+':'+st.type+':'+old.round]?old.round:0
        }
      }
      );
      const chosen=stacks.find(st=>st.side===old.selected?.side&&st.type===old.selected?.type&&st.hp>0);
      const order=(old.order||[]).map(k=>stacks.find(st=>st.side===k.side&&st.type===k.type)?.id).filter(Boolean);
      s.battle={
        id:'migrated-battle',source,heroId,name:old.o?.name||def?.name||'Полевой отряд Морвейна',reward:old.o?.reward??def?.reward??1500,xp:old.o?.xp??def?.xp??140,boss:!!def?.boss,stacks,order,index:Math.min(old.turn||0,order.length),round:old.round||1,turnId:1,selectedId:chosen?.id||null,phase:chosen?(chosen.side==='p'?'player':'enemy'):'resolving'
      }
      ;
    }
    // Recover pending choices missing from the old format without applying level stats twice.
    for(const id of heroIds){
      const h=s.heroes[id],spent=Object.values(q.heroes[id]?.skills||{
      }
      ).reduce((a,b)=>a+Number(b),0),missing=Math.max(0,h.level-1-spent);
      for(let i=0;
      i<missing;
      i++)s.levelChoices.push({
        id:'recovered-'+id+'-'+i,heroId:id,level:h.level,options:null
      }
      )
    }
    reveal(s);
    const engine=new EngineForMigration(s);
    engine.prepare();
    if(notes.length)s.logs=[...notes.map(t=>'• '+t),...s.logs].slice(0,80);
    return validateState(s);
  }
  // Avoid constructing/resuming a live Engine while validating an imported snapshot.
  class EngineForMigration{
    constructor(s){
      this.s=s
    }
    prepare(){
      if(this.s.levelChoices.length){
        const h=this.s.heroes[this.s.levelChoices[0].heroId],ks=Object.keys(D.skills).filter(k=>rank(h,k)<D.skills[k].max);
        this.s.levelChoices[0].options=ks.length?ks.slice(0,2):['training']
      }
    }
  }
  const SAVE_KEY='ash-kingdom-full-fix',BACKUP_KEY=SAVE_KEY+':backup',RESET_KEY=SAVE_KEY+':lineage';
  function checksum(text){
    let n=2166136261;
    for(let i=0;
    i<text.length;
    i++){
      n^=text.charCodeAt(i);
      n=Math.imul(n,16777619)
    }
    return (n>>>0).toString(16)
  }
  function envelope(state){
    const payload=JSON.stringify(validateState(clone(state)));
    return JSON.stringify({
      format:'ash-save',schema:D.SCHEMA,version:D.VERSION,checksum:checksum(payload),payload
    }
    )
  }
  function normalizeCurrentState(s){
    if(s&&s.schemaVersion===D.SCHEMA){
      s.build=s.build||{};for(const k of Object.keys(D.builds))if(typeof s.build[k]!=='boolean')s.build[k]=false;
      s.troopLevels=s.troopLevels||{};for(const k of troopTypes)if(!Number.isInteger(s.troopLevels[k]))s.troopLevels[k]=1;
      s.gameVersion=D.VERSION;
    }
    return s
  }
  function decode(raw){
    const packet=JSON.parse(raw);
    if(packet?.format==='ash-save'){
      ensure(packet.schema===D.SCHEMA&&typeof packet.payload==='string'&&checksum(packet.payload)===packet.checksum,'контрольная сумма');
      return validateState(normalizeCurrentState(JSON.parse(packet.payload)))
    }
    if(packet?.schemaVersion)return validateState(normalizeCurrentState(packet));
    return migrateLegacy(packet)
  }
  class SaveRepository{
    constructor(storage){
      this.storage=storage;
      this.error=null;
      this.lastGood=null;
      this.blocked=false
    }
    load(){
      this.error=null;
      let lineage=false;
      try{
        lineage=!!this.storage.getItem(RESET_KEY)
      }
      catch(e){
        this.error='Хранилище недоступно: '+e.message;
        this.blocked=true;
        return {
          status:'error',error:this.error
        }
      }
      const keys=[SAVE_KEY,BACKUP_KEY,...(lineage?[]:LEGACY_KEYS)],errors=[];
      let found=false;
      for(const k of keys){
        let raw;
        try{
          raw=this.storage.getItem(k)
        }
        catch(e){
          errors.push(k+': '+e.message);
          continue
        }
        if(!raw)continue;
        found=true;
        try{
          const state=decode(raw);
          this.lastGood=envelope(state);
          this.blocked=false;
          this.error=errors.length?'Основной снимок повреждён. Загружена резервная/старая копия.':null;
          return {
            status:'loaded',state,source:k,recovered:errors.length>0,error:this.error
          }
        }
        catch(e){
          errors.push(k+': '+e.message)
        }
      }
      if(found||errors.length||lineage){
        this.blocked=true;
        this.error='Не удалось восстановить сохранение. Исходные данные сохранены. Можно импортировать резервную копию или явно начать новую игру.';
        return {
          status:'error',error:this.error,details:errors
        }
      }
      this.blocked=false;
      return {
        status:'empty'
      }
      ;
    }
    save(state){
      if(this.blocked)return {
        ok:false,error:this.error
      }
      ;
      try{
        const next=envelope(state),old=this.storage.getItem(SAVE_KEY);
        if(old){
          try{
            decode(old);
            this.storage.setItem(BACKUP_KEY,old)
          }
          catch(e){
            /* never replace a valid backup with a corrupt primary */
          }
        }
        this.storage.setItem(SAVE_KEY,next);
        this.storage.setItem(RESET_KEY,'1');
        this.lastGood=next;
        this.error=null;
        return {
          ok:true
        }
      }
      catch(e){
        this.error='Не удалось сохранить игру: '+e.message;
        return {
          ok:false,error:this.error
        }
      }
    }
    newGame(state){
      try{
        for(const k of [SAVE_KEY,BACKUP_KEY,...LEGACY_KEYS]){
          const raw=this.storage.getItem(k);
          if(raw)this.storage.setItem(SAVE_KEY+':archive:'+k,raw)
        }
        const next=envelope(state);
        this.storage.setItem(BACKUP_KEY,next);
        this.storage.setItem(SAVE_KEY,next);
        this.storage.setItem(RESET_KEY,'1');
        this.lastGood=next;
        this.blocked=false;
        this.error=null;
        return {
          ok:true
        }
      }
      catch(e){
        this.blocked=true;
        this.error='Не удалось создать резервную копию перед новой игрой: '+e.message;
        return {
          ok:false,error:this.error
        }
      }
    }
    export(state){
      return envelope(state)
    }
    import(raw){
      const state=decode(raw);
      return {
        state,raw:envelope(state)
      }
    }
  }
  return {
    D,Engine,SaveRepository,initialState,validateState,migrateLegacy,decode,envelope,LEGACY_KEYS,SAVE_KEY,BACKUP_KEY,RESET_KEY,clone,key,distance,passable,validCell,worldObject,allObjects,objectAt,isSeen,canInteract,guardAt,pathfind,pathToInteract,nearestLand,reveal,heroPower,income,atTown,rank,stackDef,stackAt,selectedStack,tacticalPath,search
  }
  ;
}
);
