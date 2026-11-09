import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/load-typescript.mjs';
import { fakeAudio } from './helpers/fake-audio.mjs';
const { GlobeDragMomentum, dragMomentum, advanceGlobeMomentum, momentumScratch, momentumSpeed } = await import(moduleUrl(new URL('../lib/globe-motion.ts', import.meta.url)));
const { EarthAudioEngine } = await import(moduleUrl(new URL('../lib/audio-engine.ts', import.meta.url)));
const { localFeatures } = await import(moduleUrl(new URL('../lib/local-journey.ts', import.meta.url)));

function coast(motion, step = 16) {
  let view = {longitude: 179, latitude: 20}, elapsed = 0;
  const initial = momentumSpeed(motion), samples = [];
  while (momentumSpeed(motion) && elapsed < 4000) {
    ({view, motion} = advanceGlobeMomentum(view, motion, step)); elapsed += step;
    samples.push(momentumScratch(motion, initial));
  }
  return {view, elapsed, samples};
}

test('a stronger throw keeps rotating and sounding longer; both signs and vertical movement decay to rest', () => {
  const slow = coast(dragMomentum(8,0,32));
  const fast = coast(dragMomentum(80,0,32));
  assert.ok(slow.elapsed > 500 && fast.elapsed > slow.elapsed + 700 && fast.elapsed < 3200);
  for (const [dx,dy] of [[80,0],[-80,0],[0,60],[0,-60]]) {
    const result = coast(dragMomentum(dx,dy,32));
    assert.ok(result.view.longitude >= -180 && result.view.longitude <= 180);
    assert.ok(Math.abs(result.view.latitude) <= 75);
    assert.equal(result.samples.at(-1).strength,0);
    for (let i=1;i<result.samples.length;i++) assert.ok(result.samples[i].strength <= result.samples[i-1].strength);
    const sounding = result.samples.filter(s=>s.strength>0);
    assert.ok(sounding.every(s=>Math.sign(s.velocity) === Math.sign(dx || -dy)));
  }
});

test('decay is based on elapsed time, and a suspended frame or invalid movement cannot replay old inertia', () => {
  const motion = dragMomentum(40,5,32);
  const a=coast(motion,8), b=coast(motion,32);
  assert.ok(Math.abs(a.view.longitude-b.view.longitude)<.1);
  assert.ok(Math.abs(a.view.latitude-b.view.latitude)<.1);
  assert.deepEqual(dragMomentum(NaN,4,16),{longitude:0,latitude:0});
  assert.equal(momentumSpeed(advanceGlobeMomentum({longitude:0,latitude:0},motion,2000).motion),0);
  assert.equal(momentumScratch(motion,NaN).strength,0);
});

test('a released live scratch keeps the same captured second and fades while the transport continues; pause clears it', async () => {
  const fake = fakeAudio();
  const saved={AudioContext:globalThis.AudioContext,Audio:globalThis.Audio,window:globalThis.window,AudioWorkletNode:globalThis.AudioWorkletNode};
  let snapshots=0;
  fake.AudioContext.prototype.audioWorklet={addModule:async()=>{}};
  class Recorder {
    port={onmessage:null,close(){},postMessage:data=>{
      if(data.type==='enabled'&&data.value) queueMicrotask(()=>this.port.onmessage?.({data:{type:'ready'}}));
      if(data.type==='snapshot') {snapshots++;queueMicrotask(()=>this.port.onmessage?.({data:{type:'snapshot',channels:[new Float32Array(8000).fill(.03)]}}));}
    }};
    connect(target){return target;}disconnect(){}
  }
  Object.assign(globalThis,fake,{AudioWorkletNode:Recorder});
  const engine=new EarthAudioEngine(()=>localFeatures('mixed-clear'),undefined,true);
  try {
    engine.setListeningMode('ambient');engine.start();await Promise.resolve();await Promise.resolve();fake.advance(1);
    engine.beginScratch();await Promise.resolve();engine.scratch(.9);fake.advance(.064);
    let view={longitude:0,latitude:0},motion=dragMomentum(80,0,32);
    const initial=momentumSpeed(motion),levels=[];
    for(let ms=0;ms<1600;ms+=32){
      ({view,motion}=advanceGlobeMomentum(view,motion,32));
      const touch=momentumScratch(motion,initial);engine.scratch(touch.velocity,touch.strength);fake.advance(.032);
      assert.equal(engine.getDiagnostics().scratch.active,true);
      levels.push(engine.getDiagnostics().scratch.strength);
      assert.ok(engine.getDiagnostics().transport.activeSources<30);
    }
    assert.equal(snapshots,1,'coasting must retain the held clip');
    assert.ok(levels.at(-1)<levels[0]*.1);
    assert.ok(engine.getPlaybackSeconds()>2.6);
    engine.endScratch();assert.equal(engine.getDiagnostics().scratch.strength,0);
    fake.advance(.3);assert.equal(engine.getDiagnostics().scratch.active,false);
    engine.beginScratch();await Promise.resolve();engine.scratch(-.8,.5);fake.advance(.06);
    engine.stop();const count=fake.sourceCount;engine.scratch(-.6,.4);fake.advance(.3);
    assert.equal(fake.sourceCount<=count,true);assert.equal(engine.getDiagnostics().scratch.active,false);
  } finally {engine.destroy();Object.assign(globalThis,saved);}
});


test('a tiny final trackpad event does not erase the recent throw; a deliberate pause still stops it',()=>{
 const history=new GlobeDragMomentum();
 for(let t=16;t<=96;t+=16)history.add(12,0,16,t);
 history.add(.1,0,4,100);
 assert.ok(history.at(108).longitude < -150);
 assert.equal(momentumSpeed(history.at(260)),0);
 history.reset();assert.equal(momentumSpeed(history.at(300)),0);
});

test('drag history follows reversals and different input rates without accumulating old gestures',()=>{
 const speeds=[];
 for(const dt of [4,8,16,32]){
  const history=new GlobeDragMomentum();let time=0;
  for(;time<320;time+=dt)history.add(dt*.5,dt*.1,dt,time+dt);
  speeds.push(history.at(time).longitude);
  for(let n=0;n<200/dt;n++)history.add(-dt*.5,0,dt,time+=dt);
  assert.ok(history.at(time).longitude>100);
  assert.equal(momentumSpeed(history.add(NaN,0,dt,NaN)),0);
 }
 assert.ok(Math.max(...speeds)-Math.min(...speeds)<1e-8);
});
