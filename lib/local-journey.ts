import { AUDITION_PRESETS, type AuditionId } from "./audition-presets";
import type { AudioFeatures } from "./audio-engine";

export const LOCAL_SCENE_MIN_SECONDS = 45;
export const LOCAL_SCENE_MAX_SECONDS = 90;

const WINDS: Record<AuditionId, number> = {
  "sea-clear": 3, "sea-cloudy": 12, "forest-clear": 4, "forest-cloudy": 7,
  "dry-clear": 9, "dry-cloudy": 14, "mixed-clear": 6, "mixed-cloudy": 10,
};

export type LocalScene = {
  id: AuditionId; label: string; durationSeconds: number; number: number;
  features: AudioFeatures;
};

export function localFeatures(id: AuditionId): AudioFeatures {
  const preset = AUDITION_PRESETS.find(preset => preset.id === id)!;
  const profile = preset.features.earthProfile;
  return { ...preset.features, source: "local", scenarioId: id, wind: WINDS[id],
    motifStyle: "themed", motifOnly: false, landFraction: profile === "ocean" ? 0 : 1,
    landProfile: profile === "ocean" ? "mixed" : profile,
    terrainRelief: 0, terrainElevation: 100, terrainRange: 30, memory: [],
  };
}

/** One bag per eight landscapes, with no repeat at the boundary of two bags. */
export class LocalJourney {
  private bag: AuditionId[] = [];
  private previous: AuditionId | null = null;
  private number = 0;

  constructor(private random: () => number = Math.random) {}

  private draw() {
    const value = this.random();
    return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : .5;
  }

  next(): LocalScene {
    if (!this.bag.length) {
      this.bag = AUDITION_PRESETS.map(preset => preset.id);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.draw() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (this.bag.at(-1) === this.previous) {
        [this.bag[0], this.bag[this.bag.length - 1]] = [this.bag[this.bag.length - 1], this.bag[0]];
      }
    }
    const id = this.bag.pop()!;
    this.previous = id;
    const preset = AUDITION_PRESETS.find(preset => preset.id === id)!;
    return { id, label: preset.label, number: ++this.number,
      durationSeconds: LOCAL_SCENE_MIN_SECONDS + Math.floor(this.draw() * (LOCAL_SCENE_MAX_SECONDS - LOCAL_SCENE_MIN_SECONDS + 1)),
      features: localFeatures(id),
    };
  }
}

/** Pausing the transport freezes this clock, rather than skipping through scenes. */
export function sceneRemaining(scene: LocalScene, playedSeconds: number, sceneStartedAt: number) {
  return Math.max(0, scene.durationSeconds - Math.max(0, playedSeconds - sceneStartedAt));
}
