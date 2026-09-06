/* Clock-driven presentation and pointer gestures; no independent movement timer. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.AshControls=factory();
}
)(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  class MotionDriver{
    constructor(engine,duration=330){
      this.engine=engine;
      this.duration=duration;
      this.step=null
    }
    reset(){
      this.step=null
    }
    position(id){
      const h=this.engine.state.heroes[id],m=this.engine.state.movement,j=this.step;
      if(j&&m?.id===j.token&&j.heroId===id&&this.engine.idle())return {
        x:j.from.x+(j.to.x-j.from.x)*j.progress,y:j.from.y+(j.to.y-j.from.y)*j.progress
      }
      ;
      return {
        x:h.x*100+50,y:h.y*100+50
      }
    }
    frame(now){
      const s=this.engine.state,m=s.movement,h=m&&s.heroes[m.heroId];
      if(!m||!this.engine.idle()||!h||h.moves<=0||!m.path.length){
        this.step=null;
        return false
      }
      const [x,y]=m.path[0];
      if(!this.step||this.step.token!==m.id||this.step.to.x!==x*100+50||this.step.to.y!==y*100+50)this.step={
        token:m.id,heroId:m.heroId,from:{
          x:h.x*100+50,y:h.y*100+50
        }
        ,to:{
          x:x*100+50,y:y*100+50
        }
        ,start:now,progress:0
      }
      ;
      const j=this.step,t=Math.max(0,Math.min(1,(now-j.start)/this.duration));
      j.progress=1-(1-t)**2;
      if(t>=1){
        this.step=null;
        this.engine.movementStep(j.token)
      }
      return !!this.engine.state.movement&&this.engine.idle()&&this.engine.state.heroes[m.heroId].moves>0
    }
  }
  class PointerController{
    constructor(camera,{
      onTap=()=>{
      }
      ,onChange=()=>{
      }
      ,clamp=()=>{
      }
      ,threshold=6
    }
    ={
    }
    ){
      this.camera=camera;
      this.onTap=onTap;
      this.onChange=onChange;
      this.clamp=clamp;
      this.threshold=threshold;
      this.points=new Map();
      this.primary=null;
      this.pinch=null;
      this.suppress=false
    }
    down(id,x,y){
      this.points.set(id,{
        x,y
      }
      );
      if(this.points.size===1){
        this.primary={
          id,x,y,cx:this.camera.x,cy:this.camera.y,moved:false
        }
        ;
        this.suppress=false
      }
      else{
        this.suppress=true;
        this.primary=null;
        const p=[...this.points.values()];
        this.pinch={
          distance:Math.max(1,Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y)),zoom:this.camera.zoom,anchor:{
            x:(p[0].x+p[1].x)/2/this.camera.zoom+this.camera.x,y:(p[0].y+p[1].y)/2/this.camera.zoom+this.camera.y
          }
        }
      }
    }
    move(id,x,y){
      if(!this.points.has(id))return;
      this.points.set(id,{
        x,y
      }
      );
      if(this.points.size>=2&&this.pinch){
        const p=[...this.points.values()],dist=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);
        this.camera.zoom=Math.max(.38,Math.min(1.8,this.pinch.zoom*dist/this.pinch.distance));
        this.camera.x=this.pinch.anchor.x-(p[0].x+p[1].x)/2/this.camera.zoom;
        this.camera.y=this.pinch.anchor.y-(p[0].y+p[1].y)/2/this.camera.zoom;
        this.clamp();
        this.onChange();
        return
      }
      const p=this.primary;
      if(!p||p.id!==id)return;
      const dx=x-p.x,dy=y-p.y;
      if(Math.hypot(dx,dy)>this.threshold)p.moved=true;
      if(!p.moved)return;
      this.suppress=true;
      this.camera.x=p.cx-dx/this.camera.zoom;
      this.camera.y=p.cy-dy/this.camera.zoom;
      this.clamp();
      this.onChange()
    }
    up(id,x,y){
      if(!this.points.has(id))return;
      const tap=this.points.size===1&&this.primary?.id===id&&!this.primary.moved&&!this.suppress&&Math.hypot(x-this.primary.x,y-this.primary.y)<=this.threshold;
      this.points.delete(id);
      if(this.points.size===0){
        this.primary=null;
        this.pinch=null;
        this.suppress=false
      }
      else{
        this.suppress=true;
        this.pinch=null;
        this.primary=null
      }
      if(tap)this.onTap(x,y)
    }
    cancel(){
      this.points.clear();
      this.primary=null;
      this.pinch=null;
      this.suppress=true
    }
  }
  return {
    MotionDriver,PointerController
  }
  ;
}
);
