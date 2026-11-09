import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './helpers/load-typescript.mjs';
import {fakeAudio} from './helpers/fake-audio.mjs';
const {LiveReturnIdle, liveReturnView, longitudeDelta} = await import(moduleUrl(new URL('../lib/live-return.ts',import.meta.url)));
const {EarthAudioEngine} = await import(moduleUrl(new URL('../lib/audio-engine.ts',import.meta.url)));
const {localFeatures} = await import(moduleUrl(new URL('../lib/local-journey.ts',import.meta.url)));

test('free view returns once after 10 seconds; LIVE updates do not repeatedly trigger the cue',()=>{
 const idle=new LiveReturnIdle();
 assert.equal(idle.shouldReturn(60000,true),false);
 idle.leaveLive(1000);
 assert.equal(idle.shouldReturn(10999,true),false);
 assert.equal(idle.shouldReturn(11000,true),true);
 idle.returned(11000);
 assert.equal(idle.shouldReturn(90000,true),false);
});

test('every real input restarts the deadline, and held or cancelled pointers cannot cause a mid-gesture return',()=>{
 const idle=new LiveReturnIdle();idle.leaveLive(0);idle.touch(9000);
 assert.equal(idle.shouldReturn(11000,true),false);
 idle.hold(1,10000);idle.hold(2,11000);
 assert.equal(idle.shouldReturn(100000,true),false);
 idle.release(1,100000);assert.equal(idle.shouldReturn(140000,true),false);
 idle.release(2,140000);assert.equal(idle.shouldReturn(149999,true),false);
 assert.equal(idle.shouldReturn(150000,true),true);
 idle.hold(1,150001);idle.releaseAll(160000);
 assert.equal(idle.shouldReturn(169999,true),false);assert.equal(idle.shouldReturn(170000,true),true);
});

test('LOCAL, hidden tabs, inspect, and unavailable LIVE data defer the deadline until enabled again',()=>{
 const idle=new LiveReturnIdle();idle.leaveLive(0);
 assert.equal(idle.shouldReturn(30000,false),false);
 assert.equal(idle.shouldReturn(90000,false),false);
 assert.equal(idle.shouldReturn(90001,true),false);
 assert.equal(idle.shouldReturn(99999,true),false);
 assert.equal(idle.shouldReturn(100000,true),true);
});

test('playing returns immediately after the final pointer is released, then only once',()=>{
 const idle=new LiveReturnIdle();idle.leaveLive(1000);idle.hold(1,1000);idle.hold(2,1010);
 assert.equal(idle.shouldReturn(60000,true,true),false,'holding the globe must block the return');
 idle.release(1,60000);assert.equal(idle.shouldReturn(60001,true,true),false);
 idle.release(2,60010);assert.equal(idle.shouldReturn(60010,true,true),true,'no ten-second deadline after release');
 idle.returned(60010);assert.equal(idle.shouldReturn(100000,true,true),false);
});

test('paused gestures keep the ten-second delay; starting playback in free view can return immediately',()=>{
 const idle=new LiveReturnIdle();idle.leaveLive(0);idle.hold(1,0);idle.release(1,1000);
 assert.equal(idle.shouldReturn(1000,true,false),false);
 assert.equal(idle.shouldReturn(10999,true,false),false);
 assert.equal(idle.shouldReturn(11000,true,false),true);
 idle.touch(11000);assert.equal(idle.shouldReturn(11001,true,false),false);
 assert.equal(idle.shouldReturn(11001,true,true),true);
});

test('held arrow keys, cancellation and focus loss cannot leave playback stuck away or return during input',()=>{
 const idle=new LiveReturnIdle();idle.leaveLive(0);idle.holdKey('ArrowRight',0);idle.holdKey('ArrowUp',10);
 assert.equal(idle.shouldReturn(50000,true,true),false);
 idle.releaseKey('ArrowRight',50000);assert.equal(idle.shouldReturn(50001,true,true),false);
 idle.releaseKey('ArrowUp',50010);assert.equal(idle.shouldReturn(50010,true,true),true);
 idle.returned(50010);idle.leaveLive(60000);idle.hold(1,60000);idle.holdKey('ArrowLeft',60000);
 idle.releaseAll(60010);assert.equal(idle.shouldReturn(60010,true,true),true);
 idle.returned(60010);idle.leaveLive(70000);idle.hold(2,70000);idle.release(2,70010);
 assert.equal(idle.shouldReturn(70010,true,true),true,'a cancelled pointer is also released');
});

test('disabled LIVE conditions still block immediate returns until the player is eligible',()=>{
 const idle=new LiveReturnIdle();idle.leaveLive(0);idle.hold(1,0);idle.release(1,10);
 for(const now of [10,10000,90000])assert.equal(idle.shouldReturn(now,false,true),false);
 assert.equal(idle.shouldReturn(90001,true,true),true);
 idle.returned(90001);assert.equal(idle.shouldReturn(90002,true,true),false);
});

test('explicitly choosing a place retains its listening interval; scratching there arms release return again',()=>{
 const idle=new LiveReturnIdle();idle.leaveLive(1000,false);
 assert.equal(idle.shouldReturn(1001,true,true),false);
 assert.equal(idle.shouldReturn(10999,true,true),false);
 assert.equal(idle.shouldReturn(11000,true,true),true);
 idle.touch(11000);idle.leaveLive(11010);idle.hold(1,11010);
 assert.equal(idle.shouldReturn(11011,true,true),false);
 idle.release(1,11020);assert.equal(idle.shouldReturn(11020,true,true),true);
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
