import type { AudioFeatures } from "./audio-engine";

const base: AudioFeatures = {
  brightness: .4, saturation: .45, variance: .18, edgeDensity: .12, blue: .88, delta: .04,
  groundBrightness: .32, groundSaturation: .38, groundVariance: .12, groundEdges: .1, groundBlue: .9,
  cloud: .06, cloudTexture: .05, cloudEdges: .06,
  latitude: 0, temperature: 20, wind: null, wave: null, isDay: true,
  tonality: "major", earthProfile: "ocean", source: "audition",
};
export const AUDITION_PRESETS = [
  { id: "sea-clear", label: "晴れた海", detail: "水滴・泡＋波 · 雲6% · 細かな雲は少なめ", features: { ...base } },
  { id: "sea-cloudy", label: "雲の多い海", detail: "同じ水滴・泡＋波 · 雲85% · 雲の縁と濃淡が多め", features: { ...base, cloud: .85, cloudTexture: .7, cloudEdges: .8, tonality: "minor" } },
  { id: "forest-clear", label: "晴れた森", detail: "ハープ＋葉音 · 雲6% · 緑の地表", features: { ...base, earthProfile: "vegetated", groundBrightness: .3, groundSaturation: .6, groundVariance: .5, groundEdges: .5, groundBlue: .1 } },
  { id: "forest-cloudy", label: "雲の多い森", detail: "同じハープ＋葉音 · 雲85% · 地表音は保持", features: { ...base, earthProfile: "vegetated", groundBrightness: .3, groundSaturation: .6, groundVariance: .5, groundEdges: .5, groundBlue: .1, cloud: .85, cloudTexture: .7, cloudEdges: .8, tonality: "minor" } },
  { id: "dry-clear", label: "乾燥した陸地", detail: "乾いた風の土台 · 雲6% · 明るい地表", features: { ...base, earthProfile: "arid", groundBrightness: .7, groundSaturation: .3, groundVariance: .35, groundEdges: .35, groundBlue: .05 } },
  { id: "dry-cloudy", label: "雲の多い乾燥地", detail: "同じ乾燥地の土台 · 雲85% · 短調", features: { ...base, earthProfile: "arid", groundBrightness: .7, groundSaturation: .3, groundVariance: .35, groundEdges: .35, groundBlue: .05, cloud: .85, cloudTexture: .7, cloudEdges: .8, tonality: "minor" } },
  { id: "mixed-clear", label: "その他の陸地・晴れ", detail: "混合・未分類の陸地を模した合成条件 · 石の打音 · 雲6% · 山岳の判定ではありません", features: { ...base, earthProfile: "mixed", groundBrightness: .45, groundSaturation: .25, groundVariance: .45, groundEdges: .55, groundBlue: .15 } },
  { id: "mixed-cloudy", label: "その他の陸地・曇り", detail: "同じ混合地表の土台 · 雲85% · 短調 · 山岳の判定ではありません", features: { ...base, earthProfile: "mixed", groundBrightness: .45, groundSaturation: .25, groundVariance: .45, groundEdges: .55, groundBlue: .15, cloud: .85, cloudTexture: .7, cloudEdges: .8, tonality: "minor" } },
] satisfies { id: string; label: string; detail: string; features: AudioFeatures }[];
export type AuditionId = typeof AUDITION_PRESETS[number]["id"];
export function auditionFeatures(id: string): AudioFeatures | null {
  const preset = AUDITION_PRESETS.find(p => p.id === id);
  return preset ? { ...preset.features, scenarioId: preset.id, memory: [] } : null;
}
