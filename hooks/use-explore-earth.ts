"use client";

import { earthRequest } from "@/lib/app-path";
import { useEffect, useState, type RefObject } from "react";
import { analyzeReadWindow } from "@/lib/surface-analysis";
import { isLandAt, surfaceMixAt } from "@/lib/land-mask";
import { exploreFeatures, imageWindow, type ExploreWeather } from "@/lib/explore-sound";
import type { GeoPoint } from "@/lib/globe-geometry";
import type { AudioFeatures } from "@/lib/audio-engine";
import type { TerrainData } from "@/lib/terrain-data";

export type ExploreReading = { point: GeoPoint; key: string; features: AudioFeatures; weatherTime: string | null; receivedAt: string; weatherMissing: boolean; terrainMissing: boolean; weatherPending: boolean };

/** Explorer reads stay separate from the satellite: late or failed requests never replace another location. */
export function useExploreEarth(point: GeoPoint | null, image: RefObject<HTMLImageElement | null>, imageReady: boolean) {
  const [reading, setReading] = useState<ExploreReading | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const latitude = point?.latitude ?? null, longitude = point?.longitude ?? null;
  const key = point ? `${latitude}:${longitude}` : "";
  useEffect(() => {
    const source = image.current;
    if (latitude === null || longitude === null || !imageReady || !source?.naturalWidth) return;
    const selected = { latitude, longitude };
    const controller = new AbortController();
    let active = true, loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        await Promise.resolve();
        if (!active) return;
        const canvas = document.createElement("canvas");
        canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("画像を読み取れませんでした");
        context.drawImage(source, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const visual = analyzeReadWindow(imageWindow(pixels, canvas.width, canvas.height, selected), 40).features;
        const geography = surfaceMixAt(latitude, longitude);
        if (!geography) throw new Error("Invalid geographic position");
        setReading(current => current?.key === key ? current : {
          point: selected, key, features: exploreFeatures(selected, visual, isLandAt(latitude, longitude) ?? true, geography.landFraction, null, null),
          weatherTime: null, receivedAt: new Date().toISOString(), weatherMissing: true,
          terrainMissing: geography.landFraction > .08, weatherPending: true,
        });
        const query = new URLSearchParams({ lat: String(Math.round(latitude)), lon: String(Math.round(longitude)) });
        const fetchJson = async <T,>(path: string): Promise<T> => {
          const response = await earthRequest(`${path}?${query}`, { signal: controller.signal });
          if (!response.ok) throw new Error(`${path}: ${response.status}`);
          return await response.json() as T;
        };
        const [weatherResult, terrainResult] = await Promise.allSettled([
          fetchJson<ExploreWeather>("/api/environment"),
          geography.landFraction > .08 ? fetchJson<TerrainData>("/api/terrain") : Promise.resolve(null),
        ]);
        if (!active) return;
        const weather = weatherResult.status === "fulfilled" ? weatherResult.value : null;
        const terrain = terrainResult.status === "fulfilled" ? terrainResult.value : null;
        setReading(current => ({ point: selected, key, features: exploreFeatures(selected, visual, isLandAt(latitude, longitude) ?? true, geography.landFraction, weather, terrain, current?.key === key ? current.features.tonality : "major"), weatherTime: weather?.weatherModelTime ?? null,
          receivedAt: new Date().toISOString(), weatherMissing: weather?.windSpeed == null, terrainMissing: geography.landFraction > .08 && terrain === null, weatherPending: false }));
        setFailure(null);
      } catch {
        if (active) setFailure({ key, message: "選択地点を読み取れませんでした。直前の音を続けます。" });
      } finally { loading = false; }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [latitude, longitude, key, image, imageReady]);
  return { reading: point && reading?.key === key ? reading : null, pending: !!point && reading?.key !== key && failure?.key !== key, error: failure?.key === key ? failure.message : null };
}
