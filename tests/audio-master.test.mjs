import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './helpers/load-typescript.mjs';
import {fakeAudio} from './helpers/fake-audio.mjs';
import {MASTER_GAIN,MASTER_BOOST_DB,MASTER_CEILING_DB,masterCeilingCurve,createMasterOutput} from '../lib/audio-master.ts';
const {EarthAudioEngine}=await import(moduleUrl(new URL('../lib/audio-engine.ts',import.meta.url)));
const {localFeatures}=await import(moduleUrl(new URL('../lib/local-journey.ts',import.meta.url)));

test('master stage raises the common output by 18 dB while preserving ordinary waveforms and smoothly bounding peaks',()=>{
 assert.ok(Math.abs(20*Math.log10(MASTER_GAIN)-MASTER_BOOST_DB)<1e-10);
 const curve=masterCeilingCurve(),ceiling=10**(MASTER_CEILING_DB/20);
 assert.equal(curve[(curve.length-1)/2],0);
 for(let i=0;i<curve.length;i++){
  const input=i/(curve.length-1)*2-1,output=curve[i];
  assert.ok(Number.isFinite(output)&&Math.abs(output)<ceiling);
  if(Math.abs(input)<.69)assert.ok(Math.abs(input-output)<1e-6,'quiet signals stay linear');
  if(i>0)assert.ok(output>=curve[i-1]);
  assert.ok(Math.abs(output+curve[curve.length-1-i])<1e-6);
 }
 assert.ok(curve.at(-1)>.85,'retain output headroom instead of globally attenuating again');
});

test('music and captured scratch share a single make-up stage, limiter and final ceiling with complete teardown',()=>{
 const nodes=[];
 const make=kind=>{
  const n={kind,links:[],gain:{value:0},threshold:{value:0},knee:{value:0},ratio:{value:0},attack:{value:0},release:{value:0},connect(target){this.links.push(target);return target;},disconnect(){this.links=[];}};
  nodes.push(n);return n;
 };
 const stage=createMasterOutput({createGain:()=>make('gain'),createDynamicsCompressor:()=>make('limiter'),createWaveShaper:()=>make('ceiling')});
 assert.equal(stage.input.gain.value,MASTER_GAIN);
 assert.deepEqual(nodes.map(n=>n.kind),['gain','limiter','ceiling']);
 assert.equal(stage.input.links[0],nodes[1]);assert.equal(nodes[1].links[0],stage.output);
 assert.ok(nodes[1].ratio.value>=20&&nodes[1].threshold.value<0);
 assert.ok(stage.output.curve.every(v=>Math.abs(v)<1));
 stage.destroy();assert.ok(nodes.every(n=>n.links.length===0));
});

test('master boost survives both listening styles, volume changes, pause and reconnect without multiplying the stage',()=>{
 const fake=fakeAudio(),saved={AudioContext:globalThis.AudioContext,Audio:globalThis.Audio,window:globalThis.window};Object.assign(globalThis,fake);
 const engine=new EarthAudioEngine(()=>localFeatures('forest-clear'),undefined,true);
 try{
  for(const mode of ['ambient','groove']){
   engine.setListeningMode(mode);engine.start();fake.advance(.5);
   for(const volume of [0,.2,.72,1]){
    engine.setVolume(volume);fake.advance(.1);
    assert.ok(Math.abs(engine.getDiagnostics().masterBoostDb-18)<1e-5);
   }
   const connections=fake.connectionCount;engine.start();assert.equal(fake.connectionCount,connections);
   engine.stop();fake.advance(.3);assert.equal(engine.getDiagnostics().playing,false);
  }
  fake.closeContext();engine.start();fake.advance(.2);
  assert.equal(engine.getDiagnostics().contextState,'running');assert.ok(Math.abs(engine.getDiagnostics().masterBoostDb-18)<1e-5);
  engine.destroy();assert.equal(fake.timerCount,0);assert.equal(fake.sourceCount,0);
 }finally{engine.destroy();Object.assign(globalThis,saved);}
});
