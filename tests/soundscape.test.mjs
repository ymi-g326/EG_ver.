import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeReadWindow, chooseGround } from '../lib/surface-analysis.ts';
import { isLandAt } from '../lib/land-mask.ts';
import { deriveCloudSound } from '../lib/cloud-sound.ts';
import { deriveCloudTonality, cloudMotif } from '../lib/cloud-harmony.ts';
import { AUDITION_PRESETS, auditionFeatures } from '../lib/audition-presets.ts';

const windowWith = (color, cloudy = 0) => new Uint8ClampedArray(Array.from({length: 16}, (_, i) => i < cloudy ? [225,225,225,255] : [...color,255]).flat());
test('land mask handles ocean, continents, date line and invalid coordinates independently of image color', () => {
  for (const [lat, lon] of [[0,-140],[-30,-30],[0,0],[30,-150]]) assert.equal(isLandAt(lat,lon),false);
  for (const [lat, lon] of [[23,20],[-10,-60],[40,105],[36,138],[-85,20],[65,175],[65,-175]]) assert.equal(isLandAt(lat,lon),true,`${lat}, ${lon}`);
  assert.equal(isLandAt(0,220),isLandAt(0,-140));
  assert.equal(isLandAt(NaN,0),null);
  assert.equal(isLandAt(91,0),null);
});
test('clouds do not replace the ocean/forest with a cloud instrument, and obscured ground is honestly held or unknown', () => {
  const clear = analyzeReadWindow(windowWith([30,110,40]),4).features;
  const half = analyzeReadWindow(windowWith([30,110,40],8),4).features;
  const hidden = analyzeReadWindow(windowWith([30,110,40],16),4).features;
  const forest = chooseGround(true,clear);
  assert.equal(forest.profile,'vegetated');
  assert.equal(chooseGround(true,half).profile,'vegetated');
  assert.equal(half.ground.brightness,clear.ground.brightness);
  assert.equal(half.ground.saturation,clear.ground.saturation);
  assert.equal(hidden.cloud,1);
  const held=chooseGround(true,hidden,forest);
  assert.equal(held.profile,'vegetated'); assert.deepEqual(held.ground,forest.ground); assert.match(held.source,/保持/);
  assert.equal(chooseGround(true,hidden).profile,'mixed');
  assert.equal(chooseGround(false,hidden,forest).profile,'ocean');
  assert.equal(chooseGround(false,clear).profile,'ocean');
  assert.equal(chooseGround(true,analyzeReadWindow(windowWith([180,120,50]),4).features).profile,'arid');
});
test('cloud amount, boundaries and tonal texture are measured separately; delta remains a whole-image change', () => {
  const clear=analyzeReadWindow(windowWith([20,50,100]),4);
  const half=analyzeReadWindow(windowWith([20,50,100],8),4,clear.compact);
  assert.equal(clear.features.cloud,0); assert.equal(half.features.cloud,.5);
  assert.ok(half.features.cloudEdges > 0); assert.equal(half.features.cloudTexture,0);
  assert.ok(half.features.delta > 0);
  const textured=windowWith([0,0,0],16); for(let i=0;i<8;i++) textured.set([180,180,180,255],i*4);
  assert.ok(analyzeReadWindow(textured,4).features.cloudTexture > 0);
  assert.throws(()=>analyzeReadWindow([],4));
});
test('fair audition pairs hold terrain and tempo inputs; sky has a stronger melodic role at sea', () => {
  const sea=auditionFeatures('sea-clear'), cloudy=auditionFeatures('sea-cloudy');
  const forest=auditionFeatures('forest-clear'), forestCloud=auditionFeatures('forest-cloudy');
  for (const [a,b] of [[sea,cloudy],[forest,forestCloud],[auditionFeatures("dry-clear"),auditionFeatures("dry-cloudy")],[auditionFeatures("mixed-clear"),auditionFeatures("mixed-cloudy")]]) {
    for(const key of ['earthProfile','groundBrightness','groundSaturation','groundVariance','groundEdges','groundBlue','delta','edgeDensity','latitude','temperature']) assert.equal(a[key],b[key],key);
  }
  const calm=deriveCloudSound(sea), busy=deriveCloudSound(cloudy), land=deriveCloudSound(forestCloud);
  assert.equal(calm.brightness,busy.brightness); assert.equal(calm.variance,busy.variance);
  assert.ok(busy.melodyBoost > calm.melodyBoost); assert.ok(busy.pulseDensity > calm.pulseDensity);
  assert.ok(busy.melodyBoost > land.melodyBoost * 5);
  assert.equal(land.pulseDensity,0);
  assert.ok(deriveCloudSound(forestCloud).cutoffMultiplier < deriveCloudSound(forest).cutoffMultiplier);
  assert.ok(busy.reverb > calm.reverb);
  for(const p of AUDITION_PRESETS) { const f=auditionFeatures(p.id); assert.equal(f.source,'audition'); assert.deepEqual(f.memory,[]); }
  sea.memory.push(cloudy); assert.deepEqual(auditionFeatures('sea-clear').memory,[]);
  assert.equal(auditionFeatures('missing'),null);
});


