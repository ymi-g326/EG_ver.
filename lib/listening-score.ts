import { deriveCloudSound, type SoundscapeFeatures } from "./cloud-sound";

export type ListeningPhrase = "flow" | "lift" | "breath";
const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Environmental detail controls ornaments; an eight-bar musical phrase controls space.
 * Neither the phrase nor the note pattern is an observation of the satellite. */
export function listeningScore(features: SoundscapeFeatures, ambient: boolean, bar: number) {
  const sky = deriveCloudSound(features);
  const detail = sky.sea ? clamp(sky.complexity)
    : clamp(sky.edges * .7 + sky.variance * .3);
  const phase = ((Math.floor(bar) % 8) + 8) % 8;
  const phrase: ListeningPhrase = phase === 7 ? "breath" : phase >= 4 ? "lift" : "flow";
  const motifSteps = ambient ? [0, ...(phase % 2 === 1 ? [10] : [])]
    : phrase === "breath" ? [0, 4, 8, 12] : [0, 2, 4, 6, 8, 10, 12, 14];
  const ornaments = !ambient && phrase !== "breath"
    ? [3, 7, 11, 15].slice(0, Math.floor(detail * 4)) : [];
  // Rotate ornament positions through a phrase without random rerolls on every tick.
  const ornamentSteps = ornaments.map(step => (step + phase * 4) % 16);
  return {
    detail, detailSource: sky.sea ? "cloud-texture" as const : "surface-texture" as const,
    phrase, motifSteps, ornamentSteps,
    bassSteps: ambient ? (phase % 2 === 0 ? [0] : []) : phrase === "breath" ? [0, 8] : [0, 6, 8, 14],
    kickSteps: ambient ? [] : phrase === "breath" ? [0, 8] : [0, 4, 8, 12],
    hatSteps: ambient ? [] : phrase === "breath" ? [2, 10] : [0, 2, 4, 6, 8, 10, 12, 14],
    brushSteps: ambient ? [] : [4, 12],
  };
}
