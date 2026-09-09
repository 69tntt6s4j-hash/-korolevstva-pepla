/* Navigation cells -> isometric scene coordinates -> camera -> CSS pixels. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.AshCamera=factory()})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
class Projection{
 constructor(width,height){this.width=width;this.height=height;this.origin=height*78;this.worldWidth=(width+height)*78;this.worldHeight=(width+height)*42+160}
 project(x,y,z=0){return {x:this.origin+(x-y)*.78,y:(x+y)*.42+100-z}}
 unproject(x,y){const a=(x-this.origin)/.78,b=(y-100)/.42;return {x:(a+b)/2,y:(b-a)/2}}
 cell(x,y){return this.project(x*100+50,y*100+50)}
 hit(x,y){const p=this.unproject(x,y);return {x:Math.floor(p.x/100),y:Math.floor(p.y/100)}}
}
class Camera{
 constructor({worldWidth=2600,worldHeight=2000,viewportWidth=390,viewportHeight=700,zoom=.7}={}){Object.assign(this,{x:0,y:0,zoom,worldWidth,worldHeight,viewportWidth,viewportHeight});this.target=null;this.ready=false;this.minZoom=.35;this.maxZoom=1.65}
 worldToScreen(x,y){if(typeof x==='object')({x,y}=x);return {x:(x-this.x)*this.zoom,y:(y-this.y)*this.zoom}}
 screenToWorld(x,y){if(typeof x==='object')({x,y}=x);return {x:this.x+x/this.zoom,y:this.y+y/this.zoom}}
 resize(w,h){if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return;const dx=(this.viewportWidth-w)/this.zoom/2,dy=(this.viewportHeight-h)/this.zoom*.56;if(this.ready){this.x+=dx;this.y+=dy;if(this.target){this.target.x+=dx;this.target.y+=dy}}this.viewportWidth=w;this.viewportHeight=h;this.clamp()}
 clamp(){this.zoom=clamp(Number.isFinite(this.zoom)?this.zoom:.7,this.minZoom,this.maxZoom);const w=this.viewportWidth/this.zoom,h=this.viewportHeight/this.zoom;this.x=w>=this.worldWidth?(this.worldWidth-w)/2:clamp(this.x,0,this.worldWidth-w);this.y=h>=this.worldHeight?(this.worldHeight-h)/2:clamp(this.y,0,this.worldHeight-h)}
 centerOn(x,y){if(typeof x==='object')({x,y}=x);this.x=x-this.viewportWidth/this.zoom/2;this.y=y-this.viewportHeight/this.zoom*.56;this.target=null;this.ready=true;this.clamp()}
 animateTo(x,y){if(typeof x==='object')({x,y}=x);this.target={x:x-this.viewportWidth/this.zoom/2,y:y-this.viewportHeight/this.zoom*.56}}
 update(dt){if(!this.target)return false;const t=1-Math.exp(-Math.min(dt,64)/140);this.x+=(this.target.x-this.x)*t;this.y+=(this.target.y-this.y)*t;if(Math.hypot(this.x-this.target.x,this.y-this.target.y)<.3)this.target=null;this.clamp();return !!this.target}
 zoomAt(zoom,sx=this.viewportWidth/2,sy=this.viewportHeight/2){const anchor=this.screenToWorld(sx,sy);this.zoom=clamp(zoom,this.minZoom,this.maxZoom);this.x=anchor.x-sx/this.zoom;this.y=anchor.y-sy/this.zoom;this.target=null;this.clamp()}
}
return {Camera,Projection};});
