'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),refs=new Map(),dynamic=[];
function add(raw,source){raw=raw.trim();if(!raw||/^(?:https?:|data:|blob:|#|app:)/i.test(raw))return;if(/[+{}<>]/.test(raw)||raw.includes("'")){dynamic.push({source,reference:raw});return}let clean=decodeURIComponent(raw.split(/[?#]/)[0]);if(!/\.(?:png|jpe?g|webp|svg|gif|ico|css|js|webmanifest|woff2?|mp3|ogg|wav)$/i.test(clean))return;let rel=path.posix.normalize(path.posix.join(source.startsWith('qa/')?'':path.posix.dirname(source),clean));if(!refs.has(rel))refs.set(rel,[]);refs.get(rel).push(source)}
for(const name of fs.readdirSync(root).filter(n=>/\.(html|css|js|webmanifest)$/.test(n)).concat('qa/visual.html')){const text=fs.readFileSync(path.join(root,name),'utf8');for(const m of text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi))add(m[1],name);for(const m of text.matchAll(/url\(\s*["']?([^\s)'";]+)["']?\s*\)/gi))add(m[1],name);for(const m of text.matchAll(/["']([^"'\n]+\.(?:png|jpe?g|webp|svg|gif|ico|woff2?|mp3|ogg|wav))["']/gi))add(m[1],name)}
for(const f of require('../game-data.js').assets||[])add(typeof f==='string'?f:f.src,'game-data.js');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8').match(/const FILES=(\[[^;]+\])/)[1];for(const f of JSON.parse(sw.replace(/'/g,'"')))add(f,'sw.js');
for(const f of ['assets/world-sprites.png','assets/actors-v2.png','assets/terrain-materials.png'])assert(refs.has(f));
function exact(rel){let current=root;for(const part of rel.split('/')){if(part==='..'||!fs.readdirSync(current).includes(part))return false;current=path.join(current,part)}return fs.statSync(current).isFile()}
const results=[...refs].sort().map(([file,sources])=>({file,sources:[...new Set(sources)],exists:exact(file)})),failed=results.filter(r=>!r.exists);
fs.writeFileSync(path.join(root,'qa/asset-integrity.json'),JSON.stringify({total:results.length,passed:results.length-failed.length,failed:failed.length,caseSensitive:true,dynamicReferencesNote:'Dynamic UI image paths are additionally covered through data catalogs and browser loaded-image checks.',results},null,2));
assert.equal(failed.length,0,JSON.stringify(failed));console.log(JSON.stringify({assetReferences:results.length,passed:results.length,failed:0}));
