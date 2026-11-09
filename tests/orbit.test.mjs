import { test } from "node:test";
import assert from "node:assert/strict";
import * as satellite from "satellite.js";
import { parseOrbit, validateOrbit, retainOrbit } from "../lib/orbit.ts";
import reference from "../data/tenkoh2-reference.json" with { type: "json" };

const now = new Date("2026-10-14T00:00:00Z");

test("verified Ten-Koh 2 elements propagate to a realistic low Earth orbit", () => {
  const orbit = parseOrbit(`${reference.name}\r\n${reference.line1}\r\n${reference.line2}\r\n`, now);
  assert.ok(orbit.epoch.startsWith("2026-10-13"));
  const record = satellite.twoline2satrec(orbit.line1, orbit.line2);
  const result = satellite.propagate(record, now);
  assert.ok(result.position && typeof result.position !== "boolean");
  const geo = satellite.eciToGeodetic(result.position, satellite.gstime(now));
  assert.ok(geo.height > 400 && geo.height < 550);
  assert.ok(Math.abs(satellite.degreesLat(geo.latitude)) < 52);
});

test("rejects other spacecraft, corrupt elements, and old reference data", () => {
  assert.throws(() => validateOrbit(reference.line1.replace("68261", "25544"), reference.line2, now));
  assert.throws(() => validateOrbit(reference.line1.replace("68261", "66174"), reference.line2, now));
  assert.throws(() => validateOrbit(reference.line1.slice(0, 68) + "0", reference.line2, now));
  assert.throws(() => parseOrbit("No GP data found", now));
  assert.throws(() => validateOrbit(reference.line1, reference.line2, new Date("2026-10-22T00:00:00Z")));
});

test("transient refresh failures retain only recent Ten-Koh 2 data and mark it as a saved estimate", () => {
  const previous = { ...reference, mode: "live", fetchedAt: "2026-10-14T00:00:00Z" };
  const retained = retainOrbit(previous, now);
  assert.equal(retained.mode, "reference");
  assert.equal(retained.line1, previous.line1);
  assert.equal(retained.fetchedAt, previous.fetchedAt);
  assert.equal(previous.mode, "live", "the previous snapshot remains immutable");
  assert.equal(retainOrbit(null, now), null, "first-load failure cannot invent an orbit");
  assert.equal(retainOrbit(previous, new Date("2026-10-22T00:00:00Z")), null);
  assert.equal(retainOrbit({ ...previous, line1: previous.line1.replace("68261", "25544") }, now), null);
});
