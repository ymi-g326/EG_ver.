import type { GeoPoint } from "./globe-geometry";

export const LIVE_RETURN_IDLE_MS = 10_000;
export const LIVE_RETURN_GLIDE_MS = 3_600;
export const LIVE_RETURN_CHECK_MS = 50;

/** Playing scratches return on release; paused views and chosen places retain the idle clock. */
export class LiveReturnIdle {
  private lastActivity = 0;
  private away = false;
  private returnOnRelease = true;
  private pointers = new Set<number>();
  private keys = new Set<string>();
  get isAway() { return this.away; }
  touch(now: number) { if (Number.isFinite(now)) this.lastActivity = now; }
  leaveLive(now: number, returnOnRelease = true) { this.away = true; this.returnOnRelease = returnOnRelease; this.touch(now); }
  hold(id: number, now: number) { this.pointers.add(id); this.touch(now); }
  release(id: number, now: number) { if (this.pointers.delete(id)) this.touch(now); }
  holdKey(key: string, now: number) { this.keys.add(key); this.touch(now); }
  releaseKey(key: string, now: number) { if (this.keys.delete(key)) this.touch(now); }
  releaseAll(now: number) { this.pointers.clear(); this.keys.clear(); this.touch(now); }
  returned(now: number) { this.away = false; this.touch(now); }
  shouldReturn(now: number, enabled: boolean, playing = false) {
    if (!enabled) { this.touch(now); return false; }
    return Number.isFinite(now) && this.away && !this.pointers.size && !this.keys.size
      && ((playing && this.returnOnRelease) || now - this.lastActivity >= LIVE_RETURN_IDLE_MS);
  }
}

export function longitudeDelta(from: number, to: number) {
  return ((to - from + 180) % 360 + 360) % 360 - 180;
}

/** Move along the short longitude arc, following the latest satellite target. */
export function liveReturnView(from: GeoPoint, to: GeoPoint, progress: number): GeoPoint {
  const t = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const eased = t ** 3 * (10 - 15 * t + 6 * t * t);
  const longitude = from.longitude + longitudeDelta(from.longitude, to.longitude) * eased;
  const latitude = from.latitude + (Math.max(-75, Math.min(75, to.latitude)) - from.latitude) * eased;
  return { longitude: ((longitude + 180) % 360 + 360) % 360 - 180, latitude };
}
