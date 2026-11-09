import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordWind, summarizeWind, MAX_WIND_READINGS } from '../lib/wind-analysis.ts';
const reading = (wind, second=0, latitude=10) => ({wind,receivedAt:new Date(Date.UTC(2026,9,21,5,0,second)).toISOString(),latitude,longitude:20,modelTime:'2026-10-21T05:00:00Z',intervalSeconds:900});
test('records genuine wind without an arbitrary upper cap; missing data and repeated model cells are excluded', () => {
  let rows=recordWind([],reading(0));
  assert.equal(rows.length,1); // a real calm reading is retained
  for(const wind of [null,NaN,Infinity,-1]) assert.equal(recordWind(rows,reading(wind,10)),rows);
  assert.equal(recordWind(rows,reading(3,10)),rows); // same model step and location
  rows=recordWind(rows,reading(30,20,11)); assert.equal(rows.length,2);assert.equal(rows[1].wind,30);
  rows=recordWind(rows,{...reading(12,30),modelTime:'2026-10-21T05:15:00Z'});assert.equal(rows.length,3);
  assert.equal(recordWind(rows,{...reading(2),receivedAt:'invalid'}),rows);
  let capped=[];
  for(let i=0;i<MAX_WIND_READINGS+2;i++) capped=recordWind(capped,{...reading(i),modelTime:null,receivedAt:new Date(Date.UTC(2026,9,21,5,0,i)).toISOString()});
  assert.equal(capped.length,MAX_WIND_READINGS);assert.equal(capped[0].wind,2);
});
test('wind range, quantiles, bins and received-reading intervals have distinct meanings', () => {
  const rows=[0,3,6,10,15,20,30].map((n,i)=>reading(n,i*12,i));
  const stats=summarizeWind(rows);
  assert.equal(stats.count,7); assert.equal(stats.min,0);assert.equal(stats.max,30);assert.equal(stats.median,10);
  assert.ok(Math.abs(stats.p90-24)<1e-8);assert.equal(stats.gapMedian,12);
  assert.deepEqual(stats.modelIntervals,[900]);
  assert.deepEqual(stats.bins.map(b=>b.count),[1,1,1,1,1,2]);
  assert.equal(summarizeWind([]).median,null);assert.equal(summarizeWind([reading(0)]).gapMedian,null);
});
