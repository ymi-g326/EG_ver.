/** Narrow screens and touch-first devices use the same sound with a cheaper visual pass. */
export const COMPACT_RENDER_QUERY = "(max-width: 700px), (pointer: coarse)";

export function renderQuality(compact: boolean, pixelRatio = 1) {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  return {
    refract: !compact,
    pixelRatio: Math.min(compact ? 1.5 : 2, ratio),
    cloudSize: compact ? 96 : 160,
    cloudInterval: compact ? 100 : 64,
    waveLimit: compact ? 3 : 8,
    waveSegments: compact ? 72 : 224,
    waveShadow: compact ? 0 : 15,
  };
}
