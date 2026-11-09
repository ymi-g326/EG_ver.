import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './helpers/load-typescript.mjs';
import {fakeAudio} from './helpers/fake-audio.mjs';
const {EarthAudioEngine}=await import(moduleUrl(new URL('../lib/audio-engine.ts',import.meta.url)));
const {LocalJourney,localFeatures,sceneRemaining}=await import(moduleUrl(new URL('../lib/local-journey.ts',import.meta.url)));
function harness(){const fake=fakeAudio(),saved={AudioContext:globalThis.AudioContext,Audio:globalThis.Audio,window:globalThis.window};Object.assign(globalThis,fake);return{fake,restore(){Object.assign(globalThis,saved);}};}

test('queued scenery changes on the bar with new features, while paused changes are immediate and the clock stays frozen',()=>{
 const {fake,restore}=harness();let f=localFeatures('forest-clear'),applied=0;const engine=new EarthAudioEngine(()=>f,undefined,true);
 try {
  engine.start();fake.advance(.7);engine.queueSceneChange(()=>{f=localFeatures('sea-cloudy');applied++;});
  fake.advance(.3);assert.equal(applied,0);fake.advance(3);assert.equal(applied,1);
  const d=engine.getDiagnostics();assert.equal(d.frame.source,'local');assert.equal(d.frame.profile,'ocean');assert.equal(d.frame.tonality,'minor');assert.equal(d.transport.sceneChanges,1);
  assert.ok(d.events.some(e=>e.instrument==='海の水滴・泡'));
  engine.stop();const clock=engine.getPlaybackSeconds();fake.advance(30);assert.equal(engine.getPlaybackSeconds(),clock);
  engine.queueSceneChange(()=>{f=localFeatures('forest-clear');applied++;});assert.equal(applied,2);
  engine.start();fake.advance(1);assert.ok(engine.getPlaybackSeconds()>clock);
 }finally{engine.destroy();restore();}
});

test('delayed callbacks resync instead of playing a burst of stale notes; teardown clears pending callbacks',()=>{
 const {fake,restore}=harness();const engine=new EarthAudioEngine(()=>localFeatures('forest-clear'),undefined,true);let applied=0;
 try{engine.start();fake.advance(1);fake.jump(60);const d=engine.getDiagnostics();assert.equal(d.transport.resyncs,1);assert.ok(d.transport.activeSources<30);engine.queueSceneChange(()=>applied++);engine.destroy();fake.advance(10);assert.equal(applied,0);assert.equal(fake.timerCount,0);assert.equal(fake.sourceCount,0);}
 finally{engine.destroy();restore();}
});

test('two virtual hours of automatic transitions keep sources, connections, caches and event history bounded',()=>{
 const {fake,restore}=harness();let seed=19;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 const journey=new LocalJourney(random);let scene=journey.next(),start=0,pending=false,peakSources=0,peakConnections=0;
 const engine=new EarthAudioEngine(()=>scene.features,undefined,true);
 try{
  engine.start();
  for(let second=0;second<7200;second++){
   fake.advance(1,.05);
   if(!pending&&sceneRemaining(scene,engine.getPlaybackSeconds(),start)<=0){pending=true;const next=journey.next();engine.queueSceneChange(()=>{scene=next;start=engine.getPlaybackSeconds();pending=false;});}
   const d=engine.getDiagnostics();peakSources=Math.max(peakSources,d.transport.activeSources);peakConnections=Math.max(peakConnections,fake.connectionCount);
   assert.ok(d.transport.activeSources<60);assert.ok(d.transport.themeBuffers<=48);assert.ok(d.events.length<=64);assert.ok(fake.connectionCount<240);
  }
  const d=engine.getDiagnostics();assert.ok(d.transport.playedSeconds>7199);assert.ok(d.transport.sceneChanges>70);assert.equal(d.transport.resyncs,0);
  console.log(JSON.stringify({virtualSeconds:d.transport.playedSeconds,sceneChanges:d.transport.sceneChanges,peakSources,peakConnections,themeBuffers:d.transport.themeBuffers}));
 }finally{engine.destroy();restore();}
});


test('a closed audio device can be reconnected without losing the local playlist clock',()=>{
 const {fake,restore}=harness();const engine=new EarthAudioEngine(()=>localFeatures('forest-clear'),undefined,true);
 try{engine.start();fake.advance(2);const clock=engine.getPlaybackSeconds();fake.closeContext();assert.equal(engine.getDiagnostics().contextState,'closed');engine.start();fake.advance(1);assert.equal(engine.getDiagnostics().contextState,'running');assert.ok(engine.getPlaybackSeconds()>clock);}
 finally{engine.destroy();restore();}
});
