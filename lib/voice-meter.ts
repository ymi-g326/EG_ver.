import type { AudioLayer } from "./audio-engine";

type Levels = Record<AudioLayer, number>;
const LAYERS: AudioLayer[] = ["bass", "motif", "pad", "pulse"];
const zero = (): Levels => ({ bass: 0, motif: 0, pad: 0, pulse: 0 });
const ceilings: Record<"original" | "listening", Levels> = {
  original: { bass: .32, motif: .24, pad: .075, pulse: .055 },
  listening: { bass: .085, motif: .095, pad: .075, pulse: .026 },
};

/** Retain every part's peak until the next UI frame, including simultaneous notes. */
export class VoiceMeter {
  private pending = zero();
  private current = zero();
  push(layer: AudioLayer, level: number, style: "original" | "listening") {
    if (!Number.isFinite(level) || level <= 0) return;
    this.pending[layer] = Math.max(this.pending[layer], Math.min(1, level / ceilings[style][layer]));
  }
  read(elapsedMs: number): Levels {
    const decay = Math.exp(-Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 100) / 380);
    for (const layer of LAYERS) {
      const value = Math.max(this.pending[layer], this.current[layer] * decay);
      this.current[layer] = value < .005 ? 0 : value;
    }
    this.pending = zero();
    return { ...this.current };
  }
  clear() { this.pending = zero(); this.current = zero(); }
}
