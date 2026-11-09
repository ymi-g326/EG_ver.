export type GroundProfile = "ocean" | "vegetated" | "arid" | "mixed";
export type SurfaceLabel = "OPEN OCEAN" | "VEGETATED LAND" | "ARID LAND" | "MIXED TERRAIN";
export const GROUND_LABELS: Record<GroundProfile, SurfaceLabel> = {
  ocean: "OPEN OCEAN", vegetated: "VEGETATED LAND", arid: "ARID LAND", mixed: "MIXED TERRAIN",
};
export type GroundReading = { brightness: number; saturation: number; variance: number; edgeDensity: number; blue: number; green: number; warm: number };
export type VisualFeatures = {
  brightness: number; saturation: number; variance: number; edgeDensity: number; blue: number; delta: number;
  cloud: number; cloudTexture: number; cloudEdges: number; clearFraction: number; ground: GroundReading;
};
const clamp = (v: number) => Math.min(1, Math.max(0, v));
export const UNKNOWN_GROUND: GroundReading = { brightness: .45, saturation: .25, variance: .25, edgeDensity: .2, blue: .15, green: 0, warm: 0 };

/** Bright low-saturation pixels are only a cloud proxy, also affected by snow/sand. */
export function analyzeReadWindow(pixels: ArrayLike<number>, size: number, previous: number[] | null = null) {
  if (pixels.length !== size * size * 4 || size < 2) throw new Error("Invalid image window");
  const lights: number[] = [], sats: number[] = [], blues: number[] = [], mask: number[] = [];
  const clear: { light: number; sat: number; blue: number; green: number; warm: number }[] = [];
  let cloudSum = 0, cloudLight = 0, cloudSquared = 0, cloudBorders = 0, edges = 0, groundEdges = 0, groundPairs = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), light = (max + min) / 2;
    const rawSat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
    const sat = Number.isFinite(rawSat) ? rawSat : 0;
    const blue = clamp((b - Math.max(r, g) + .2) / .42);
    const isCloud = light > .62 && sat < .25;
    lights.push(light); sats.push(sat); blues.push(blue); mask.push(isCloud ? 1 : 0);
    if (isCloud) { cloudSum++; cloudLight += light; cloudSquared += light * light; }
    else clear.push({ light, sat, blue, green: g > r * 1.08 && g > b * 1.08 ? 1 : 0, warm: r > b * 1.2 && r >= g ? 1 : 0 });
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = y * size + x;
    for (const other of [x > 0 ? at - 1 : -1, y > 0 ? at - size : -1]) {
      if (other < 0) continue;
      edges += Math.abs(lights[at] - lights[other]);
      cloudBorders += Math.abs(mask[at] - mask[other]);
      if (!mask[at] && !mask[other]) { groundEdges += Math.abs(lights[at] - lights[other]); groundPairs++; }
    }
  }
  const mean = (items: number[]) => items.length ? items.reduce((a, b) => a + b, 0) / items.length : 0;
  const brightness = mean(lights);
  const groundBrightness = mean(clear.map(v => v.light));
  const compact = lights.map(v => Math.round(v * 255));
  const delta = previous?.length === compact.length ? mean(compact.map((v, i) => Math.abs(v - previous[i]) / 255)) : 0;
  const cloudMean = cloudSum ? cloudLight / cloudSum : 0;
  const ground = clear.length ? {
    brightness: groundBrightness, saturation: mean(clear.map(v => v.sat)), blue: mean(clear.map(v => v.blue)),
    variance: clamp(Math.sqrt(mean(clear.map(v => (v.light - groundBrightness) ** 2))) * 3.2),
    edgeDensity: clamp(groundPairs ? groundEdges / groundPairs * 4.6 : 0),
    green: mean(clear.map(v => v.green)), warm: mean(clear.map(v => v.warm)),
  } : { ...UNKNOWN_GROUND };
  const features: VisualFeatures = {
    brightness, saturation: mean(sats), blue: mean(blues), delta: clamp(delta * 4),
    variance: clamp(Math.sqrt(mean(lights.map(v => (v - brightness) ** 2))) * 3.2),
    edgeDensity: clamp(edges / ((size - 1) ** 2) * 2.3),
    cloud: cloudSum / lights.length, clearFraction: clear.length / lights.length,
    cloudTexture: clamp(Math.sqrt(Math.max(0, cloudSum ? cloudSquared / cloudSum - cloudMean ** 2 : 0)) * 8),
    cloudEdges: clamp(cloudBorders / (size * (size - 1) * 2) * 4), ground,
  };
  return { features, compact };
}

export function chooseGround(isLand: boolean, image: VisualFeatures, previous?: { profile: GroundProfile; ground: GroundReading }) {
  if (!isLand) return { profile: "ocean" as GroundProfile, ground: image.clearFraction >= .2 ? image.ground : previous?.profile === "ocean" ? previous.ground : { ...UNKNOWN_GROUND, blue: .9, brightness: .32, saturation: .38 }, source: image.clearFraction >= .2 ? "地図の海陸判定＋雲候補を除いた色" : previous?.profile === "ocean" ? "地図の海陸判定 · 近傍の直前値を保持" : "地図の海陸判定 · 基準の海の音" };
  if (image.clearFraction < .25) return previous && previous.profile !== "ocean"
    ? { ...previous, source: "雲で地表不明 · 近傍の直前値を保持" }
    : { profile: "mixed" as GroundProfile, ground: { ...UNKNOWN_GROUND }, source: "雲で地表不明 · 中立の地表音" };
  const ground = image.ground;
  const profile: GroundProfile = ground.green > .22 && ground.saturation > .18 ? "vegetated"
    : ground.warm > .3 || (ground.saturation < .25 && ground.brightness > .5) ? "arid" : "mixed";
  return { profile, ground, source: "雲候補を除いた地表色から推定" };
}
