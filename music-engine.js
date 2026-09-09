/* Local, multivoice scored music. Audio scheduling never changes simulation state. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.AshMusic=factory()})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const THEMES={
 world:{bpm:78,root:50,mode:[0,2,3,5,7,9,10],chords:[0,5,3,4],melody:[7,9,10,14,12,10,9,7,5,7,9,10,7,5,3,2],bright:.55},
 city:{bpm:72,root:55,mode:[0,2,4,5,7,9,11],chords:[0,3,4,0],melody:[4,7,9,7,4,2,0,2,4,5,7,11,9,7,5,4],bright:.65},
 danger:{bpm:92,root:50,mode:[0,1,3,5,7,8,10],chords:[0,5,1,4],melody:[7,8,7,3,5,7,10,8,7,5,3,1,0,3,1,0],bright:.35},
 battle:{bpm:126,root:50,mode:[0,2,3,5,7,8,10],chords:[0,0,5,4],melody:[0,7,3,7,10,7,12,10,7,5,3,2,0,3,7,12],bright:.8},
 abyss:{bpm:64,root:45,mode:[0,1,3,5,7,8,10],chords:[0,5,3,1],melody:[12,10,7,8,7,3,5,1,0,3,7,10,8,7,3,1],bright:.25},
 siege:{bpm:138,root:43,mode:[0,1,3,5,6,8,10],chords:[0,1,5,4],melody:[0,6,7,6,3,6,10,12,10,8,6,3,1,3,6,0],bright:.9}
};
const frequency=m=>440*Math.pow(2,(m-69)/12);
class MusicEngine{
 constructor(audio,scheduler){this.audio=audio;this.scheduler=scheduler;this.timer=null;this.voices=new Set();this.retired=new Map();this.theme=null;this.bus=null;this.running=false;this.volume=.32;this.step=0;this.next=0}
 note(midi,when,duration,gain,wave='triangle',bus=this.bus){const a=this.audio;if(!a.createGain||!bus)return;try{const osc=a.createOscillator(),env=a.createGain(),filter=a.createBiquadFilter?.();osc.type=wave;osc.frequency.setValueAtTime(frequency(midi),when);env.gain.setValueAtTime(.00001,when);env.gain.exponentialRampToValueAtTime(gain,when+.035);env.gain.exponentialRampToValueAtTime(.00001,when+duration);if(filter){filter.type='lowpass';filter.frequency.value=wave==='sawtooth'?1100:3500;osc.connect(filter);filter.connect(env)}else osc.connect(env);env.connect(bus);this.voices.add(osc);osc.onended=()=>{this.voices.delete(osc);osc.disconnect();env.disconnect();filter?.disconnect()};osc.start(when);osc.stop(when+duration+.06)}catch(e){}}
 pulse(time,strong){this.note(strong?30:42,time,.12,strong?.025:.011,'sine');this.note(95,time+.015,.04,.0015,'square')}
 playStep(theme,time){const i=this.step++,bar=Math.floor(i/8),degree=theme.chords[bar%4],chord=theme.mode[degree],half=30/theme.bpm,variation=Math.floor(i/32)%2,melody=theme.melody[(i+variation*4)%theme.melody.length];
 // melody, held triad, bass and picked arpeggio have separate envelopes/timbres.
 this.note(theme.root+12+melody,time,half*.9,.012*(i%8===0?1.15:1),'triangle');
 if(i%8===0){for(const interval of [0,theme.mode[(degree+2)%7]+((degree+2)>=7?12:0)-chord,7])this.note(theme.root+chord+interval,time,half*7.7,.0033,'sawtooth')}
 if(i%4===0)this.note(theme.root-12+chord,time,half*3.4,.016,'triangle');
 this.note(theme.root+12+chord+[0,7,12,7][i%4],time+half*.25,half*.65,.0045,'sine');
 if(theme.bpm>90)this.pulse(time,i%4===0);if(i%16===15)this.note(theme.root+24+chord,time,half*1.7,.003,'sine')
 }
 set(mode,enabled,volume=.32){this.volume=Math.max(0,Math.min(1,volume));if(!enabled){this.stop();return}if(this.audio.state!=='running')return;if(this.theme===mode&&this.running){this.bus?.gain.setTargetAtTime?.(this.volume,this.audio.currentTime,.18);return}const a=this.audio;try{if(this.bus){const old=this.bus;old.gain.setTargetAtTime(0,a.currentTime,.35);this.retired.set(old,this.scheduler.set(()=>{old.disconnect();this.retired.delete(old)},2200))}this.bus=a.createGain();this.bus.gain.setValueAtTime(0,a.currentTime);this.bus.gain.linearRampToValueAtTime(this.volume,a.currentTime+1.2);this.bus.connect(a.destination)}catch(e){return}this.theme=THEMES[mode]?mode:'world';this.step=0;this.next=a.currentTime+.04;this.running=true;if(this.timer)this.scheduler.clear(this.timer);this.tick()}
 tick(){if(!this.running)return;const theme=THEMES[this.theme],a=this.audio;while(this.next<a.currentTime+.2){this.playStep(theme,this.next);this.next+=30/theme.bpm}this.timer=this.scheduler.set(()=>this.tick(),90)}
 stop(){this.running=false;for(const [bus,timer]of this.retired){this.scheduler.clear(timer);try{bus.disconnect()}catch(e){}}this.retired.clear();if(this.timer)this.scheduler.clear(this.timer);this.timer=null;for(const voice of this.voices)try{voice.stop()}catch(e){}this.voices.clear();try{this.bus?.disconnect()}catch(e){}this.bus=null;this.theme=null}
}
return {MusicEngine,THEMES,frequency};});
