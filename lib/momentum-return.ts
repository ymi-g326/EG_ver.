import type { GeoPoint } from "./globe-geometry";
import type { GlobeMomentum } from "./globe-motion";
import { LIVE_RETURN_GLIDE_MS, longitudeDelta } from "./live-return";

const COAST_SECONDS = .5;
const FORWARD_SPIN_SPEED = 160;
const wrap = (longitude: number) => ((longitude + 180) % 360 + 360) % 360 - 180;
const latitude = (value: number) => Math.max(-75, Math.min(75, value));
const limitSpeed = (value: number, max: number) => Number.isFinite(value) ? Math.max(-max, Math.min(max, value)) : 0;
const validPoint = (point: GeoPoint) => Number.isFinite(point.longitude) && Number.isFinite(point.latitude);

export type MomentumReturnPlan = {
  from: GeoPoint;
  target: GeoPoint;
  motion: GlobeMomentum;
  longitudeTravel: number;
  latitudeCoastSeconds: number;
};

/** Choose a fixed, unwrapped landing lap so a fast throw need not reverse to reach LIVE. */
export function planMomentumReturn(from: GeoPoint, target: GeoPoint, velocity: GlobeMomentum): MomentumReturnPlan {
  const origin = validPoint(from) ? { latitude: latitude(from.latitude), longitude: wrap(from.longitude) } : { latitude: 20, longitude: 135 };
  const destination = validPoint(target) ? { latitude: latitude(target.latitude), longitude: wrap(target.longitude) } : { ...origin };
  const motion = { longitude: limitSpeed(velocity.longitude, 480), latitude: limitSpeed(velocity.latitude, 300) };
  const latitudeRoom = motion.latitude >= 0 ? 75 - origin.latitude : origin.latitude + 75;
  if (!latitudeRoom) motion.latitude = 0;
  const latitudeCoastSeconds = motion.latitude ? Math.min(COAST_SECONDS, latitudeRoom / Math.abs(motion.latitude)) : COAST_SECONDS;
  let longitudeTravel = longitudeDelta(origin.longitude, destination.longitude);
  const carry = motion.longitude * COAST_SECONDS * (1 - Math.exp(-LIVE_RETURN_GLIDE_MS / 1000 / COAST_SECONDS));
  if (motion.longitude >= FORWARD_SPIN_SPEED)
    longitudeTravel += Math.max(0, Math.ceil((carry - longitudeTravel) / 360)) * 360;
  else if (motion.longitude <= -FORWARD_SPIN_SPEED)
    longitudeTravel -= Math.max(0, Math.ceil((longitudeTravel - carry) / 360)) * 360;
  return { from: origin, target: destination, motion, longitudeTravel, latitudeCoastSeconds };
}

/** Blend ongoing exponential inertia into the landing, preserving entry velocity and acceleration. */
export function momentumReturnView(plan: MomentumReturnPlan, target: GeoPoint, elapsedMs: number): GeoPoint {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, Math.min(LIVE_RETURN_GLIDE_MS, elapsedMs)) : 0;
  const destination = validPoint(target) ? { latitude: latitude(target.latitude), longitude: wrap(target.longitude) } : plan.target;
  if (elapsed === 0) return { ...plan.from };
  if (elapsed >= LIVE_RETURN_GLIDE_MS) return { ...destination };
  const t = elapsed / LIVE_RETURN_GLIDE_MS, ease = t ** 3 * (10 - 15 * t + 6 * t * t), seconds = elapsed / 1000;
  const longitudeCoast = plan.from.longitude + plan.motion.longitude * COAST_SECONDS * (1 - Math.exp(-seconds / COAST_SECONDS));
  const latitudeCoast = plan.from.latitude + plan.motion.latitude * plan.latitudeCoastSeconds * (1 - Math.exp(-seconds / plan.latitudeCoastSeconds));
  const landingLongitude = plan.from.longitude + plan.longitudeTravel + longitudeDelta(plan.target.longitude, destination.longitude);
  return {
    longitude: wrap(longitudeCoast + (landingLongitude - longitudeCoast) * ease),
    latitude: latitude(latitudeCoast + (destination.latitude - latitudeCoast) * ease),
  };
}

/** Tangent of the actual landing path, including wrapped longitude, for scratch playback. */
export function momentumReturnMotion(plan: MomentumReturnPlan, target: GeoPoint, elapsedMs: number): GlobeMomentum {
  if (!Number.isFinite(elapsedMs) || elapsedMs >= LIVE_RETURN_GLIDE_MS) return { longitude: 0, latitude: 0 };
  if (elapsedMs <= 0) return { ...plan.motion };
  const start = Math.max(0, elapsedMs - 4), end = Math.min(LIVE_RETURN_GLIDE_MS, elapsedMs + 4);
  const a = momentumReturnView(plan, target, start), b = momentumReturnView(plan, target, end);
  const seconds = (end - start) / 1000;
  return { longitude: longitudeDelta(a.longitude, b.longitude) / seconds, latitude: (b.latitude - a.latitude) / seconds };
}
