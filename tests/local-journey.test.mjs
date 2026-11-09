import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './helpers/load-typescript.mjs';
const {LocalJourney,localFeatures,sceneRemaining}=await import(moduleUrl(new URL('../lib/local-journey.ts',import.meta.url)));
const ids=['sea-clear','sea-cloudy','forest-clear','forest-cloudy','dry-clear','dry-cloudy','mixed-clear','mixed-cloudy'];
function random(seed=27){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};}

test('local shuffle visits all eight scenes once per bag, including deterministic RNG extremes, without consecutive repeats',()=>{
 for(const rng of [random(),()=>0,()=>1,()=>NaN]) {
  const journey=new LocalJourney(rng);let previous;
  for(let round=0;round<100;round++) {
   const bag=Array.from({length:8},()=>journey.next());
   assert.deepEqual(new Set(bag.map(s=>s.id)),new Set(ids));
   for(const scene of bag){assert.notEqual(scene.id,previous);previous=scene.id;assert.ok(scene.durationSeconds>=45&&scene.durationSeconds<=90);}
  }
 }
});

test('local landscapes are independent copies with synthetic wind, no trial overrides, and flat terrain',()=>{
 for(const id of ids) {
  const a=localFeatures(id),b=localFeatures(id);
  assert.equal(a.source,'local');assert.equal(a.scenarioId,id);assert.equal(a.motifStyle,'themed');assert.equal(a.motifOnly,false);
  assert.ok(Number.isFinite(a.wind));assert.equal(a.terrainRelief,0);assert.equal(a.landFraction,a.earthProfile==='ocean'?0:1);
  a.memory.push(b);assert.deepEqual(b.memory,[]);a.cloud=0;assert.notEqual(localFeatures(id).cloud,0);
 }
});

test('two hours of synthetic playlist time remains bounded and pausing the playback clock preserves the countdown',()=>{
 const journey=new LocalJourney(random());let scene=journey.next(),start=0,previous=scene.id,changes=0;
 for(let t=0;t<=7200;t+=.2){if(sceneRemaining(scene,t,start)===0){scene=journey.next();assert.notEqual(scene.id,previous);previous=scene.id;start=t;changes++;}}
 assert.ok(changes>=79&&changes<=160);
 const remaining=sceneRemaining(scene,7210,start);assert.equal(sceneRemaining(scene,7210,start),remaining);
 assert.equal(sceneRemaining(scene,1,10),scene.durationSeconds);
});
