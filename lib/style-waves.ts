import { SCRATCH_WAVE_INTERVAL_MS } from "./scratch-feedback";
import { styleWaveVector, type FeedbackStyle } from "./style-feedback";

export const MAX_STYLE_WAVES = 8;
export const WAVE_DISPLACEMENT_SCALE = 84;
export type StyleWave = {
  style: FeedbackStyle; x: number; y: number; reach: number;
  started: number; durationMs: number; strength: number;
  kind: "style" | "scratch";
  detail?: number;
};
export type ActiveStyleWave = StyleWave & { progress: number };

/** Little movements make close, tightly spaced ripples; broad gestures reach the viewport. */
export function scratchWaveSpec(style: FeedbackStyle, size: number, viewportReach: number) {
  const amount = Number.isFinite(size) ? Math.max(0, Math.min(1, size)) : 0;
  return {
    reach: Math.min(viewportReach, 70 + Math.pow(amount, 1.1) * Math.max(0, viewportReach - 70)),
    durationMs: Math.round(style === "ambient" ? 480 + amount * 370 : 540 + amount * 410),
    detail: .3 + amount * .7,
  };
}

export function activeStyleWaves(waves: readonly StyleWave[], now: number): ActiveStyleWave[] {
  // A rAF timestamp can precede a pointer event handled in that frame. Keep its new wave.
  return waves.filter(wave => now < wave.started + wave.durationMs)
    .map(wave => ({ ...wave, progress: Math.max(0, (now - wave.started) / wave.durationMs) }));
}

export function appendStyleWave(waves: readonly StyleWave[], wave: StyleWave, continuation = false): StyleWave[] {
  if (![wave.x, wave.y, wave.reach, wave.started, wave.durationMs, wave.strength].every(Number.isFinite)
    || wave.reach <= 0 || wave.durationMs <= 0 || wave.strength <= 0
    || (wave.detail !== undefined && (!Number.isFinite(wave.detail) || wave.detail <= 0))) return [...waves];
  const live = wave.kind === "style" ? [] : activeStyleWaves(waves, wave.started);
  const next = { ...wave, strength: Math.min(1, wave.strength) }, last = live.at(-1);
  if (continuation && last?.kind === "scratch" && last.style === wave.style && wave.started >= last.started && wave.started - last.started < SCRATCH_WAVE_INTERVAL_MS + 32) {
    return [...live.slice(0, -1), { ...next, x: last.x, y: last.y, started: last.started }];
  }
  return [...live, next].slice(-MAX_STYLE_WAVES);
}

/** Sum overlapping packets, limiting their combined refraction instead of moving the map. */
export function sampleStyleWaves(waves: readonly ActiveStyleWave[], x: number, y: number) {
  let dx = 0, dy = 0;
  for (const wave of waves) {
    const detail = wave.detail ?? 1;
    const offsetX = x - wave.x, offsetY = y - wave.y;
    if (wave.kind === "scratch" && Math.hypot(offsetX, offsetY) > wave.reach * 1.25 + 110 * detail) continue;
    const vector = styleWaveVector(wave.style, offsetX / detail, offsetY / detail, wave.reach / detail, wave.progress);
    dx += vector.x * wave.strength; dy += vector.y * wave.strength;
  }
  const limit = WAVE_DISPLACEMENT_SCALE / 2 - 1;
  return { x: Math.max(-limit, Math.min(limit, dx)), y: Math.max(-limit, Math.min(limit, dy)) };
}
