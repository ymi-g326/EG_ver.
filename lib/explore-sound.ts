import type { AudioFeatures, Tonality } from "./audio-engine";
import type { GeoPoint } from "./globe-geometry";
import { chooseGround, type VisualFeatures } from "./surface-analysis";
import { deriveCloudTonality } from "./cloud-harmony";
import type { TerrainData } from "./terrain-data";

export type ExploreWeather = {
  temperature: number | null; cloudCover: number | null; windSpeed: number | null;
  waveHeight: number | null; isDay: number | null; weatherModelTime?: string | null;
};

export function normalizeView(point: GeoPoint): GeoPoint | null {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return null;
  return { latitude: Math.max(-90, Math.min(90, point.latitude)), longitude: ((point.longitude + 180) % 360 + 360) % 360 - 180 };
}

/** Read the same six-degree regional window anywhere on the global observation, including the date line. */
export function imageWindow(pixels: Uint8ClampedArray, width: number, height: number, point: GeoPoint, size = 40) {
  const center = normalizeView(point);
  if (!center || pixels.length !== width * height * 4 || width < 1 || height < 1 || size < 2) throw new Error("Invalid Earth image window");
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const lon = ((center.longitude + (x / (size - 1) - .5) * 6 + 180) % 360 + 360) % 360;
    const lat = Math.max(-90, Math.min(90, center.latitude - (y / (size - 1) - .5) * 6));
    const sx = Math.min(width - 1, Math.floor(lon / 360 * width));
    const sy = Math.min(height - 1, Math.floor((90 - lat) / 180 * height));
    const at = (sy * width + sx) * 4;
    out.set(pixels.subarray(at, at + 4), (y * size + x) * 4);
  }
  return out;
}

export function exploreFeatures(point: GeoPoint, visual: VisualFeatures, isLand: boolean, landFraction: number, weather: ExploreWeather | null, terrain: TerrainData | null, previous: Tonality = "major"): AudioFeatures {
  const ground = chooseGround(isLand, visual);
  const land = chooseGround(true, visual);
  const cloud = Math.min(1, Math.max(0, (visual.cloud + (weather?.cloudCover == null ? visual.cloud : weather.cloudCover / 100)) / 2));
  return {
    ...visual, groundBrightness: ground.ground.brightness, groundSaturation: ground.ground.saturation,
    groundVariance: ground.ground.variance, groundEdges: ground.ground.edgeDensity, groundBlue: ground.ground.blue,
    latitude: point.latitude, source: "explore", cloud, earthProfile: ground.profile,
    landFraction, landProfile: land.profile, wind: weather?.windSpeed ?? null,
    temperature: weather?.temperature ?? null, wave: weather?.waveHeight ?? null,
    isDay: weather?.isDay == null ? null : weather.isDay === 1,
    tonality: deriveCloudTonality(cloud, previous),
    terrainRelief: terrain?.relief ?? null, terrainElevation: terrain?.elevation ?? null, terrainRange: terrain?.range ?? null,
    memory: [],
  };
}
