import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCoordinates } from "../lib/coordinates.ts";

test("missing or invalid coordinates never silently request weather for Null Island", () => {
  for (const query of ["", "lat=35", "lon=139", "lat=&lon=", "lat= &lon=0", "lat=NaN&lon=0", "lat=0&lon=Infinity", "lat=91&lon=0", "lat=0&lon=-181"]) {
    assert.equal(parseCoordinates(new URLSearchParams(query)), null, query);
  }
});
test("zero and geographic boundaries are valid coordinates without coercing other locations", () => {
  assert.deepEqual(parseCoordinates(new URLSearchParams("lat=0&lon=0")), { latitude: 0, longitude: 0 });
  assert.deepEqual(parseCoordinates(new URLSearchParams("lat=-90&lon=180")), { latitude: -90, longitude: 180 });
  assert.deepEqual(parseCoordinates(new URLSearchParams("lat=35.57&lon=139.4")), { latitude: 35.57, longitude: 139.4 });
});
