/** Virtual Web Audio timing and connection lifecycle; no claim of acoustic playback. */
export function fakeAudio() {
 let now=0,nextId=1;
 const timers=new Map(),sources=new Set(),connections=new Set();
 class Param {value=0;setValueAtTime(v){this.value=v;}setTargetAtTime(v){this.value=v;}exponentialRampToValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}cancelScheduledValues(){}}
 class Node {
  constructor(){this.gain=new Param();this.frequency=new Param();this.detune=new Param();this.playbackRate=new Param();this.playbackRate.value=1;this.Q=new Param();this.threshold=new Param();this.knee=new Param();this.ratio=new Param();this.attack=new Param();this.release=new Param();this.listeners=new Map();}
  connect(target){connections.add(this);return target;}
  disconnect(){connections.delete(this);}
  addEventListener(type,fn){const all=this.listeners.get(type)??[];all.push(fn);this.listeners.set(type,all);}
 }
 class Source extends Node {
  stopAt=Infinity;ended=false;
  start(time){this.startAt=time;sources.add(this);if(this.buffer)this.stopAt=time+this.buffer.length/context.sampleRate;}
  stop(time=now){this.stopAt=Math.min(time,this.stopAt);}
  finish(){if(this.ended)return;this.ended=true;sources.delete(this);for(const fn of this.listeners.get('ended')??[])fn();}
 }
 class Context {
  state='running';sampleRate=8000;destination=new Node();
  get currentTime(){return now;}
  resume(){this.state='running';return Promise.resolve();}
  close(){this.state='closed';for(const s of [...sources])s.finish();return Promise.resolve();}
  createWaveShaper(){return new Node();}
  createGain(){return new Node();}createBiquadFilter(){return new Node();}createConvolver(){return new Node();}
  createDynamicsCompressor(){return new Node();}createMediaElementSource(){return new Node();}
  createAnalyser(){const n=new Node();n.getFloatTimeDomainData=a=>a.fill(0);return n;}
  createOscillator(){return new Source();}createBufferSource(){return new Source();}
  createBuffer(channels,length,rate){const data=Array.from({length:channels},()=>new Float32Array(Math.ceil(length)));return{length:Math.ceil(length),numberOfChannels:channels,sampleRate:rate,getChannelData:i=>data[i]};}
 }
 let context;
 class AudioContext extends Context{constructor(){super();context=this;}}
 class Audio {paused=true;readyState=4;error=null;duration=60;currentTime=0;constructor(file){if(!file.startsWith('/audio/earth/'))throw Error('Remote audio requested');}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}addEventListener(){}removeAttribute(){}load(){}}
 const window={setInterval(fn,ms){const id=nextId++;timers.set(id,{fn,ms,next:now+ms/1000,repeat:true});return id;},clearInterval(id){timers.delete(id);},setTimeout(fn,ms){const id=nextId++;timers.set(id,{fn,next:now+ms/1000,repeat:false});return id;},clearTimeout(id){timers.delete(id);}};
 function advance(seconds,step=.025){const target=now+seconds;while(now<target-1e-8){now=Math.min(target,now+step);for(const s of [...sources])if(s.stopAt<=now)s.finish();for(const [id,timer]of [...timers])if(timer.next<=now){if(timer.repeat)timer.next=now+timer.ms/1000;else timers.delete(id);timer.fn();}}}
 function jump(seconds){now+=seconds;for(const s of [...sources])if(s.stopAt<=now)s.finish();for(const [id,timer]of [...timers])if(timer.next<=now){if(timer.repeat)timer.next=now+timer.ms/1000;else timers.delete(id);timer.fn();}}
 return{AudioContext,Audio,window,advance,jump,closeContext:()=>context.close(),get sourceCount(){return sources.size;},get connectionCount(){return connections.size;},get timerCount(){return timers.size;},get now(){return now;}};
}
