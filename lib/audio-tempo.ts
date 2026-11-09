export type TempoSettings = { mode: "auto" | "manual"; manualBpm: number };
export type TempoProfile = "ambient" | "groove" | "original";
export type TempoInput = { wind: number | null };
export type TempoRuntime = { bpm: number; targetBpm: number; source: "wind" | "held" | "waiting" | "manual"; mode: "auto" | "manual"; wind: number | null };
export const DEFAULT_TEMPO: TempoSettings = { mode: "auto", manualBpm: 80 };
export const WIND_BPM_POINTS = [[0,80],[3,95],[6,110],[10,125],[15,140],[20,150]] as const;
export const AUTO_BPM_MAX: Record<TempoProfile, number> = { ambient: 100, groove: 150, original: 150 };
export const AUTO_BPM_PER_SECOND = 10;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export function resolveTempo(input: TempoInput, settings: TempoSettings = DEFAULT_TEMPO, heldBpm?: number, profile: TempoProfile = "original") {
  const windAvailable = input.wind !== null && Number.isFinite(input.wind) && input.wind >= 0;
  const wind = windAvailable ? input.wind as number : null;
  let autoBpm: number | null = null;
  if (wind !== null) {
    autoBpm = 150;
    for (let i=1; i<WIND_BPM_POINTS.length; i++) {
      const [a, x] = WIND_BPM_POINTS[i-1], [b, y] = WIND_BPM_POINTS[i];
      if (wind <= b) { autoBpm = x + (wind-a)/(b-a)*(y-x); break; }
    }
    // Use the same wind curve, scaling its entire range instead of clipping strong winds.
    autoBpm = 80 + (autoBpm - 80) * (AUTO_BPM_MAX[profile] - 80) / 70;
  }
  const manualBpm = Number.isFinite(settings.manualBpm) ? clamp(Math.round(settings.manualBpm),80,150) : 80;
  const source: TempoRuntime["source"] = settings.mode === "manual" ? "manual" : windAvailable ? "wind" : heldBpm === undefined ? "waiting" : "held";
  const heldAutoBpm = heldBpm === undefined ? undefined : clamp(heldBpm, 80, AUTO_BPM_MAX[profile]);
  const targetBpm = settings.mode === "manual" ? manualBpm : autoBpm ?? heldAutoBpm ?? 80;
  return { mode: settings.mode, bpm: targetBpm, targetBpm, autoBpm, manualBpm, wind, windAvailable, source };
}
/** AUTO moves at at most 10 BPM/second. Missing wind freezes the audible tempo. */
export function advanceTempo(previous: TempoRuntime | null, input: TempoInput, settings: TempoSettings, elapsed: number, profile: TempoProfile = "original"): TempoRuntime {
  const resolved = resolveTempo(input,settings,previous?.bpm,profile);
  const maxStep = AUTO_BPM_PER_SECOND * (Number.isFinite(elapsed) ? Math.max(0,elapsed) : 0);
  const bpm = !previous || settings.mode === "manual" ? resolved.bpm
    : previous.bpm + clamp(resolved.targetBpm-previous.bpm,-maxStep,maxStep);
  return { bpm, targetBpm: resolved.targetBpm, source: resolved.source, mode: settings.mode, wind: resolved.wind };
}
