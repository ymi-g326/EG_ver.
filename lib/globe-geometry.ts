export type GeoPoint = { latitude: number; longitude: number };
export type GlobePoint = { x: number; y: number; z: number };
const RAD = Math.PI / 180;

/** Orthographic camera; depth >= 0 is the hemisphere facing the listener. */
export function projectGlobe(point: GeoPoint, longitude: number, latitude: number): GlobePoint {
  const phi = point.latitude * RAD;
  const lambda = (point.longitude - longitude) * RAD;
  const tilt = latitude * RAD;
  const cos = Math.cos(phi);
  return {
    x: cos * Math.sin(lambda),
    y: -(Math.sin(phi) * Math.cos(tilt) - cos * Math.cos(lambda) * Math.sin(tilt)),
    z: Math.sin(phi) * Math.sin(tilt) + cos * Math.cos(lambda) * Math.cos(tilt),
  };
}

/** Clip an individual coastline ring to the camera's front hemisphere. */
export function clipHorizon(points: GlobePoint[]): GlobePoint[] {
  if (!points.length) return [];
  const clipped: GlobePoint[] = [];
  let previous = points.at(-1)!;
  for (const current of points) {
    if ((current.z >= 0) !== (previous.z >= 0)) {
      const t = previous.z / (previous.z - current.z);
      const x = previous.x + (current.x - previous.x) * t;
      const y = previous.y + (current.y - previous.y) * t;
      const length = Math.hypot(x, y) || 1;
      clipped.push({ x: x / length, y: y / length, z: 0 });
    }
    if (current.z >= 0) clipped.push(current);
    previous = current;
  }
  return clipped;
}

export function scratchVelocity(dx: number, elapsedMs: number) {
  if (!Number.isFinite(dx) || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.max(-1, Math.min(1, dx / elapsedMs * .65));
}

/** Both viewing and sound use this same spherical drag; orbital coordinates are never edited. */
export function rotateGlobeView(view: GeoPoint, dx: number, dy: number): GeoPoint {
  if (![view.latitude, view.longitude, dx, dy].every(Number.isFinite)) return { latitude: 20, longitude: 135 };
  return {
    latitude: Math.max(-75, Math.min(75, view.latitude + dy * .25)),
    longitude: ((view.longitude - dx * .32 + 180) % 360 + 360) % 360 - 180,
  };
}
