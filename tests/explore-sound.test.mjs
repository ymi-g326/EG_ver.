import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/load-typescript.mjs';
const { normalizeView, imageWindow, exploreFeatures } = await import(moduleUrl(new URL('../lib/explore-sound.ts', import.meta.url)));
const { rotateGlobeView } = await import(moduleUrl(new URL('../lib/globe-geometry.ts', import.meta.url)));
const { analyzeReadWindow } = await import(moduleUrl(new URL('../lib/surface-analysis.ts', import.meta.url)));

test('one drag rotates the sphere in both axes without modifying an orbital position', () => {
  const satellite = { latitude: 35, longitude: 140 };
  const rotated = rotateGlobeView(satellite, 100, 40);
  assert.deepEqual(rotated, { latitude: 45, longitude: 108 });
  assert.deepEqual(satellite, { latitude: 35, longitude: 140 });
  assert.equal(rotateGlobeView(satellite, 10000, 10000).latitude, 75);
  assert.ok(Math.abs(rotateGlobeView(satellite, 10000, 0).longitude) <= 180);
  assert.deepEqual(normalizeView({ latitude: 100, longitude: 540 }), { latitude: 90, longitude: -180 });
  assert.equal(normalizeView({ latitude: NaN, longitude: 0 }), null);
});

test('geographic sampling wraps the date line and reads the poles without out-of-bounds pixels', () => {
  const pixels = new Uint8ClampedArray(360 * 180 * 4);
  for (let y = 0; y < 180; y++) for (let x = 0; x < 360; x++) {
    const i = (y * 360 + x) * 4;
    pixels[i] = x < 180 ? 10 : 230; pixels[i + 1] = y; pixels[i + 3] = 255;
  }
  const window = imageWindow(pixels, 360, 180, { latitude: 0, longitude: 180 }, 3);
  assert.equal(window[0], 230); assert.equal(window[8], 10);
  for (const latitude of [-90, 90]) {
    const polar = imageWindow(pixels, 360, 180, { latitude, longitude: -180 });
    for (let i = 3; i < polar.length; i += 4) assert.equal(polar[i], 255);
  }
});

test('selected land uses its own imagery, wind, cloud and relief; missing weather is not calm wind', () => {
  const size = 4, pixels = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([30, 130, 45, 255], i);
  const visual = analyzeReadWindow(pixels, size).features;
  const point = { latitude: 45, longitude: 10 };
  const weather = { temperature: 4, cloudCover: 100, windSpeed: 15, waveHeight: null, isDay: 1 };
  const terrain = { latitude: 45, longitude: 10, elevation: 1800, range: 1300, relief: .7, source: 'fixture', fetchedAt: '2026-11-04T00:00:00Z' };
  const forest = exploreFeatures(point, visual, true, 1, weather, terrain);
  assert.equal(forest.source, 'explore'); assert.equal(forest.earthProfile, 'vegetated');
  assert.equal(forest.wind, 15); assert.equal(forest.terrainRelief, .7);
  const sea = exploreFeatures({ latitude: -10, longitude: -130 }, visual, false, 0, null, null);
  assert.equal(sea.earthProfile, 'ocean'); assert.equal(sea.wind, null); assert.equal(sea.terrainRelief, null);
  assert.equal(sea.latitude, -10); assert.equal(forest.latitude, 45);
  sea.cloud = .9; assert.notEqual(forest.cloud, .9);
});
