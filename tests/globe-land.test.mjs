import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geoPath } from 'd3-geo';
import { GLOBE_LAND, globeLandProjection } from '../lib/globe-land.ts';
import { projectGlobe } from '../lib/globe-geometry.ts';

test('spherical coast clipping follows the circular limb instead of drawing a chord', () => {
  const crossing = { type: 'Polygon', coordinates: [[[70,-30],[70,30],[110,30],[110,-30],[70,-30]]] };
  const projection = globeLandProjection(0, 0, 200);
  const path = geoPath(projection);
  const [[left, top], [right, bottom]] = path.bounds(crossing);
  assert.ok(left > 150 && left < 180);
  assert.ok(right > 199.9 && right <= 200.01, 'the equatorial limb must be covered beyond the endpoints');
  assert.ok(top < -90 && bottom > 90);
  assert.ok(path.area(crossing) > 1000 && path.area(crossing) < 10000);
});

test('land and satellite use the same orientation, including polar and date-line views', () => {
  for (const latitude of [-75,-30,0,45,75]) for (const longitude of [-180,-90,0,90,180]) {
    const projection = globeLandProjection(longitude, latitude, 200);
    for (const point of [{latitude, longitude}, {latitude: 12, longitude: 179}, {latitude: -45, longitude: -160}, {latitude: 60, longitude: 45}]) {
      const expected = projectGlobe(point, longitude, latitude);
      const actual = projection([point.longitude, point.latitude]);
      assert.ok(Math.abs(actual[0] - expected.x * 200) < 1e-6);
      assert.ok(Math.abs(actual[1] - expected.y * 200) < 1e-6);
    }
  }
});

test('real world land stays finite and inside the sphere through a full rotation at several tilts', () => {
  const projection = globeLandProjection(0,0,200), path = geoPath(projection);
  for (const latitude of [-75,-40,0,40,75]) for (let longitude = -180; longitude <= 180; longitude += 15) {
    projection.rotate([-longitude, -latitude]);
    const svg = path(GLOBE_LAND), bounds = path.bounds(GLOBE_LAND);
    assert.ok(svg && !/NaN|Infinity/.test(svg), `${latitude},${longitude}`);
    assert.ok(bounds.flat().every(v => Number.isFinite(v) && Math.abs(v) <= 200.01));
    assert.ok(path.area(GLOBE_LAND) > 0 && path.area(GLOBE_LAND) <= Math.PI * 200 ** 2 + 1);
  }
});
