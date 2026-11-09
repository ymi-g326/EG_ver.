import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './helpers/load-typescript.mjs';
import {fakeAudio} from './helpers/fake-audio.mjs';
const {renderViewTransitionSound,VIEW_TRANSITION_MS}=await import(moduleUrl(new URL('../lib/view-transition-sound.ts',import.meta.url)));
const {EarthAudioEngine}=await import(moduleUrl(new URL('../lib/audio-engine.ts',import.meta.url)));
const {localFeatures}=await import(moduleUrl(new URL('../lib/local-journey.ts',import.meta.url)));

test('view cue spans the wipe, has finite bounded samples, three audible rasps and silent edges / swap',()=>{
 for(const rate of [8000,44100,48000,96000])for(const direction of [true,false]){
  const data=renderViewTransitionSound(rate,direction);
  assert.equal(data.length,Math.ceil(rate*VIEW_TRANSITION_MS/1000));
  assert.ok(data[0]===0&&data.at(-1)===0);
  let peak=0;for(const value of data){assert.ok(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));}assert.ok(peak<=.681&&peak>.67);
  for(const [start,end] of [[.05,.14],[.26,.33],[.5,.68]]){
   const part=data.slice(Math.floor(start*rate),Math.floor(end*rate));
   const rms=Math.sqrt(part.reduce((n,v)=>n+v*v,0)/part.length);assert.ok(rms>.1);
  }
  for(const [start,end] of [[0,.015],[.18,.23],[.36,.44],[.73,.759]])assert.ok(data.slice(Math.floor(start*rate),Math.floor(end*rate)).every(v=>v===0));
 }
 assert.notDeepEqual(renderViewTransitionSound(44100,true),renderViewTransitionSound(44100,false));
 for(const rate of [0,NaN,Infinity,4000,384000])assert.throws(()=>renderViewTransitionSound(rate,true));
});

test('switch audio works with music paused, respects mute, releases sources and never starts transport',()=>{
 const fake=fakeAudio(),saved={AudioContext:globalThis.AudioContext,Audio:globalThis.Audio,window:globalThis.window};Object.assign(globalThis,fake);
 const notes=[];const engine=new EarthAudioEngine(()=>localFeatures('forest-clear'),event=>notes.push(event),true);
 try{
  engine.setVolume(0);engine.viewTransitionSound(true);assert.equal(fake.sourceCount,0);assert.equal(engine.getDiagnostics().contextState,"未作成");
  engine.setVolume(.72);engine.viewTransitionSound(true);assert.equal(fake.sourceCount,1);assert.equal(engine.getDiagnostics().playing,false);assert.equal(fake.timerCount,0);assert.equal(notes.length,0);
  fake.advance(.8);assert.equal(fake.sourceCount,0);assert.equal(engine.getPlaybackSeconds(),0);
  const connections=fake.connectionCount;
  engine.viewTransitionSound(false);fake.advance(.8);assert.equal(fake.sourceCount,0);assert.equal(fake.connectionCount,connections);
  engine.start();fake.advance(.3);const clock=engine.getPlaybackSeconds();engine.viewTransitionSound(true);fake.advance(.8);
  assert.equal(engine.getDiagnostics().playing,true);assert.ok(engine.getPlaybackSeconds()>clock);
  engine.stop();fake.advance(6);engine.viewTransitionSound(false);engine.setVolume(0);fake.advance(.8);assert.equal(fake.sourceCount,0);
  engine.destroy();assert.equal(fake.timerCount,0);assert.equal(fake.sourceCount,0);
 }finally{engine.destroy();Object.assign(globalThis,saved);}
});
