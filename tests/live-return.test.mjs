import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './helpers/load-typescript.mjs';
import {fakeAudio} from './helpers/fake-audio.mjs';
const {LiveReturnIdle, liveReturnView, longitudeDelta} = await import(moduleUrl(new URL('../lib/live-return.ts',import.meta.url)));
const {EarthAudioEngine} = await import(moduleUrl(new URL('../lib/audio-engine.ts',import.meta.url)));
const {localFeatures} = await import(moduleUrl(new URL('../lib/local-journey.ts',import.meta.url)));

test('starting at a chosen place pins it; scratching arms an immediate release return',()=>{
 const idle=new LiveReturnIdle();idle.leaveLive(0,false);
 assert.equal(idle.shouldReturn(60000,true,true),false);
 idle.leaveLive(61000,true);idle.hold(1,61000);
 assert.equal(idle.shouldReturn(61001,true,true),false);
 idle.release(1,62000);assert.equal(idle.shouldReturn(62000,true,true),true);
 idle.returned(62000);assert.equal(idle.shouldReturn(100000,true,true),false);
});

test('paused globe never auto returns, including after an armed scratch',()=>{
 const idle=new LiveReturnIdle();idle.leaveLive(0);
 assert.equal(idle.shouldReturn(60000,true,false),false);
});

test('all pointers and keys must be released; disabled or hidden views defer return',()=>{
 const idle=new LiveReturnIdle();idle.leaveLive(0);idle.hold(1,0);idle.holdKey('ArrowRight',0);
 idle.release(1,10);assert.equal(idle.shouldReturn(10,true,true),false);
 idle.releaseKey('ArrowRight',20);assert.equal(idle.shouldReturn(20,false,true),false);
 assert.equal(idle.shouldReturn(21,true,true),true);
 idle.hold(2,30);idle.releaseAll(40);assert.equal(idle.shouldReturn(40,true,true),true);
});

test('return animation takes the short date-line path and ends at the latest satellite position',()=>{
 const from={latitude:20,longitude:179};
 const start=liveReturnView(from,{latitude:-10,longitude:-179},0);
 assert.deepEqual(start,from);
 const middle=liveReturnView(from,{latitude:-10,longitude:-179},.5);
 assert.ok(Math.abs(longitudeDelta(from.longitude,middle.longitude))<2);
 assert.ok(middle.latitude<20&&middle.latitude>-10);
 assert.deepEqual(liveReturnView(from,{latitude:-11,longitude:-178.5},1),{latitude:-11,longitude:-178.5});
 for(const t of [-1,0,.01,.5,.99,1,2]){
  const view=liveReturnView(from,{latitude:90,longitude:181},t);
  assert.ok(Math.abs(view.longitude)<=180&&Math.abs(view.latitude)<=75);
 }
});

test('the quiet gravity return never starts a paused/muted app, is rate-limited, and cleans up its sources',()=>{
 const fake=fakeAudio(),saved={AudioContext:globalThis.AudioContext,Audio:globalThis.Audio,window:globalThis.window};
 Object.assign(globalThis,fake);
 const engine=new EarthAudioEngine(()=>localFeatures('forest-clear'),undefined,true);
 try{
  engine.liveReturnSound();assert.equal(fake.sourceCount,0);
  engine.setListeningMode('ambient');engine.start();engine.setVolume(0);
  engine.liveReturnSound();assert.equal(fake.sourceCount,0);
  engine.setVolume(.72);engine.liveReturnSound();
  const cues=()=>engine.getDiagnostics().events.filter(e=>e.instrument==='LIVE RETURN / GRAVITY');
  assert.equal(cues().length,1);assert.equal(cues()[0].duration,4.2);assert.ok(cues()[0].level<=.15);
  for(let i=0;i<100;i++)engine.liveReturnSound();assert.equal(cues().length,1);
  fake.advance(4.4);engine.liveReturnSound();assert.equal(cues().length,2);
  engine.stop();const count=fake.sourceCount;engine.liveReturnSound();assert.equal(fake.sourceCount,count);
  fake.advance(12);assert.equal(engine.getDiagnostics().transport.activeSources,0);
 }finally{engine.destroy();Object.assign(globalThis,saved);}
});
