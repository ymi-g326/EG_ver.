export type ScratchWavePulse = { strength: number; size: number; continuation?: boolean };
export type ScratchWaveSource = ScratchWavePulse & { x: number; y: number };

type MotionPoint = { x: number; y: number; time: number };
const WINDOW_MS = 220;
export const SCRATCH_WAVE_INTERVAL_MS = 120;
const GESTURE_GAIN = .48;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Inputs use CSS pixels / milliseconds; signed velocity makes a fold an acceleration. */
export function scratchWaveResponse(span: number, speed: number, acceleration: number): ScratchWavePulse {
  if (![span, speed, acceleration].every(Number.isFinite)) return { size: 0, strength: 0 };
  const amplitude = clamp(span * GESTURE_GAIN / 180), pace = clamp(speed * GESTURE_GAIN / 1.4), impulse = clamp(acceleration * GESTURE_GAIN / .035);
  const size = clamp(amplitude * .78 + pace * .12 + impulse * .32);
  return { size, strength: clamp(.22 + .5 * Math.sqrt(size) + .18 * impulse + .1 * pace) };
}

/** Every meaningful move updates the current wave, with a fresh front every 120ms. */
export class ScratchWaveTracker {
  private pending = { x: 0, y: 0, ms: 0 };
  private point = { x: 0, y: 0 };
  private history: MotionPoint[] = [];
  private velocity = { x: 0, y: 0 };
  private acceleration = 0;
  private lastPulse = -Infinity;
  private lastHand: ScratchWavePulse = { size: .02, strength: .3 };
  private coastTravel = 0;

  reset() {
    this.pending = { x: 0, y: 0, ms: 0 }; this.point = { x: 0, y: 0 }; this.history = [];
    this.velocity = { x: 0, y: 0 }; this.acceleration = 0;
    this.lastPulse = -Infinity; this.lastHand = { size: .02, strength: .3 }; this.coastTravel = 0;
  }

  move(dx: number, dy: number, elapsedMs: number, rotationDegrees: number, now: number): ScratchWavePulse | null {
    if (![dx, dy, elapsedMs, rotationDegrees, now].every(Number.isFinite) || elapsedMs < 0) return null;
    if (elapsedMs > 200) {
      this.history = []; this.velocity = { x: 0, y: 0 }; this.acceleration = 0;
      this.pending = { x: 0, y: 0, ms: 0 };
    }
    this.pending.x += dx; this.pending.y += dy; this.pending.ms += elapsedMs;
    if (Math.hypot(this.pending.x, this.pending.y) < 1.5 || this.pending.ms <= 0) return null;
    const dt = Math.max(8, this.pending.ms);
    if (!this.history.length) this.history.push({ ...this.point, time: now - Math.min(dt, WINDOW_MS) });
    this.point.x += this.pending.x; this.point.y += this.pending.y;
    // Bucket only the position history; velocity still uses every accepted motion sample.
    const sample = { ...this.point, time: now }, last = this.history.at(-1)!;
    if (this.history.length > 1 && Math.floor(last.time / 8) === Math.floor(now / 8)) this.history[this.history.length - 1] = sample;
    else this.history.push(sample);
    while (this.history.length > 2 && this.history[1].time < now - WINDOW_MS) this.history.shift();
    if (this.history.length > 64) this.history.splice(0, this.history.length - 64);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of this.history) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const blend = 1 - Math.exp(-dt / 24);
    const next = {
      x: this.velocity.x + (this.pending.x / dt - this.velocity.x) * blend,
      y: this.velocity.y + (this.pending.y / dt - this.velocity.y) * blend,
    };
    const acceleration = Math.hypot(next.x - this.velocity.x, next.y - this.velocity.y) / dt;
    this.acceleration = Math.max(acceleration, this.acceleration * Math.exp(-dt / 90));
    this.velocity = next; this.pending = { x: 0, y: 0, ms: 0 };
    const response = scratchWaveResponse(Math.hypot(maxX - minX, maxY - minY), Math.hypot(next.x, next.y), this.acceleration);
    const continuation = now - this.lastPulse < SCRATCH_WAVE_INTERVAL_MS;
    if (!continuation) this.lastPulse = now;
    this.lastHand = response;
    return { ...response, continuation };
  }

  coast(rotationDegrees: number, now: number, strength: number): ScratchWavePulse | null {
    if (![rotationDegrees, now, strength].every(Number.isFinite) || strength < .18) return null;
    this.coastTravel += Math.max(0, rotationDegrees);
    if (this.coastTravel < 8 || now - this.lastPulse < SCRATCH_WAVE_INTERVAL_MS * 1.5) return null;
    this.coastTravel = 0; this.lastPulse = now;
    return { size: this.lastHand.size * clamp(strength) * .8, strength: this.lastHand.strength * clamp(strength) * .7 };
  }
}
