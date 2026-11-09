import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './helpers/load-typescript.mjs';
import {fakeAudio} from './helpers/fake-audio.mjs';
const {renderStyleFeedback,STYLE_FEEDBACK,styleWaveVector}=await import(moduleUrl(new URL('../lib/style-feedback.ts',import.meta.url)));
const {EarthAudioEngine}=await import(moduleUrl(new URL('../lib/audio-engine.ts',import.meta.url)));
const {localFeatures}=await import(moduleUrl(new URL('../lib/local-journey.ts',import.meta.url)));

test('style cues have bounded finite samples and silent edges, allowing GROOVE reflections to outlast the visual wave',()=>{
 for(const rate of [8000,44100,48000,96000])for(const style of ['ambient','groove']){
  const data=renderStyleFeedback(rate,style);
  assert.equal(data.length,Math.ceil(rate*STYLE_FEEDBACK[style].soundDurationMs/1000));
  assert.equal(data[0],0);assert.equal(data.at(-1),0);
  let peak=0,energy=0;for(const v of data){assert.ok(Number.isFinite(v));peak=Math.max(peak,Math.abs(v));energy+=v*v;}
  assert.ok(peak>.59&&peak<.601);assert.ok(Math.sqrt(energy/data.length)>.03);
 }
 for(const rate of [0,NaN,Infinity,4000,384000])assert.throws(()=>renderStyleFeedback(rate,'ambient'),RangeError);
});

function bandEnergy(data,rate,from,to){
 let energy=0;
 for(let f=from;f<=to;f+=10){
  const coefficient=2*Math.cos(2*Math.PI*f/rate);let a=0,b=0;
  for(const value of data){const next=value+coefficient*a-b;b=a;a=next;}
  energy+=a*a+b*b-coefficient*a*b;
 }
 return energy;
}
test('AMBIENT is a water-like pitched cue, while GROOVE carries a sustained low gravitational descent',()=>{
 const rate=8000,water=renderStyleFeedback(rate,'ambient'),quake=renderStyleFeedback(rate,'groove');
 assert.ok(bandEnergy(water,rate,250,700)>bandEnergy(water,rate,40,130)*20);
 assert.ok(bandEnergy(quake,rate,40,130)>bandEnergy(quake,rate,250,700)*20);
 const rms=(from,to)=>{const part=quake.slice(Math.floor(from*rate),Math.floor(to*rate));return Math.sqrt(part.reduce((sum,v)=>sum+v*v,0)/part.length);};
 assert.ok(rms(0,.05)<rms(.3,.6)*.15,'the gravity cue swells instead of starting with a click');
 assert.ok(rms(.9,1.1)>.03,'the low body remains audible into its longer tail');
 assert.ok(rms(1.65,2.05)>.005,'audible reflections continue after the 1.6-second visual has ended');
});

test('the displacement travels outward from the button, remains bounded and clears exactly at the ends',()=>{
 for(const style of ['ambient','groove']){
  assert.deepEqual(styleWaveVector(style,330,0,1000,0),{x:0,y:0});
  assert.deepEqual(styleWaveVector(style,330,0,1000,1),{x:0,y:0});
  assert.ok(Math.abs(styleWaveVector(style,330,0,1000,.25).x)>5);
  assert.ok(Math.abs(styleWaveVector(style,920,0,1000,.25).x)<1e-10,'a wave must not deform an area before reaching it');
  assert.ok(Math.max(...[880,890,900,910,920,930,940].map(x=>Math.abs(styleWaveVector(style,x,0,1000,.72).x)))>2,'the front later reaches the far side');
  for(let p=.01;p<1;p+=.03)for(let x=-1000;x<=1000;x+=100){
   const v=styleWaveVector(style,x,150,1200,p);assert.ok(Number.isFinite(v.x)&&Number.isFinite(v.y));
   const bound=style==='ambient'?19:36;
   assert.ok(Math.abs(v.x)<bound&&Math.abs(v.y)<bound);
  }
  assert.deepEqual(styleWaveVector(style,NaN,0,1000,.5),{x:0,y:0});
 }
 assert.notDeepEqual(styleWaveVector('ambient',330,0,1000,.25),styleWaveVector('groove',330,0,1000,.25));
});

test('style cues work while paused, follow volume during the cue, clean up rapid changes, and keep music running',()=>{
 const fake=fakeAudio(),saved={AudioContext:globalThis.AudioContext,Audio:globalThis.Audio,window:globalThis.window};Object.assign(globalThis,fake);
 const engine=new EarthAudioEngine(()=>localFeatures('forest-clear'),undefined,true);
 try{
  engine.setVolume(0);engine.listeningTransitionSound('groove');assert.equal(fake.sourceCount,0);assert.equal(engine.getDiagnostics().contextState,'未作成');
  engine.setVolume(.72);engine.listeningTransitionSound('ambient');assert.equal(fake.sourceCount,1);assert.equal(engine.getDiagnostics().playing,false);assert.equal(fake.timerCount,0);
  assert.equal(engine.transitionCue.level,STYLE_FEEDBACK.ambient.level);
  engine.setVolume(.4);assert.equal(engine.transitionCue.gain.gain.value,.4*STYLE_FEEDBACK.ambient.level);
  engine.setVolume(0);assert.equal(engine.transitionCue.gain.gain.value,0);
  fake.advance(1.5);assert.equal(fake.sourceCount,0);
  engine.setVolume(.72);engine.listeningTransitionSound('groove');fake.advance(1.7);
  assert.equal(fake.sourceCount,1,'the sound player must not truncate the reflection tail at the visual duration');
  fake.advance(1);assert.equal(fake.sourceCount,0);
  engine.setVolume(.72);const connections=fake.connectionCount;
  for(let i=0;i<30;i++){engine.listeningTransitionSound(i%2?'ambient':'groove');fake.advance(.03);assert.ok(fake.sourceCount<=1);}
  fake.advance(1.5);assert.equal(fake.sourceCount,0);assert.equal(fake.connectionCount,connections);
  engine.setListeningMode('groove');engine.start();fake.advance(.3);const clock=engine.getPlaybackSeconds(),bpm=engine.getTempoStatus().bpm;
  engine.listeningTransitionSound('ambient');fake.advance(1.5);assert.equal(engine.getDiagnostics().playing,true);assert.ok(engine.getPlaybackSeconds()>clock+1.4);assert.equal(engine.getTempoStatus().bpm,bpm);
  engine.destroy();assert.equal(fake.sourceCount,0);assert.equal(fake.timerCount,0);
 }finally{engine.destroy();Object.assign(globalThis,saved);}
});
