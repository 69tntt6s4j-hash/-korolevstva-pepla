/* 8.8.2: Battle 2.0 — explicit initiative and unit traits. */
(function(root,factory){
  const data=factory();
  if(typeof module==='object'&&module.exports)module.exports=data;
  else root.AshData=data;
}
)(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const units={
    pikes:{
      n:'Копейщики',img:'pikeman.jpg',p:1.25,hp:9,spd:3,range:1,cost:360,qty:8,req:'barracks'
    }
    ,bows:{
      n:'Стрелки',img:'archer.jpg',p:2.45,hp:7,spd:3,range:4,cost:540,qty:5,req:'range'
    }
    ,cavs:{
      n:'Рыцари',img:'cavalier.jpg',p:5.4,hp:18,spd:5,range:1,cost:980,qty:2,req:'stable'
    }
    ,griffins:{
      n:'Грифоны',img:'griffin.jpg',p:8.8,hp:28,spd:6,range:1,cost:1450,qty:1,req:'griffin'
    }
    ,mages:{
      n:'Маги',img:'mage.jpg',p:10.2,hp:20,spd:4,range:5,cost:1650,qty:1,req:'mage'
    }
  }
  ;

  const battleTraits={
    pikes:{init:4,trait:'antiCav',traitText:'Стена копий: +50% урона рыцарям'},
    bows:{init:5,trait:'ranged',traitText:'Дальний бой: до 4 клеток без ответного удара'},
    cavs:{init:7,trait:'charge',traitText:'Натиск: +25% урона в первой атаке раунда'},
    griffins:{init:8,trait:'noCounter',traitText:'Налёт: противник не отвечает на атаку'},
    mages:{init:6,trait:'arcane',traitText:'Магический выстрел: игнорирует 25% защиты'},
    orcs:{init:3,trait:'brutal',traitText:'Свирепость: +15% урона в ближнем бою'},
    wolves:{init:7,trait:'pack',traitText:'Стая: +20% урона при численности 4+'},
    skeletons:{init:2,trait:'undead',traitText:'Нежить: 25% сопротивления магии'},
    necros:{init:5,trait:'undeadMage',traitText:'Нежить: 25% сопротивления магии · дальняя атака'}
  };
  const enemies={
    orcs:{
      n:'Орки',img:'orc.jpg',p:3.2,hp:14,spd:3,range:1
    }
    ,wolves:{
      n:'Волки',img:'wolf.jpg',p:4,hp:13,spd:5,range:1
    }
    ,skeletons:{
      n:'Скелеты',img:'skeleton.jpg',p:2.7,hp:10,spd:3,range:1
    }
    ,necros:{
      n:'Некроманты',img:'necromancer.jpg',p:9.5,hp:24,spd:3,range:5
    }
  }
  ;
  const builds={
    barracks:{
      n:'Казармы',cost:[800,3,0],req:null
    }
    ,range:{
      n:'Стрельбище',cost:[1000,4,0],req:'barracks'
    }
    ,stable:{
      n:'Конюшни',cost:[1500,3,3],req:'barracks'
    }
    ,griffin:{
      n:'Башня грифонов',cost:[2200,5,4],req:'stable'
    }
    ,mage:{
      n:'Гильдия магов',cost:[1800,4,3],req:'range'
    }
    ,market:{
      n:'Рынок',cost:[1200,2,2],req:null
    }
    ,citadel:{
      n:'Цитадель',cost:[2600,6,6],req:'barracks'
    }
  }
  ;
  const artifactDefs={
    sword:{
      n:'Меч Стража',icon:'🗡️',stat:'atk',v:2
    }
    ,shield:{
      n:'Щит Серого Льва',icon:'🛡️',stat:'def',v:2
    }
    ,crown:{
      n:'Корона Мудрых',icon:'👑',stat:'magic',v:2
    }
  }
  ;
  const baseObjects={
    '12,7':{
      t:'castle',img:'castle.jpg',owner:'player',label:'Стальной Холм'
    }
    ,'3,8':{
      t:'sawmill',img:'sawmill.jpg',owner:null,label:'Лесопилка'
    }
    ,'20,6':{
      t:'mine',img:'mine.jpg',kind:'ore',owner:null,label:'Железная шахта'
    }
    ,'8,3':{
      t:'enemy',img:'orc.jpg',name:'Орочий дозор',stacks:[['orcs',12],['wolves',5]],reward:700,xp:65
    }
    ,'12,14':{
      t:'chest',img:'chest.jpg'
    }
    ,'4,6':{
      t:'portal',img:'portal.jpg'
    }
    ,'22,11':{
      t:'enemy',img:'necromancer.jpg',name:'Армия мертвецов',stacks:[['skeletons',30],['necros',8]],reward:1850,xp:175,undead:true
    }
    ,'10,7':{
      t:'artifact',img:'chest.jpg',artifact:'sword'
    }
    ,'13,6':{
      t:'mine',img:'mine.jpg',kind:'gems',owner:null,label:'Шахта самоцветов'
    }
    ,'15,9':{
      t:'artifact',img:'chest.jpg',artifact:'shield'
    }
    ,'23,3':{
      t:'enemy',img:'necromancer.jpg',name:'Легион Морвейна',stacks:[['necros',6],['skeletons',22],['orcs',10]],reward:2400,xp:220,boss:true
    }
    ,'16,11':{
      t:'artifact',img:'chest.jpg',artifact:'crown'
    }
    , '18,3':{
      t:'enemy',img:'orc.jpg',name:'Разбойничий лагерь',stacks:[['orcs',18],['wolves',8]],reward:1200,xp:110
    }
    , '21,5':{
      t:'chest',img:'chest.jpg'
    }
    , '23,8':{
      t:'artifact',img:'chest.jpg',artifact:'crown'
    }
    , '18,10':{
      t:'mine',img:'mine.jpg',kind:'ore',owner:null,label:'Северная шахта'
    }
    , '20,12':{
      t:'sawmill',img:'sawmill.jpg',owner:null,label:'Дальняя лесопилка'
    }
    , '22,14':{
      t:'enemy',img:'skeleton.jpg',name:'Костяной караул',stacks:[['skeletons',28],['necros',5]],reward:1700,xp:155
    }
    , '24,16':{
      t:'chest',img:'chest.jpg'
    }
    , '17,16':{
      t:'portal',img:'portal.jpg'
    }
    , '14,15':{
      t:'enemy',img:'wolf.jpg',name:'Лесные хищники',stacks:[['wolves',20]],reward:1050,xp:95
    }
    , '11,16':{
      t:'chest',img:'chest.jpg'
    }
    , '9,18':{
      t:'artifact',img:'chest.jpg',artifact:'shield'
    }
    , '4,16':{
      t:'enemy',img:'orc.jpg',name:'Пепельные мародёры',stacks:[['orcs',22],['wolves',10]],reward:1450,xp:130
    }
    , '2,13':{
      t:'mine',img:'mine.jpg',kind:'gems',owner:null,label:'Хрустальный карьер'
    }
    , '6,12':{
      t:'chest',img:'chest.jpg'
    }
    , '19,18':{
      t:'enemy',img:'necromancer.jpg',name:'Чёрный ковен',stacks:[['necros',8],['skeletons',35]],reward:2600,xp:240
    }
    , '5,10':{
      t:'shrine',img:'portal.jpg',label:'Святилище ветров'
    }
    , '8,14':{
      t:'camp',img:'castle.jpg',label:'Наёмный лагерь'
    }
    , '16,6':{
      t:'caravan',img:'chest.jpg',label:'Купеческий караван'
    }
    , '12,18':{
      t:'trap',img:'chest.jpg',label:'Заброшенная повозка'
    }
    , '24,11':{
      t:'shrine',img:'portal.jpg',label:'Алтарь Севера'
    }
    , '15,13':{
      t:'camp',img:'castle.jpg',label:'Пограничный лагерь'
    }
    , '4,8':{
      t:'village',img:'castle.jpg',label:'Деревня Белые Ключи'
    }
    , '5,15':{
      t:'ruins',img:'castle.jpg',label:'Руины старого форта'
    }
    , '7,11':{
      t:'event',img:'chest.jpg',event:'ivan1',label:'След пропавшего отряда'
    }
    , '10,12':{
      t:'event',img:'portal.jpg',event:'varvara1',label:'Искажённый источник'
    }
    , '12,4':{
      t:'village',img:'castle.jpg',label:'Озёрный посад'
    }
    , '14,6':{
      t:'ruins',img:'castle.jpg',label:'Башня Серых Магов'
    }
    , '16,9':{
      t:'event',img:'chest.jpg',event:'ivan2',label:'Знамя павшего рыцаря'
    }
    , '17,13':{
      t:'event',img:'portal.jpg',event:'varvara2',label:'Осколок небесного кристалла'
    }
    , '19,7':{
      t:'village',img:'castle.jpg',label:'Каменный Брод'
    }
    , '21,10':{
      t:'ruins',img:'castle.jpg',label:'Разорённое аббатство'
    }
    , '23,12':{
      t:'event',img:'chest.jpg',event:'world1',label:'Посланник Некрополя'
    }
    , '6,18':{
      t:'village',img:'castle.jpg',label:'Портовый хутор'
    }
    , '13,17':{
      t:'ruins',img:'castle.jpg',label:'Храм Затонувших'
    }
    , '20,17':{
      t:'event',img:'portal.jpg',event:'world2',label:'Разлом Пепла'
    }
  }
  ;
  const VERSION='8.8.2', SCHEMA=1, W=26,H=20,WORLD_W=2600,WORLD_H=2000;
  const skills={
    logistics:{
      name:'Логистика',description:'+2 движения за ранг',max:3
    }
    , leadership:{
      name:'Лидерство',description:'+10% урона армии за ранг',max:3
    }
    , archery:{
      name:'Стрельба',description:'+15% урона стрелков за ранг',max:3
    }
    , wisdom:{
      name:'Мудрость',description:'+5 максимальной маны за ранг',max:3
    }
    , estates:{
      name:'Поместья',description:'+150 золота в день за ранг у каждого героя',max:3
    }
    , resistance:{
      name:'Сопротивление',description:'−10% входящего урона за ранг',max:3
    }
  }
  ;
  // Hand-reviewed coarse terrain layer over the unchanged 26×20 painted continent.
  // Forest/swamp/desert are walkable. Water and mountain interiors are not.
  const mountainRows=[ [0,1,2,3,4,5,6,7,12,18,23,24,25], [0,1,2,5,6,7,11,12,19,22,23], [0,1,5,6,7,20,22,23,25], [0,3,6,7,22,24,25], [4,5,7,18,21,22,23,24,25], [20,21,23,24,25], [21,23,24,25], [18,21,24,25], [23,25], [25], [6,25], [6,7,19,25], [0,1,6,7,25], [0,1,5,6,20,25], [5,6,7,8,16,17], [6,7,8,9,18], [10,11,13,15,16], [10,11,12,13,14,15,16], [11,12,13,14,15,16,17], [12,13,14,15,16,17,18,19,20] ];
  const waterRows=[ [22],[8,9,15,16,17],[11,13,15,16,17], [2,12,13,14,15,16,17],[1,2,8,9,12,16], [2,3,8,9,10,16,17],[4,5,6], [6,8],[8,9,10,17,18,19,20,21,22], [11,12,13,14,15,16],[13,14,15], [17,18],[18,20,21,23], [2,3,4,21,22,23,24],[0,1,2,3,24,25], [0,1,2],[0,1,2,3,4,5,6,7,8], [0,1,2,3,4,5,6,7,8,9],[0,1,2,3,4,5,6,7,8,9,10], [0,1,2,3,4,5,6,7,8,9,10,11] ];
  const bridges=[[11,5],[7,7],[16,8],[17,8],[16,10],[19,12],[3,15],[4,15],[5,15]];
  const terrain=Array.from({
    length:H
  }
  ,(_,y)=>Array.from({
    length:W
  }
  ,(_,x)=>mountainRows[y].includes(x)?'mountain':waterRows[y].includes(x)?'water':'land'));
  for(const [x,y]of bridges)terrain[y][x]='bridge';
  // Entrances and a coastal pass in mixed rock/road cells, reviewed against the painting.
  const passes=[[22,3],[21,6],[5,14],[6,14],[6,13]];
  for(const [x,y]of passes)terrain[y][x]='land';
  // Only generic icons that lay in water/solid mountains are relocated; landmarks stay fixed.
  const relocations={
    '4,6':[4,7],'15,9':[14,8],'9,18':[10,14],'7,11':[7,10], '2,13':[2,12],'4,16':[4,15],'6,18':[3,15],'11,16':[11,15], '13,17':[13,15],'12,18':[10,15],'20,12':[19,12],'23,12':[22,12]
  }
  ;
  const ids={
    '12,7':'castle','3,8':'sawmill','20,6':'ironmine','12,14':'treasure', '23,3':'necropolis','22,11':'deadarmy','4,8':'white-springs'
  }
  ;
  const legacyKeys={
    'castle':['1,1'],'sawmill':['3,3'],'ironmine':['6,2'], 'treasure':['11,2'],'necropolis':['12,11'],'deadarmy':['7,6']
  }
  ;
  const landmarkStyle={
    castle:{
      radius:135,offset:[24,-50]
    }
    ,sawmill:{
      radius:105,offset:[14,-30]
    }
    , ironmine:{
      radius:105,offset:[4,30]
    }
    ,treasure:{
      radius:90,offset:[-2,-10]
    }
    , necropolis:{
      radius:145,offset:[-10,-30]
    }
    ,deadarmy:{
      radius:115,offset:[-14,-30]
    }
  }
  ;
  const objects=Object.entries(baseObjects).map(([key,def])=>{
    const [x,y]=relocations[key]||key.split(',').map(Number);
    const id=ids[key]||(def.event?'event-'+def.event:'object-'+key.replace(',','-'));
    return {
      ...def,id,x,y,legacyKeys:[key,...(legacyKeys[id]||[])], ...(landmarkStyle[id]?{
        landmark:true,...landmarkStyle[id]
      }
      :{
        radius:44,offset:[0,0]
      }
      )
    }
    ;
  }
  );
  objects.push({
    id:'altar',x:7,y:12,t:'altar',label:'Алтарь магии',img:'portal.jpg',radius:100,offset:[4,-50],landmark:true,legacyKeys:[]
  }
  );
  objects.push({
    id:'obelisk',x:4,y:6,t:'obelisk',label:'Заброшенная башня',img:'castle.jpg',radius:90,offset:[18,-10],landmark:true,legacyKeys:[]
  }
  );
  const imageFiles=['ivan-rider.png','varvara-map.png','world-v6.jpg','hero.jpg','mage.jpg','castle.jpg','mine.jpg','sawmill.jpg','chest.jpg','portal.jpg','orc.jpg','wolf.jpg','necromancer.jpg','pikeman.jpg','archer.jpg','cavalier.jpg','griffin.jpg','skeleton.jpg','battlefield.jpg','city.jpg'];
  const byId=Object.fromEntries(objects.map(o=>[o.id,o]));
  const cellKey=(x,y)=>x+','+y;
  const cells=new Set();
  for(const o of objects){
    if(cells.has(cellKey(o.x,o.y)))throw Error('Duplicate object cell '+o.id);
    cells.add(cellKey(o.x,o.y));
  }
  function deepFreeze(o){
    for(const v of Object.values(o))if(v&&typeof v==='object')deepFreeze(v);
    return Object.freeze(o)
  }
  return deepFreeze({
    VERSION,SCHEMA,W,H,WORLD_W,WORLD_H,units,enemies,battleTraits,builds,skills,artifactDefs,objects,byId,terrain,bridges,passes,relocations,imageFiles
  }
  );
}
);
