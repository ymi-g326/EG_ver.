/** Original synthesized instruments; field recordings remain a separate layer. */
export type ThemeVoice = "harp" | "water";

export function themeForProfile(profile: string): ThemeVoice | null {
  return profile === "vegetated" ? "harp" : profile === "ocean" ? "water" : null;
}

export function motifInstrument(profile: string, style: "themed" | "original" = "themed") {
  if (style === "original") return "以前のFM音色";
  const theme = themeForProfile(profile);
  return theme === "harp" ? "森のハープ" : theme === "water" ? "海の水滴・泡" : "地表のFM音色";
}

/** A finite note with a quiet start/end, deterministic across audition resets. */
export function renderThemeVoice(theme: ThemeVoice, frequency: number, duration: number, sampleRate: number): Float32Array {
  if (![frequency, duration, sampleRate].every(Number.isFinite) || frequency <= 0 || duration <= 0 || sampleRate < 8000 || frequency >= sampleRate * .45) {
    throw new RangeError("Invalid theme voice parameters");
  }
  const seconds = Math.min(3, Math.max(.08, duration));
  const samples = new Float32Array(Math.ceil(seconds * sampleRate));
  const partials = [1, .52, .28, .16, .09, .045];
  let waterPhase = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / (theme === "harp" ? .003 : .006));
    const release = Math.min(1, (samples.length - 1 - i) / (sampleRate * .025));
    let value = 0;
    if (theme === "harp") {
      // Harmonic string body; upper partials die away before the fundamental.
      for (let k = 0; k < partials.length; k++) {
        const harmonic = k + 1;
        if (frequency * harmonic >= sampleRate * .45) break;
        value += partials[k] * Math.sin(2 * Math.PI * frequency * harmonic * t)
          * Math.exp(-(4.2 + k * 1.8) * t / seconds);
      }
      value *= .66;
    } else {
      // A quick upward bubble glide settles onto the musical note within 80 ms.
      const pitch = frequency * (1 - .52 * Math.exp(-t / .014));
      waterPhase += 2 * Math.PI * pitch / sampleRate;
      value = .82 * Math.sin(waterPhase) * Math.exp(-5.5 * t / seconds)
        + .2 * Math.sin(waterPhase * 2.73) * Math.exp(-t / .032);
    }
    samples[i] = value * attack * release;
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  // Preserve normal dynamics while bounding any coincident partial peaks.
  if (peak > .95) for (let i = 0; i < samples.length; i++) samples[i] *= .95 / peak;
  return samples;
}
