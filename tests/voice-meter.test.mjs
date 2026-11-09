import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './helpers/load-typescript.mjs';
import {fakeAudio} from './helpers/fake-audio.mjs';
const {VoiceMeter}=await import(moduleUrl(new URL('../lib/voice-meter.ts',import.meta.url)));
const {EarthAudioEngine}=await import(moduleUrl(new URL('../lib/audio-engine.ts',import.meta.url)));
const {localFeatures}=await import(moduleUrl(new URL('../lib/local-journey.ts',import.meta.url)));
const layers=['motif','pad','bass','pulse'];

test('simultaneous parts and rapid later notes all survive one UI update; weaker notes cannot erase a peak',()=>{
 const meter=new VoiceMeter();
 meter.push('pad',.045,'listening');meter.push('bass',.045,'listening');meter.push('motif',.065,'listening');
 meter.push('pulse',.026,'listening');meter.push('pulse',.002,'listening');
 const first=meter.read(100);
 assert.ok(first.bass>.5);assert.ok(first.motif>.6);assert.equal(first.pad,.6);assert.equal(first.pulse,1);
 meter.push('bass',.085,'listening');meter.push('pulse',.026,'listening');
 const next=meter.read(100);assert.equal(next.bass,1);assert.equal(next.pulse,1);
});

test('display sensitivity fits quiet V2 bass; meters decay, reject invalid levels and clear pending notes',()=>{
 const meter=new VoiceMeter();meter.push('bass',.045,'listening');
 const value=meter.read(0).bass;assert.ok(value>.5);
 assert.ok(Math.abs(meter.read(380).bass-value/Math.E)<1e-10);
 assert.equal(meter.read(10000).bass,0);
 for(const level of [NaN,Infinity,-1,0])meter.push('pulse',level,'listening');
 assert.equal(meter.read(100).pulse,0);
 meter.push('bass',.3,'original');assert.ok(meter.read(0).bass>.9);
 meter.push('motif',.24,'original');meter.clear();assert.deepEqual(meter.read(100),{bass:0,motif:0,pad:0,pulse:0});
});

function audioHarness(run){
 const fake=fakeAudio(),saved={AudioContext:globalThis.AudioContext,Audio:globalThis.Audio,window:globalThis.window};
 Object.assign(globalThis,fake);const meter=new VoiceMeter();
 const features={...localFeatures('forest-clear'),source:'live'};
 const engine=new EarthAudioEngine(()=>features,({layer,level})=>meter.push(layer,level,'listening'),true);
 try{run({fake,meter,engine,features});}finally{engine.destroy();Object.assign(globalThis,saved);}
}

test('actual LIVE and LOCAL music events move LOW END in both styles and RHYTHM in GROOVE',()=>{
 for(const source of ['live','local'])for(const mode of ['ambient','groove'])audioHarness(({fake,meter,engine,features})=>{
  features.source=source;engine.setListeningMode(mode);engine.start();
  const peaks={bass:0,motif:0,pad:0,pulse:0};
  for(let tick=0;tick<150;tick++){
   fake.advance(.1);const values=meter.read(100);
   for(const layer of layers)peaks[layer]=Math.max(peaks[layer],values[layer]);
  }
  assert.ok(peaks.bass>.5,`${source}/${mode}: bass`);assert.ok(peaks.motif>.6);assert.ok(peaks.pad>.5);
  assert.equal(peaks.pulse>0,mode==='groove');
  assert.ok(engine.getDiagnostics().events.some(event=>event.instrument==='WARM SUB'));
  if(mode==='groove')assert.ok(engine.getDiagnostics().events.some(event=>event.instrument==='SOFT BRUSH'));
 });
});

test('pausing and clearing the meter does not show stale scheduled activity',()=>audioHarness(({fake,meter,engine})=>{
 engine.setListeningMode('groove');engine.start();fake.advance(1);
 engine.stop();meter.clear();fake.advance(1);
 assert.deepEqual(meter.read(100),{bass:0,motif:0,pad:0,pulse:0});
}));

test('the LIVE return gravity cue also reports its low-end activity',()=>audioHarness(({fake,meter,engine})=>{
 engine.setListeningMode('ambient');engine.start();fake.advance(.3);meter.clear();
 engine.liveReturnSound();assert.equal(meter.read(0).bass,1);
}));
