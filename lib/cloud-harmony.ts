export type CloudTonality = "major" | "minor";
export const CLOUD_TONALITY_LIMITS = { major: .35, minor: .65 } as const;

/** A musical mapping, not an inference about emotion or a meteorological class. */
export function deriveCloudTonality(cloud: number, previous: CloudTonality = "major"): CloudTonality {
  if (!Number.isFinite(cloud)) return previous;
  if (cloud <= CLOUD_TONALITY_LIMITS.major) return "major";
  if (cloud >= CLOUD_TONALITY_LIMITS.minor) return "minor";
  return previous;
}

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const THEMES = { major: [0, 4, 7, 12], minor: [12, 7, 3, 0] };
/** Four foreground notes expose the third and a recognizable musical gesture.
 * Extra notes still come from image-driven density; note length follows BPM. */
export function cloudMotif(tonality: CloudTonality, step: number, seed: number) {
  const anchor = step % 4 === 0;
  const scale = SCALES[tonality];
  const index = ((step + seed) % scale.length + scale.length) % scale.length;
  return {
    anchor,
    interval: anchor ? THEMES[tonality][Math.floor(step / 4) % 4]
      : scale[tonality === "major" ? index : scale.length - 1 - index],
    beats: (tonality === "major" ? .6 : 1.4) * (anchor ? 1 : .65),
  };
}
