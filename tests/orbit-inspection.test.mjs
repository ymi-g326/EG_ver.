import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as satellite from 'satellite.js';
import { moduleUrl } from './helpers/load-typescript.mjs';
const { lookAnglesToEcf, orbitReader, predictPasses, visibilityBoundary, validReferenceSite } = await import(moduleUrl(new URL('../lib/orbit-inspection.ts', import.meta.url)));
const { geographicPath, mapWindow } = await import(moduleUrl(new URL('../lib/inspect-map.ts', import.meta.url)));
const { orbitDisplayScale } = await import(moduleUrl(new URL('../lib/globe-atmosphere.ts', import.meta.url)));
const orbit = JSON.parse(readFileSync(new URL('../data/tenkoh2-reference.json', import.meta.url), 'utf8'));
const site = { latitude:35, longitude:139, heightKm:0, minimumElevation:10 };
const now = Date.parse('2026-10-14T00:00:00Z');

test('look angles give zenith and 500 km slant range above an equatorial reference, not ground speed', () => {
  const at = { latitude:0, longitude:0, heightKm:0, minimumElevation:10 };
  const overhead = satellite.geodeticToEcf({latitude:0,longitude:0,height:500});
  const look = lookAnglesToEcf(at,overhead);
  assert.ok(Math.abs(look.elevation-90)<1e-8);
  assert.ok(Math.abs(look.rangeKm-500)<1e-8);
  assert.ok(lookAnglesToEcf(at,satellite.geodeticToEcf({latitude:0,longitude:Math.PI,height:500})).elevation<0);
  assert.equal(validReferenceSite({...site,latitude:NaN}),false);
  assert.equal(validReferenceSite({...site,longitude:181}),false);
});

test('predicted TLE passes cross the specified mask, reach a maximum and are chronological', () => {
  const result=predictPasses(orbit,site,now);
  assert.ok(result.passes.length>=1);
  const reader=orbitReader(orbit,now);
  for(const p of result.passes){
    assert.ok(p.aos<p.maxAt&&p.maxAt<p.los&&p.los>=now&&p.los<=result.until);
    assert.ok(reader.look(p.aos-1000,site).elevation<site.minimumElevation);
    assert.ok(reader.look(p.aos+1000,site).elevation>site.minimumElevation);
    assert.ok(reader.look(p.los-1000,site).elevation>site.minimumElevation);
    assert.ok(reader.look(p.los+1000,site).elevation<site.minimumElevation);
    assert.ok(reader.look(p.maxAt,site).elevation>=reader.look(p.maxAt-1000,site).elevation);
    assert.ok(reader.look(p.maxAt,site).elevation>=reader.look(p.maxAt+1000,site).elevation);
  }
  assert.throws(()=>predictPasses(orbit,site,Date.parse('2026-11-12T00:00:00Z')),/out of date/);
  const short= result.passes.find(p=>p.maxElevation>15&&p.maxElevation<80);
  assert.ok(short);
  const grazing=predictPasses(orbit,{...site,minimumElevation:short.maxElevation-.005},short.aos-60000,10).passes.find(p=>Math.abs(p.maxAt-short.maxAt)<2000);
  assert.ok(grazing,'a very short pass between coarse samples must still be found');
  assert.ok(grazing.los-grazing.aos<30000);
});

test('map zoom keeps rulers consistent; date-line paths break; the mask boundary narrows with elevation', () => {
  const view=mapWindow(4,{latitude:80,longitude:179});
  assert.equal(view.longitudes.at(-1),180);
  assert.equal(view.latitudes[0],90);
  assert.deepEqual(view.center,{latitude:67.5,longitude:135});
  assert.match(geographicPath([{latitude:0,longitude:179},{latitude:0,longitude:-179}]),/M.*M/);
  const zero=visibilityBoundary({latitude:0,longitude:0},500,0), ten=visibilityBoundary({latitude:0,longitude:0},500,10);
  assert.ok(zero[0].latitude>ten[0].latitude&&ten[0].latitude>0);
  assert.ok(Math.abs(zero[0].latitude-Math.acos(6371/6871)*180/Math.PI)<1e-9);
  assert.ok(Math.abs(orbitDisplayScale(500)-6871/6371)<1e-12);
  assert.equal(orbitDisplayScale(null),null);
  assert.equal(orbitDisplayScale(NaN),null);
});
