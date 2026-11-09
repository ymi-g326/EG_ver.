import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './helpers/load-typescript.mjs';
import {fakeAudio} from './helpers/fake-audio.mjs';
const {EarthAudioEngine}=await import(moduleUrl(new URL('../lib/audio-engine.ts',import.meta.url)));
const {localFeatures}=await import(moduleUrl(new URL('../lib/local-journey.ts',import.meta.url)));

async function harness(recording,run){
 const fake=fakeAudio(),saved={AudioContext:globalThis.AudioContext,Audio:globalThis.Audio,window:globalThis.window,AudioWorkletNode:globalThis.AudioWorkletNode};
 let snapshots=0;
 class Context extends fake.AudioContext {audioWorklet=recording?{addModule:async()=>{}}:undefined;}
 class Recorder {
  constructor(){this.port={onmessage:null,close(){},postMessage:(message)=>{
   if(message.type==='enabled'&&message.value)this.port.onmessage?.({data:{type:'ready'}});
   if(message.type==='snapshot'){snapshots++;this.port.onmessage?.({data:{type:'snapshot',channels:[new Float32Array(8000).fill(.1)]}});}
  }};}
  connect(target){return target;}disconnect(){}
 }
 Object.assign(globalThis,{...fake,AudioContext:Context,AudioWorkletNode:recording?Recorder:undefined});
 const engine=new EarthAudioEngine(()=>localFeatures('forest-clear'),undefined,true);engine.setListeningMode('groove');
 try{engine.start();await Promise.resolve();fake.advance(.15);await run({engine,fake,snapshots:()=>snapshots});}
 finally{engine.destroy();Object.assign(globalThis,saved);}
}

test('holding a record silences ordinary music even when the hand stops; preview remains independent and follows volume',async()=>harness(false,({engine,fake})=>{
 engine.beginScratch(true);fake.advance(1);
 let state=engine.getDiagnostics();assert.equal(state.scratch.active,true);assert.equal(state.scratch.held,true);assert.equal(state.scratch.musicGain,0);
 engine.scratch(.8);fake.advance(.5);state=engine.getDiagnostics();
 assert.equal(state.scratch.active,true);assert.equal(state.scratch.musicGain,0);assert.ok(state.events.some(e=>e.instrument==='SCRATCH / PREVIEW forward'));
 assert.ok(engine.scratchPreviewOutput.gain.value>0,'preview bypasses the muted ordinary-music bus');
 engine.setVolume(0);assert.equal(engine.scratchPreviewOutput.gain.value,0);
 engine.setVolume(.5);assert.ok(engine.scratchPreviewOutput.gain.value>0);
 engine.endScratch();assert.equal(engine.getDiagnostics().scratch.musicGain,1);assert.equal(engine.getDiagnostics().scratch.held,false);
}));

test('captured mix crossfades back during inertia without replacing the held recording or changing base tempo',async()=>harness(true,({engine,fake,snapshots})=>{
 const baseline=engine.getTempoStatus().bpm,clock=engine.getPlaybackSeconds();
 engine.beginScratch(true);assert.equal(engine.getDiagnostics().scratch.capturedSeconds,1);assert.equal(snapshots(),1);
 engine.scratch(-.7);assert.ok(engine.getDiagnostics().events.some(e=>e.instrument==='SCRATCH / LIVE back'));
 fake.advance(.5);assert.equal(engine.getDiagnostics().scratch.musicGain,0);
 engine.releaseScratch();
 for(const strength of [.8,.4,.1,.01]){fake.advance(.1);engine.scratch(.05,strength);assert.ok(engine.getDiagnostics().scratch.musicGain>=0);assert.equal(engine.getDiagnostics().scratch.active,true);}
 assert.equal(snapshots(),1,'releasing the hand preserves the captured phrase during coasting');
 assert.ok(engine.getDiagnostics().scratch.musicGain>.9,'normal music returns before motion ends');
 assert.equal(engine.getDiagnostics().scratch.rate,1);
 assert.equal(engine.getTempoStatus().bpm,baseline);assert.ok(engine.getPlaybackSeconds()>clock+.8);
 fake.advance(.25);const state=engine.getDiagnostics();assert.equal(state.scratch.active,false);assert.equal(state.scratch.held,false);assert.equal(state.scratch.musicGain,1);assert.equal(state.playing,true);
}));

test('keyboard / demo gestures still time out, and pause or cancellation never leave ordinary music muted',async()=>harness(false,({engine,fake})=>{
 engine.scratch(.8);fake.advance(.25);assert.equal(engine.getDiagnostics().scratch.active,false);assert.equal(engine.getDiagnostics().scratch.musicGain,1);
 engine.beginScratch();fake.advance(.25);assert.equal(engine.getDiagnostics().scratch.active,false);
 engine.beginScratch(true);engine.stop();assert.equal(engine.getDiagnostics().scratch.held,false);assert.equal(engine.getDiagnostics().scratch.musicGain,1);assert.equal(engine.scratchPreviewOutput.gain.value,0);
 engine.start();engine.beginScratch(true);engine.endScratch();assert.equal(engine.getDiagnostics().scratch.active,false);assert.equal(engine.getDiagnostics().scratch.musicGain,1);
}));
