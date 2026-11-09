import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveTempo,advanceTempo,WIND_BPM_POINTS} from '../lib/audio-tempo.ts';
test('wind AUTO interpolates the agreed 80–150 BPM curve and is independent of temperature/image',()=>{
 for(const [wind,bpm] of WIND_BPM_POINTS)assert.equal(resolveTempo({wind}).bpm,bpm);
 assert.equal(resolveTempo({wind:4.5,temperature:-30,delta:1,edgeDensity:1}).bpm,102.5);
 assert.equal(resolveTempo({wind:4.5,temperature:40,delta:0,edgeDensity:0}).bpm,102.5);
 assert.equal(resolveTempo({wind:30}).bpm,150);assert.equal(resolveTempo({wind:0}).source,'wind');
});
test('missing wind holds the audible tempo and does not pretend that it is calm',()=>{
 for(const wind of [null,NaN,Infinity,-1]) {
  assert.equal(resolveTempo({wind}).source,'waiting');assert.equal(resolveTempo({wind}).autoBpm,null);
  const prev=advanceTempo(null,{wind:10},{mode:'auto',manualBpm:80},0);
  const next=advanceTempo(prev,{wind},{mode:'auto',manualBpm:80},10);
  assert.equal(next.bpm,125);assert.equal(next.targetBpm,125);assert.equal(next.source,'held');
 }
 assert.equal(advanceTempo(null,{wind:null},{mode:'auto',manualBpm:80},0).bpm,80);
});
test('AUTO smoothing is elapsed-time based, bounded at 10 BPM/s; manual changes are immediate',()=>{
 const auto={mode:'auto',manualBpm:80};
 let state=advanceTempo(null,{wind:0},auto,0);
 state=advanceTempo(state,{wind:20},auto,.25);assert.equal(state.bpm,82.5);assert.equal(state.targetBpm,150);
 state=advanceTempo(state,{wind:20},auto,1);assert.equal(state.bpm,92.5);
 state=advanceTempo(state,{wind:20},auto,10);assert.equal(state.bpm,150);
 state=advanceTempo(state,{wind:0},auto,.5);assert.equal(state.bpm,145);
 state=advanceTempo(state,{wind:0},auto,NaN);assert.equal(state.bpm,145);
 state=advanceTempo(state,{wind:0},{mode:'manual',manualBpm:90},0);assert.equal(state.bpm,90);
});
test('manual tempo is independent of wind and constrained to 80–150',()=>{
 for(const manualBpm of [80,110,150])for(const wind of [null,0,30])assert.equal(resolveTempo({wind},{mode:'manual',manualBpm}).bpm,manualBpm);
 assert.equal(resolveTempo({wind:6},{mode:'manual',manualBpm:70}).bpm,80);
 assert.equal(resolveTempo({wind:6},{mode:'manual',manualBpm:180}).bpm,150);
 assert.equal(resolveTempo({wind:6},{mode:'manual',manualBpm:NaN}).bpm,80);
});

test('the same wind curve spans 80–100 in AMBIENT and 80–150 in GROOVE, including strong-wind variation',()=>{
 const auto={mode:'auto',manualBpm:80};
 for(let wind=0;wind<=35;wind+=.25){
  const ambient=resolveTempo({wind},auto,undefined,'ambient');
  const groove=resolveTempo({wind},auto,undefined,'groove');
  assert.ok(ambient.bpm>=80&&ambient.bpm<=100);
  assert.ok(groove.bpm>=80&&groove.bpm<=150);
  assert.equal(groove.bpm,resolveTempo({wind}).bpm);
  assert.ok(Math.abs((ambient.bpm-80)/20-(groove.bpm-80)/70)<1e-12);
  assert.equal(ambient.wind,wind,'report the received wind, not a scaled wind speed');
 }
 assert.ok(Math.abs(resolveTempo({wind:6},auto,undefined,'ambient').bpm-88.5714285714)<1e-8);
 assert.equal(resolveTempo({wind:6},auto,undefined,'groove').bpm,110);
 assert.ok(resolveTempo({wind:15},auto,undefined,'ambient').bpm<100,'do not flatten strong wind by clipping the old curve at 100');
 for(const profile of ['ambient','groove']){
  assert.equal(resolveTempo({wind:0},auto,undefined,profile).bpm,80);
  assert.equal(resolveTempo({wind:20},auto,undefined,profile).bpm,profile==='ambient'?100:150);
 }
});

test('style changes retain the time-based ramp and missing-wind semantics; manual tempo remains independent',()=>{
 const auto={mode:'auto',manualBpm:80};
 let state=advanceTempo(null,{wind:20},auto,0,'groove');
 state=advanceTempo(state,{wind:20},auto,.25,'ambient');
 assert.equal(state.targetBpm,100);assert.equal(state.bpm,147.5);
 state=advanceTempo(state,{wind:20},auto,5,'ambient');assert.equal(state.bpm,100);
 state=advanceTempo(state,{wind:20},auto,.25,'groove');assert.equal(state.bpm,102.5);assert.equal(state.targetBpm,150);
 for(const profile of ['ambient','groove']){
  const previous=advanceTempo(null,{wind:6},auto,0,profile);
  for(const wind of [null,NaN,Infinity,-1]){
   const missing=advanceTempo(previous,{wind},auto,10,profile);
   assert.equal(missing.bpm,previous.bpm);assert.equal(missing.source,'held');
   assert.equal(resolveTempo({wind},auto,undefined,profile).source,'waiting');
  }
  assert.equal(resolveTempo({wind:20},{mode:'manual',manualBpm:140},undefined,profile).bpm,140);
 }
 const held=resolveTempo({wind:null},auto,150,'ambient');assert.equal(held.bpm,100);assert.equal(held.source,'held');
});
