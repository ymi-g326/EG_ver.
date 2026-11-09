import { renderLiveReturnSound } from "./live-return-sound";

export type FeedbackStyle = "ambient" | "groove";
export const STYLE_FEEDBACK = {
  ambient: { durationMs: 1400, soundDurationMs: 1400, level: .09, displacementScale: 40 },
  groove: { durationMs: 1600, soundDurationMs: 2600, level: .1, displacementScale: 84 },
} as const;

/** Smooth periodic wiggles share their contour between the rim and actual refraction. */
export function styleWaveRim(style: FeedbackStyle, angle: number, progress: number) {
  if (style === "ambient") return Math.sin(angle * 3 + progress * 6) * 1.5;
  return Math.sin(angle * 5 + progress * 8) * 16
    + Math.sin(angle * 8 - progress * 6 + .7) * 7
    + Math.sin(angle * 3 + progress * 4 + 1.8) * 4;
}

/** A travelling radial displacement, in pixels, with a quiet start and finish. */
export function styleWaveVector(style: FeedbackStyle, dx: number, dy: number, reach: number, progress: number) {
  if (![dx, dy, reach, progress].every(Number.isFinite) || reach <= 0 || progress <= 0 || progress >= 1) return { x: 0, y: 0 };
  const distance = Math.hypot(dx, dy), radius = progress * reach * 1.25;
  const life = Math.min(1, progress / .035, (1 - progress) / .22);
  const wiggle = style === "groove" ? styleWaveRim(style, Math.atan2(dy, dx), progress) * Math.min(1, radius / 60) : 0;
  const offset = distance - radius - wiggle;
  const width = style === "ambient" ? 85 : 68;
  const packet = Math.exp(-((offset / width) ** 2));
  const carrier = Math.sin(offset / (style === "ambient" ? 18 : 16));
  const wave = carrier * packet;
  const radial = wave * (style === "ambient" ? 10 : 28);
  const arrival = progress - distance / (reach * 1.25);
  const trail = style === "groove" && arrival > 0 ? Math.exp(-arrival * 10) * Math.sin(arrival * 60) * 7.5 : 0;
  return {
    x: ((distance ? dx / distance : 0) * radial + trail) * life,
    y: ((distance ? dy / distance : 0) * radial - trail * .7) * life,
  };
}

/** Water chimes / gravitational low tones with a deliberately audible reflection tail. */
export function renderStyleFeedback(sampleRate: number, style: FeedbackStyle): Float32Array {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError("Invalid sample rate");
  const spec = STYLE_FEEDBACK[style], duration = spec.soundDurationMs / 1000;
  const data = new Float32Array(Math.ceil(sampleRate * duration));
  if (style === "groove") {
    const dry = renderLiveReturnSound(sampleRate, spec.durationMs / 1000);
    const reflections = [[.18, .55], [.37, .34], [.61, .22], [.89, .12]].map(([delay, gain]) => ({ samples: Math.round(delay * sampleRate), gain, low: 0 }));
    const smoothing = 1 - Math.exp(-2 * Math.PI * 420 / sampleRate);
    for (let i = 0; i < data.length; i++) {
      let value = dry[i] ?? 0;
      for (const tap of reflections) {
        tap.low += smoothing * ((dry[i - tap.samples] ?? 0) - tap.low);
        value += tap.low * tap.gain;
      }
      const edge = Math.min(1, (data.length - 1 - i) / (sampleRate * .16));
      data[i] = value * Math.max(0, edge);
    }
  }
  let seed = 7413, low = 0, peak = 0;
  if (style === "ambient") for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    low += (1 - Math.exp(-2 * Math.PI * 110 / sampleRate)) * ((seed / 4294967296 * 2 - 1) - low);
    let value = 0;
    for (const [start, weight] of [[0, 1], [.24, .4], [.49, .18]]) {
      const age = t - start;
      if (age < 0) continue;
      const envelope = (1 - Math.exp(-age * 110)) * Math.exp(-age * 5.5);
      const angle = 2 * Math.PI * (280 * age + 200 * .045 * (1 - Math.exp(-age / .045)));
      value += (Math.sin(angle) + .24 * Math.sin(angle * 1.99)) * envelope * weight;
    }
    value += low * .2 * Math.sin(Math.PI * t / duration) ** 2;
    const edge = Math.min(1, t / .008, (duration - t - 1 / sampleRate) / .09);
    data[i] = value * Math.max(0, edge);
  }
  for (const value of data) peak = Math.max(peak, Math.abs(value));
  if (peak) for (let i = 0; i < data.length; i++) data[i] = data[i] / peak * .6;
  data[0] = 0; data[data.length - 1] = 0;
  return data;
}
