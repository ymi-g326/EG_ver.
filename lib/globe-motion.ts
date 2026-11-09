import { rotateGlobeView, type GeoPoint } from "./globe-geometry";

/** Angular velocity in degrees/second; both rotation and sound share its decay. */
export type GlobeMomentum = { longitude: number; latitude: number };
export const STILL_GLOBE: GlobeMomentum = { longitude: 0, latitude: 0 };
export const momentumSpeed = (motion: GlobeMomentum) => Math.hypot(motion.longitude, motion.latitude);
const limit = (value: number, maximum: number) => Math.max(-maximum, Math.min(maximum, value));

export function dragMomentum(dx: number, dy: number, elapsedMs: number): GlobeMomentum {
  if (![dx, dy, elapsedMs].every(Number.isFinite) || elapsedMs <= 0) return { ...STILL_GLOBE };
  const seconds = Math.max(8, elapsedMs) / 1000;
  return { longitude: limit(-dx * .32 / seconds, 480), latitude: limit(dy * .25 / seconds, 300) };
}

export function advanceGlobeMomentum(view: GeoPoint, motion: GlobeMomentum, elapsedMs: number) {
  if (![view.longitude, view.latitude, motion.longitude, motion.latitude, elapsedMs].every(Number.isFinite) || elapsedMs <= 0 || elapsedMs > 200)
    return { view, motion: { ...STILL_GLOBE } };
  const decay = Math.exp(-elapsedMs / 500);
  const travel = .5 * (1 - decay);
  const next = rotateGlobeView(view, -motion.longitude * travel / .32, motion.latitude * travel / .25);
  const moving = { longitude: motion.longitude * decay, latitude: motion.latitude * decay };
  if (Math.abs(next.latitude) >= 75 && Math.sign(next.latitude) === Math.sign(moving.latitude)) moving.latitude = 0;
  if (momentumSpeed(moving) < 2) return { view: next, motion: { ...STILL_GLOBE } };
  return { view: next, motion: moving };
}

/** Preserve direction while fading the captured sound back into the running music. */
export function momentumScratch(motion: GlobeMomentum, initialSpeed: number) {
  if (![motion.longitude, motion.latitude, initialSpeed].every(Number.isFinite) || initialSpeed <= 0)
    return { velocity: 0, strength: 0 };
  const speed = momentumSpeed(motion);
  const velocity = Math.abs(motion.longitude) >= Math.abs(motion.latitude) ? -motion.longitude * .65 / 320 : -motion.latitude * .65 / 250;
  return { velocity: limit(velocity, 1), strength: Math.min(1, speed / initialSpeed) };
}

/** Estimate the throw from a short motion history, rather than the last trackpad event. */
export class GlobeDragMomentum {
  private points: { x: number; y: number; time: number }[] = [];
  reset() { this.points = []; }
  add(dx: number, dy: number, elapsedMs: number, now: number): GlobeMomentum {
    if (![dx, dy, elapsedMs, now].every(Number.isFinite) || elapsedMs < 0) return this.at(now);
    const last = this.points.at(-1);
    if (!last || now - last.time > 200 || now < last.time) this.points = [{ x: 0, y: 0, time: now - Math.max(8, elapsedMs) }];
    const origin = this.points.at(-1)!;
    const point = { x: origin.x + dx, y: origin.y + dy, time: now };
    if (this.points.length > 1 && origin.time === now) this.points[this.points.length - 1] = point;
    else this.points.push(point);
    while (this.points.length > 2 && this.points[1].time < now - 100) this.points.shift();
    if (this.points.length > 64) this.points.splice(0, this.points.length - 64);
    return this.at(now);
  }
  at(now: number): GlobeMomentum {
    const last = this.points.at(-1);
    if (!Number.isFinite(now) || !last || now < last.time || now - last.time >= 160) return { ...STILL_GLOBE };
    const first = this.points.find(p => p.time >= now - 100) ?? last;
    const start = first === last && this.points.length > 1 ? this.points[this.points.length - 2] : first;
    return dragMomentum(last.x - start.x, last.y - start.y, now - start.time);
  }
}
