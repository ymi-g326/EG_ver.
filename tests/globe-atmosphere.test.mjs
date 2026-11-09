import test from 'node:test';
import assert from 'node:assert/strict';
import {moduleUrl} from './helpers/load-typescript.mjs';
const {projectOrbit,globeTextureSample,cloudAlpha}=await import(moduleUrl(new URL('../lib/globe-atmosphere.ts',import.meta.url)));
const {projectGlobe}=await import(moduleUrl(new URL('../lib/globe-geometry.ts',import.meta.url)));
test('orbital height separates the path from the ground and the opaque globe hides its far side',()=>{
 const elevated=projectOrbit({latitude:0,longitude:90,altitude:637.1},0,0);
 assert.ok(Math.abs(elevated.x-1.1)<1e-9);assert.equal(elevated.visible,true);
 assert.equal(projectOrbit({latitude:0,longitude:180,altitude:637.1},0,0).visible,false);
 assert.equal(projectOrbit({latitude:0,longitude:110,altitude:637.1},0,0).visible,true);
 assert.equal(projectOrbit({latitude:0,longitude:140,altitude:637.1},0,0).visible,false);
 assert.ok(Math.abs(projectOrbit({latitude:0,longitude:90},0,0,637.1).x-1.1)<1e-9);
});
test('cloud texture stays attached to geographic coordinates through rotation and the date line',()=>{
 for(const camera of [{latitude:0,longitude:0},{latitude:48,longitude:179},{latitude:-52,longitude:-179}]){
  const point={latitude:camera.latitude-10,longitude:camera.longitude+22};
  const projected=projectGlobe(point,camera.longitude,camera.latitude);
  const at=globeTextureSample(projected.x,projected.y,camera.longitude,camera.latitude);
  const expected=((point.longitude+180)/360%1+1)%1;
  assert.ok(Math.abs(at.u-expected)<1e-8);assert.ok(Math.abs(at.v-(90-point.latitude)/180)<1e-8);
 }
 assert.equal(globeTextureSample(1,1,0,0),null);
});
test('white cloud candidates are translucent inputs; dark sea and saturated sand remain clear',()=>{
 assert.equal(cloudAlpha(0,0,0),0);assert.equal(cloudAlpha(10,30,70),0);
 assert.equal(cloudAlpha(235,183,110),0);assert.ok(cloudAlpha(230,230,230)>200);
 assert.equal(cloudAlpha(255,255,255),255);
});
