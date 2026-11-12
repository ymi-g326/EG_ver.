import * as satellite from "satellite.js";
import { validateOrbit, MAX_ORBIT_AGE_DAYS } from "./orbit";
import type { InspectOrbit } from "./inspect-data";
import type { GeoPoint } from "./globe-geometry";
import { EARTH_DISPLAY_RADIUS_KM } from "./globe-atmosphere";

export type ReferenceSite = GeoPoint & { heightKm: number; minimumElevation: number };
export const DEFAULT_REFERENCE_SITE: ReferenceSite = { latitude: 35, longitude: 139, heightKm: 0, minimumElevation: 10 };
export type LookAngles = { azimuth: number; elevation: number; rangeKm: number };
export type OrbitPass = { aos: number; maxAt: number; los: number; maxElevation: number; azimuthAtAos: number; azimuthAtLos: number };

export function validReferenceSite(site: ReferenceSite) {
  return [site.latitude, site.longitude, site.heightKm, site.minimumElevation].every(Number.isFinite)
    && Math.abs(site.latitude) <= 90 && Math.abs(site.longitude) <= 180
    && site.heightKm >= -.5 && site.heightKm <= 10 && site.minimumElevation >= 0 && site.minimumElevation <= 85;
}

export function lookAnglesToEcf(site: ReferenceSite, position: satellite.EcfVec3<number>): LookAngles | null {
  if (!validReferenceSite(site) || ![position.x, position.y, position.z].every(Number.isFinite)) return null;
  const result = satellite.ecfToLookAngles({ latitude: site.latitude * Math.PI / 180, longitude: site.longitude * Math.PI / 180, height: site.heightKm }, position);
  if (![result.azimuth, result.elevation, result.rangeSat].every(Number.isFinite)) return null;
  return { azimuth: (result.azimuth * 180 / Math.PI + 360) % 360, elevation: result.elevation * 180 / Math.PI, rangeKm: result.rangeSat };
}

export function orbitReader(orbit: InspectOrbit, now: number) {
  const verified = validateOrbit(orbit.line1, orbit.line2, new Date(now));
  const record = satellite.twoline2satrec(orbit.line1, orbit.line2);
  const expiresAt = Date.parse(verified.epoch) + MAX_ORBIT_AGE_DAYS * 86_400_000;
  return {
    expiresAt,
    look(time: number, site: ReferenceSite): LookAngles | null {
      if (!Number.isFinite(time) || time > expiresAt) return null;
      const date = new Date(time), result = satellite.propagate(record, date);
      if (!result.position || typeof result.position === "boolean") return null;
      return lookAnglesToEcf(site, satellite.eciToEcf(result.position, satellite.gstime(date)));
    },
  };
}

/** Geometric passes above a configured elevation mask; not RF reception or optical visibility.
 * 30 s search, <0.5 s crossing refinement, and <=1 s peak search. */
export function predictPasses(orbit: InspectOrbit, site: ReferenceSite, now: number, limit = 3) {
  if (!validReferenceSite(site) || !Number.isFinite(now)) throw new Error("Invalid reference site or time");
  const reader = orbitReader(orbit, now);
  const until = Math.min(now + 86_400_000, reader.expiresAt);
  const from = now - 120 * 60_000, step = 30_000;
  const elevation = (time: number) => reader.look(time, site)?.elevation ?? -90;
  const crossing = (a: number, b: number) => {
    const above = elevation(a) >= site.minimumElevation;
    while (b - a > 500) { const mid = (a + b) / 2; if ((elevation(mid) >= site.minimumElevation) === above) a = mid; else b = mid; }
    return (a + b) / 2;
  };
  const passes: OrbitPass[] = [];
  const peak = (left: number, right: number) => {
    let a = left, b = right;
    while (b - a > 250) { const l = a + (b - a) / 3, r = b - (b - a) / 3; if (elevation(l) < elevation(r)) a = l; else b = r; }
    return (a + b) / 2;
  };
  let previousTime = from, previous = elevation(from), start: number | null = null;
  let beforeTime = from, before = previous;
  for (let time = from + step; time <= until + step; time += step) {
    const end = Math.min(time, until), current = elevation(end);
    if (previous < site.minimumElevation && current >= site.minimumElevation) start = crossing(previousTime, end);
    if (previous >= site.minimumElevation && current < site.minimumElevation && start != null) {
      const los = crossing(previousTime, end);
      if (los >= now) {
        // Elevation during a low-Earth-orbit pass has a single maximum.
        const maxAt = peak(start, los);
        passes.push({ aos: start, maxAt, los, maxElevation: elevation(maxAt), azimuthAtAos: reader.look(start, site)!.azimuth, azimuthAtLos: reader.look(los, site)!.azimuth });
        if (passes.length >= Math.max(1, Math.min(10, limit))) break;
      }
      start = null;
    }
    // A grazing pass may rise and set entirely between 30 s samples. Refine every
    // sampled local maximum, rather than interpreting all-below samples as no pass.
    if (start == null && before < site.minimumElevation && previous < site.minimumElevation && current < site.minimumElevation && previous > before && previous >= current) {
      const maxAt = peak(beforeTime, end);
      if (elevation(maxAt) >= site.minimumElevation) {
        const aos = crossing(beforeTime, maxAt), los = crossing(maxAt, end);
        if (los >= now) {
          passes.push({ aos, maxAt, los, maxElevation: elevation(maxAt), azimuthAtAos: reader.look(aos, site)!.azimuth, azimuthAtLos: reader.look(los, site)!.azimuth });
          if (passes.length >= Math.max(1, Math.min(10, limit))) break;
        }
      }
    }
    if (end >= until) break;
    beforeTime = previousTime; before = previous;
    previousTime = end; previous = current;
  }
  return { passes, generatedAt: now, until, expiresAt: reader.expiresAt };
}

/** Spherical geometric elevation-mask boundary. Terrain, RF and antenna patterns are excluded. */
export function visibilityBoundary(point: GeoPoint, altitudeKm: number, minimumElevation: number): GeoPoint[] {
  if (![point.latitude, point.longitude, altitudeKm, minimumElevation].every(Number.isFinite) || altitudeKm < 0 || minimumElevation < 0 || minimumElevation > 85) return [];
  const rad = Math.PI / 180, lat = point.latitude * rad, lon = point.longitude * rad;
  const mask = minimumElevation * rad;
  const angle = Math.acos(EARTH_DISPLAY_RADIUS_KM / (EARTH_DISPLAY_RADIUS_KM + altitudeKm) * Math.cos(mask)) - mask;
  return Array.from({ length: 181 }, (_, i) => {
    const bearing = i * 2 * rad;
    const phi = Math.asin(Math.sin(lat) * Math.cos(angle) + Math.cos(lat) * Math.sin(angle) * Math.cos(bearing));
    const lambda = lon + Math.atan2(Math.sin(bearing) * Math.sin(angle) * Math.cos(lat), Math.cos(angle) - Math.sin(lat) * Math.sin(phi));
    return { latitude: phi / rad, longitude: ((lambda / rad + 180) % 360 + 360) % 360 - 180 };
  });
}
