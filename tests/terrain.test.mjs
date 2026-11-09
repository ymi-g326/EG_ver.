import {test} from 'node:test';
import assert from 'node:assert/strict';
import {terrainGrid,analyzeElevation} from '../lib/terrain-data.ts';
import {deriveTerrainSound,terrainChord} from '../lib/terrain-sound.ts';
import {surfaceMixAt} from '../lib/land-mask.ts';
import {applyAuditionModifiers} from '../lib/audition-modifiers.ts';
import {auditionFeatures} from '../lib/audition-presets.ts';
test('terrain uses a canonical 1-degree region and 9 valid DEM coordinates, wrapping the date line',()=>{
 const g=terrainGrid(47.1,10.2);assert.equal(g.points.length,9);assert.deepEqual(g.points[4],{latitude:47,longitude:10});
 assert.deepEqual(terrainGrid(47.2,10.1),g);
 for(const p of terrainGrid(90,180).points){assert.ok(p.latitude<=90);assert.ok(p.longitude>=-180&&p.longitude<180);}
 assert.equal(terrainGrid(91,0),null);assert.equal(terrainGrid(NaN,0),null);
});
test('relief measures height differences rather than mistaking a high flat plateau for rugged mountains',()=>{
 assert.equal(analyzeElevation(Array(9).fill(3500)).relief,0);
 assert.equal(analyzeElevation(Array(9).fill(100)).relief,0);
 const rough=analyzeElevation([0,500,1000,1500,1800,2000,2500,2700,3000]);assert.equal(rough.relief,1);assert.equal(rough.elevation,1800);assert.equal(rough.range,3000);
 assert.equal(analyzeElevation(Array(9).fill(-400)).elevation,-400);
 for(const bad of [null,[],[0,0,0,0,null,0,0,0,0],Array(9).fill(NaN)])assert.equal(analyzeElevation(bad),null);
});
test('coastline mixes two real natural sound foundations and preserves land identity; missing relief is neutral',()=>{
 const f={earthProfile:'vegetated',landProfile:'vegetated',landFraction:.5,terrainRelief:.9,terrainElevation:1800};
 const s=deriveTerrainSound(f);assert.equal(s.oceanWeight,.5);assert.equal(s.landWeight,.5);assert.equal(s.landProfile,'vegetated');assert.equal(s.coastal,true);
 assert.equal(s.relief,.45);assert.equal(s.leap,12);
 assert.deepEqual(terrainChord([0,4,7],s.relief),[0,16,7]);
 assert.equal(deriveTerrainSound({...f,landFraction:0}).relief,0);
 assert.equal(deriveTerrainSound({...f,terrainRelief:null}).leap,0);
 assert.equal(deriveTerrainSound({...f,landFraction:1}).oceanWeight,0);
});
test('geographic sea/land mixing distinguishes open ocean, continental interior and regional coast',()=>{
 assert.equal(surfaceMixAt(0,-140).landFraction,0);assert.equal(surfaceMixAt(23,20).landFraction,1);
 const coast=surfaceMixAt(35,139);assert.ok(coast.landFraction>0&&coast.landFraction<1);assert.equal(coast.points,49);
});
test('audition wind, mountains and coast controls never overwrite the baseline scenery',()=>{
 const base=auditionFeatures('forest-clear'),copy=structuredClone(base);
 const trial=applyAuditionModifiers(base,{wind:15,mountainous:true,coastLandFraction:.5});
 assert.deepEqual(base,copy);assert.equal(trial.earthProfile,'vegetated');assert.equal(trial.tonality,'major');
 assert.equal(trial.wind,15);assert.equal(trial.landFraction,.5);assert.equal(trial.terrainElevation,1800);
 assert.equal(deriveTerrainSound(trial).leap,12);
});
