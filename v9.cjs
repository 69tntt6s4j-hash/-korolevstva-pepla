const assert=require('assert');const C=require('../game-core.js');
let passed=0;function t(n,f){try{f();passed++;console.log('PASS',n)}catch(e){console.error('FAIL',n,e.message);process.exitCode=1}}
t('9.0 state validates',()=>{const s=C.validateState(C.initialState(9));assert.equal(s.gameVersion,C.D.VERSION);assert.equal(s.q.threat,18);assert.equal(s.settings.music,true)});
t('Abyss cave exists',()=>{assert.equal(C.D.byId['abyss-cave'].t,'cave');assert(C.passable(18,13))});
t('Threat grows on enemy world turn',()=>{const e=new C.Engine({state:C.initialState(1)}),v=e.s.q.threat;e.enemyWorldTurn();assert(e.s.q.threat>v)});
t('Enemy captures player economy',()=>{const e=new C.Engine({state:C.initialState(1)}),o=C.D.byId.sawmill;e.s.objects.sawmill.owner='player';e.s.enemy.x=o.x;e.s.enemy.y=o.y+1;e.enemyWorldTurn();assert.equal(e.s.objects.sawmill.owner,'enemy')});
t('Citadel improves siege defense',()=>{const e=new C.Engine({state:C.initialState(1)}),c=C.D.byId.castle;e.s.enemy.x=c.x+1;e.s.enemy.y=c.y;e.s.enemy.power=1;e.s.build.barracks=true;e.s.build.citadel=true;e.s.garrison.pikes=100;e.enemyWorldTurn();assert.equal(e.s.q.siegeWins,1);assert.equal(e.s.q.siege,false)});
t('Dungeon has three advancing stages and time passes',()=>{const e=new C.Engine({state:C.initialState(1)});e.s.heroes.arden.army.pikes=500;const d=e.s.day;assert(e.dungeonEncounter('arden').ok);assert(e.dungeonEncounter('arden').ok);assert(e.dungeonEncounter('arden').ok);assert.equal(e.s.q.dungeonLevel,3);assert(e.s.q.dungeonCleared);assert.equal(e.s.day,d+3)});
t('Dungeon weak-army gate works',()=>{const e=new C.Engine({state:C.initialState(1)});for(const k of Object.keys(C.D.units))e.s.heroes.arden.army[k]=0;assert(!e.dungeonEncounter('arden').ok)});
t('Dungeon boss reduces threat',()=>{const e=new C.Engine({state:C.initialState(1)});e.s.heroes.arden.army.pikes=500;e.s.q.threat=100;e.dungeonEncounter('arden');e.dungeonEncounter('arden');e.dungeonEncounter('arden');assert(e.s.q.threat<100)});
t('9.0 state round-trips save envelope',()=>{const s=C.initialState(1);s.q.threat=77;const r=C.decode(C.envelope(s));assert.equal(r.q.threat,77);assert.equal(r.gameVersion,C.D.VERSION)});
console.log(JSON.stringify({total:9,passed}));
