import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { moduleUrl } from './helpers/load-typescript.mjs';
const { orbitElements, orbitAgeHours, utcTime } = await import(moduleUrl(new URL('../lib/inspect-data.ts', import.meta.url)));
const reference = JSON.parse(readFileSync(new URL('../data/tenkoh2-reference.json', import.meta.url), 'utf8'));

test('TLE fields preserve leading-zero eccentricity and derive mean period in minutes', () => {
  const elements = orbitElements(reference);
  assert.equal(elements.inclination, 51.6583);
  assert.equal(elements.eccentricity, .0007026);
  assert.equal(elements.ascendingNode, 114.863);
  assert.equal(elements.meanMotion, 15.25199864);
  assert.ok(Math.abs(elements.periodMinutes - 94.41385578) < 1e-6);
  assert.equal(orbitElements(null), null);
  assert.equal(orbitElements({ ...reference, line2: '' }), null);
});

test('source times are unambiguous UTC; missing times and ages are not silently replaced by now', () => {
  assert.equal(utcTime('2026-11-12T00:00:00Z'), '2026-11-12 00:00:00 UTC');
  assert.equal(utcTime(null), '—');
  assert.equal(utcTime('invalid'), '—');
  assert.equal(orbitAgeHours('2026-11-11T12:00:00Z', Date.parse('2026-11-12T00:00:00Z')), 12);
  assert.equal(orbitAgeHours(undefined, Date.now()), null);
  assert.equal(orbitAgeHours('invalid', Date.now()), null);
});