test('cloud cover controls mode on both surfaces with hysteresis; preset modes follow the same rule', () => {
  assert.equal(deriveCloudTonality(.35, 'minor'), 'major');
  assert.equal(deriveCloudTonality(.65, 'major'), 'minor');
  for(const cloud of [.36, .5, .64]) {
    assert.equal(deriveCloudTonality(cloud, 'major'), 'major');
    assert.equal(deriveCloudTonality(cloud, 'minor'), 'minor');
  }
  let mode='major';
  for(const cloud of [.7,.64,.51,.36]) mode=deriveCloudTonality(cloud,mode);
  assert.equal(mode,'minor');
  mode=deriveCloudTonality(.3,mode); assert.equal(mode,'major');
  assert.equal(deriveCloudTonality(NaN,'minor'),'minor');
  for(const p of AUDITION_PRESETS) assert.equal(p.features.tonality,deriveCloudTonality(p.features.cloud));
  assert.equal(auditionFeatures('sea-clear').tonality,'major');
  assert.equal(auditionFeatures('sea-cloudy').tonality,'minor');
  assert.equal(auditionFeatures('forest-clear').tonality,'major');
  assert.equal(auditionFeatures('forest-cloudy').tonality,'minor');
});

test('clouds change pitches and articulation even with reverb excluded: major ascent, minor descent', () => {
  const clear=[0,4,8,12].map(step=>cloudMotif('major',step,3810));
  const cloudy=[0,4,8,12].map(step=>cloudMotif('minor',step,3810));
  assert.deepEqual(clear.map(n=>n.interval),[0,4,7,12]);
  assert.deepEqual(cloudy.map(n=>n.interval),[12,7,3,0]);
  assert.ok(clear.every(n=>n.anchor)); assert.ok(cloudy.every(n=>n.anchor));
  assert.ok(cloudy.every((n,i)=>n.beats > clear[i].beats * 2));
  assert.equal(cloudMotif('major',2,3810).anchor,false);
  const majorScale=[0,2,4,5,7,9,11],minorScale=[0,2,3,5,7,8,10];
  for(let step=0;step<16;step++) {
    const a=cloudMotif('major',step,3810),b=cloudMotif('minor',step,3810);
    assert.ok(majorScale.includes(a.interval%12)); assert.ok(minorScale.includes(b.interval%12));
  }
  const wet=deriveCloudSound(auditionFeatures('sea-cloudy')).reverb + .85*.03;
  assert.ok(wet < .25,'cloudy reverb stays behind the foreground notes');
});


test('audition covers all four actual sound foundations with both clear and cloudy skies', () => {
  for (const profile of ['ocean','vegetated','arid','mixed']) {
    const pair = AUDITION_PRESETS.filter(p => p.features.earthProfile === profile);
    assert.equal(pair.length,2,profile);
    assert.deepEqual(new Set(pair.map(p=>p.features.tonality)),new Set(['major','minor']));
  }
  assert.match(AUDITION_PRESETS.find(p=>p.id==='mixed-clear').detail,/山岳の判定ではありません/);
});
