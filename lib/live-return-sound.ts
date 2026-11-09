export const LIVE_RETURN_SOUND_SECONDS = 4.2;
export const LIVE_RETURN_SOUND_LEVEL = .14;

/** Slow, descending low tones and a dark, diffuse tail evoke a gentle gravitational pull. */
export function renderLiveReturnSound(sampleRate: number, durationSeconds = LIVE_RETURN_SOUND_SECONDS): Float32Array {
  if (!Number.isFinite(sampleRate) || sampleRate < 4000 || sampleRate > 192000) throw new RangeError("Unsupported sample rate");
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > LIVE_RETURN_SOUND_SECONDS) throw new RangeError("Unsupported duration");
  const data = new Float32Array(Math.ceil(sampleRate * durationSeconds));
  const timeScale = durationSeconds / LIVE_RETURN_SOUND_SECONDS;
  const tailDelay = Math.round(sampleRate * .24);
  const echo = new Float32Array(tailDelay);
  let phase = 0, driftPhase = 0, darkNoise = 0, seed = 73421;
  const noiseMix = 1 - Math.exp(-2 * Math.PI * 190 / sampleRate);
  for (let i = 0; i < data.length; i++) {
    const time = i / sampleRate;
    const progress = time / durationSeconds;
    const attack = Math.sin(Math.min(1, time / (.7 * timeScale)) * Math.PI / 2) ** 2;
    const release = Math.cos(progress * Math.PI / 2) ** 2;
    const frequency = 48 + 50 * Math.exp(-time / (1.2 * timeScale));
    phase += 2 * Math.PI * frequency / sampleRate;
    driftPhase += 2 * Math.PI * (frequency * 1.006) / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    darkNoise += noiseMix * (seed / 2147483648 - 1 - darkNoise);
    const body = Math.sin(phase) * .55 + Math.sin(driftPhase) * .18
      + Math.sin(phase * 2 + .2) * .23 + Math.sin(phase * 3) * .05;
    const dry = Math.tanh(body * 1.3) * attack * release;
    const delayed = echo[i % tailDelay];
    echo[i % tailDelay] = dry * .2 + delayed * .35;
    // The final envelope also fades delayed energy, leaving a click-free silent endpoint.
    const edge = Math.min(1, (data.length - 1 - i) / (sampleRate * .16));
    data[i] = Math.max(-.85, Math.min(.85, dry * .7 + delayed * .22 + darkNoise * attack * release * .07)) * Math.max(0, edge);
  }
  return data;
}
