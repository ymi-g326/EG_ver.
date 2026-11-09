/** Two independent musical controls: terrain is the instrument, sky modulates it. */
export type SoundscapeFeatures = {
  earthProfile: string; brightness: number; saturation: number; variance: number; edgeDensity: number; blue: number;
  cloud: number; cloudTexture?: number; cloudEdges?: number;
  groundBrightness?: number; groundSaturation?: number; groundVariance?: number; groundEdges?: number; groundBlue?: number;
};
const clamp = (v: number) => Math.min(1, Math.max(0, v));
export function deriveCloudSound(f: SoundscapeFeatures) {
  const sea = f.earthProfile === "ocean";
  const complexity = clamp((f.cloudTexture ?? 0) * .55 + (f.cloudEdges ?? 0) * .45);
  const coverage = clamp(f.cloud);
  return {
    sea, complexity, coverage,
    brightness: f.groundBrightness ?? f.brightness, saturation: f.groundSaturation ?? f.saturation,
    variance: f.groundVariance ?? f.variance, edges: f.groundEdges ?? f.edgeDensity, blue: f.groundBlue ?? f.blue,
    melodyBoost: (coverage * .24 + complexity * .34) * (sea ? 1 : .12),
    cutoffMultiplier: 1 - coverage * (sea ? .12 : .3),
    reverb: .035 + coverage * (sea ? .18 : .14) + complexity * .03,
    padLevel: .028 + coverage * .006 + complexity * .003,
    pulseDensity: sea ? clamp(coverage * .24 + complexity * .55) : 0,
  };
}
