"use client";

import { appPath, apiPath, earthRequest } from "@/lib/app-path";
import { imageRetryDelay, ImageFailureCounter } from "@/lib/image-recovery";

import PlayerViews from "@/components/player-views";
import InspectPlayer from "@/components/inspect-player";
import GroovePlayer from "@/components/groove-player";
import { useExploreEarth } from "@/hooks/use-explore-earth";
import { normalizeView } from "@/lib/explore-sound";
import type { GeoPoint } from "@/lib/globe-geometry";

import {
  Activity,
  AudioLines,
  Cloud,
  Info,
  RotateCcw,
  X,
  Pause,
  Play,
  Satellite,
  Volume2,
  Waves,
  Wind,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import * as satellite from "satellite.js";
import { recordWind, type WindReading } from "@/lib/wind-analysis";
import DevAudition from "@/components/dev-audition";
import { AUDITION_PRESETS, auditionFeatures } from "@/lib/audition-presets";
import { analyzeReadWindow, chooseGround, GROUND_LABELS, UNKNOWN_GROUND, type VisualFeatures, type GroundProfile, type GroundReading } from "@/lib/surface-analysis";
import { applyAuditionModifiers, DEFAULT_AUDITION_MODIFIERS, type AuditionModifiers } from "@/lib/audition-modifiers";
import { deriveTerrainSound } from "@/lib/terrain-sound";
import type { TerrainData } from "@/lib/terrain-data";
import { isLandAt, surfaceMixAt } from "@/lib/land-mask";
import TempoControls from "@/components/tempo-controls";
import { VoiceMeter } from "@/lib/voice-meter";
import DevAudioInspector from "@/components/dev-audio-inspector";
import { DEFAULT_TEMPO, type TempoSettings, type TempoRuntime } from "@/lib/audio-tempo";
import { retainOrbit, validateOrbit } from "@/lib/orbit";
import { MISSION, SURFACE_LABELS } from "@/lib/mission";
import { WORLD_LAND_PATH } from "@/lib/world-map";
import {
  deriveTonality,
  EARTH_SOUND_SOURCES,
  EarthAudioEngine,
  type ListeningMode,
  type AudioFeatures,
  type AudioLayer,
  type EarthSurfaceProfile,
  type Tonality,
} from "@/lib/audio-engine";

type Position = {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  timestamp: number;
};

type SoundEnergy = Record<AudioLayer, number>;

type SurfaceType = "CLOUD SYSTEM" | "OPEN OCEAN" | "ARID LAND" | "VEGETATED LAND" | "MIXED TERRAIN";

type TrailSample = Position & {
  energy: SoundEnergy;
  audioFeatures: AudioFeatures;
  imageFeatures: ImageFeatures;
  surface: SurfaceType;
};

type ImageFeatures = VisualFeatures & {
  analyzedAt?: string; surface?: SurfaceType; groundSource?: string; landProfile?: GroundProfile;
};

type Environment = {
  temperature: number | null;
  cloudCover: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  isDay: number | null;
  waveHeight: number | null;
  oceanCurrent: number | null;
  sampledAt?: string;
  weatherModelTime?: string | null; weatherIntervalSeconds?: number | null; windUnit?: string | null;
};

type OrbitResponse = {
  line1: string;
  line2: string;
  epoch: string;
  source: string;
  mode: "live" | "reference";
  fetchedAt: string;
};

type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema: object;
      annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
      execute: (input: unknown) => unknown | Promise<unknown>;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

const EMPTY_FEATURES: ImageFeatures = {
  brightness: 0.46,
  saturation: 0.38,
  variance: 0.25,
  edgeDensity: 0.28,
  cloud: 0.32,
  blue: 0.52,
  delta: 0.08, cloudTexture: 0, cloudEdges: 0, clearFraction: 1, ground: { ...UNKNOWN_GROUND },
};

const EMPTY_ENVIRONMENT: Environment = {
  temperature: null,
  cloudCover: null,
  windSpeed: null,
  windDirection: null,
  isDay: null,
  waveHeight: null,
  oceanCurrent: null,
};

const AUDIO_LAYERS: { layer: AudioLayer; label: string }[] = [
  { layer: "motif", label: "MOTIF" },
  { layer: "pad", label: "PAD" },
  { layer: "bass", label: "BASS" },
  { layer: "pulse", label: "PULSE" },
];

const EMPTY_SOUND_ENERGY: SoundEnergy = { bass: 0, motif: 0, pad: 0, pulse: 0 };
const SOUND_ENERGY_CEILING: SoundEnergy = { bass: 4.2, motif: 1, pad: 0.65, pulse: 0.55 };
const SCORE_OFFSETS: Record<AudioLayer, number> = { motif: -4.5, pad: -1.5, bass: 1.5, pulse: 4.5 };
const SCORE_COLOURS: Record<AudioLayer, string> = {
  motif: "106, 245, 219",
  pad: "185, 167, 255",
  bass: "186, 255, 61",
  pulse: "255, 118, 92",
};
const VOICE_DRIVERS: Record<AudioLayer, string> = {
  motif: "SURFACE DETAIL / CHANGE",
  pad: "CLOUD / TONAL CHORD",
  bass: "OCEAN / LOW PITCH",
  pulse: "EDGE / RHYTHM",
};
const VOICE_TIMBRES: Record<SurfaceType, Record<AudioLayer, string>> = {
  "OPEN OCEAN": { motif: "WATER DROPS", pad: "OCEAN FIELD", bass: "TIDAL SUB", pulse: "SURF CUT" },
  "CLOUD SYSTEM": { motif: "RAIN GRAIN", pad: "STORM FIELD", bass: "THUNDER SUB", pulse: "RAIN CUT" },
  "ARID LAND": { motif: "WIND WHISTLE", pad: "DRY WIND FIELD", bass: "DUNE SUB", pulse: "SAND CUT" },
  "VEGETATED LAND": { motif: "FOREST HARP", pad: "FOREST FIELD", bass: "WOOD SUB", pulse: "LEAF CUT" },
  "MIXED TERRAIN": { motif: "STONE PING", pad: "ROCK RESONANCE", bass: "STONE SUB", pulse: "ROCK HIT" },
};
const SURFACE_PROFILES: Record<SurfaceType, EarthSurfaceProfile> = {
  "OPEN OCEAN": "ocean",
  "CLOUD SYSTEM": "cloud",
  "ARID LAND": "arid",
  "VEGETATED LAND": "vegetated",
  "MIXED TERRAIN": "mixed",
};
const SURFACE_COLOURS: Record<SurfaceType, string> = {
  "CLOUD SYSTEM": "230, 240, 245",
  "OPEN OCEAN": "71, 155, 255",
  "ARID LAND": "232, 177, 73",
  "VEGETATED LAND": "83, 214, 130",
  "MIXED TERRAIN": "190, 151, 255",
};
const HISTORY_DURATION_MS = 12 * 60_000;
const HISTORY_SAMPLE_MS = 10_000;
const PHRASE_SAMPLE_COUNT = 16;
const SEQUENCE_RESET_HOLD_MS = 900;
const IMAGE_ANALYSIS_ENABLED = true;

const MAP_LABELS = [
  { label: "NORTH AMERICA", x: 19, y: 31 },
  { label: "SOUTH AMERICA", x: 31, y: 67 },
  { label: "EUROPE", x: 51, y: 29 },
  { label: "AFRICA", x: 52, y: 55 },
  { label: "ASIA", x: 69, y: 34 },
  { label: "OCEANIA", x: 82, y: 70 },
];



const IMAGE_DATE = (() => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 2);
  return date.toISOString().slice(0, 10);
})();
const EARTH_IMAGE_URL = apiPath("/api/earth-image");

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

function mapPoint(position: Position) {
  return {
    x: ((position.longitude + 180) / 360) * 100,
    y: ((90 - position.latitude) / 180) * 100,
  };
}

function pathFromPositions(positions: Position[]) {
  let last: Position | null = null;
  return positions
    .map((position, index) => {
      const point = mapPoint(position);
      const breakLine = last && Math.abs(last.longitude - position.longitude) > 180;
      last = position;
      return `${index === 0 || breakLine ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    })
    .join(" ");
}

function readPosition(satrec: satellite.SatRec, date: Date): Position | null {
  const result = satellite.propagate(satrec, date);
  if (!result.position || typeof result.position === "boolean") return null;
  const gmst = satellite.gstime(date);
  const geo = satellite.eciToGeodetic(result.position, gmst);
  const velocity = result.velocity && typeof result.velocity !== "boolean"
    ? Math.hypot(result.velocity.x, result.velocity.y, result.velocity.z)
    : 7.66;

  return {
    latitude: satellite.degreesLat(geo.latitude),
    longitude: satellite.degreesLong(geo.longitude),
    altitude: geo.height,
    velocity,
    timestamp: date.getTime(),
  };
}

function makeTrack(satrec: satellite.SatRec, origin: Date) {
  const past: Position[] = [];
  const future: Position[] = [];
  for (let minute = -46; minute <= 94; minute += 2) {
    const point = readPosition(satrec, new Date(origin.getTime() + minute * 60_000));
    if (!point) continue;
    if (minute <= 0) past.push(point);
    else future.push(point);
  }
  return { past, future };
}

function classifySurface(features: ImageFeatures): SurfaceType {
  return features.surface ?? "MIXED TERRAIN";
}

function MetricBar({ label, value }: { label: string; value: number }) {
  const safe = clamp(value);
  return (
    <div className="metric-row">
      <div className="metric-label">
        <span>{label}</span>
        <span>{Math.round(safe * 100).toString().padStart(2, "0")}</span>
      </div>
      <div className="metric-track" aria-label={`${label} ${Math.round(safe * 100)} percent`}>
        <span style={{ width: `${Math.max(3, safe * 100)}%` }} />
      </div>
    </div>
  );
}

function formatSampleTime(value?: string) {
  if (!value) return "AWAITING SIGNAL";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "AWAITING SIGNAL" : `${date.toISOString().slice(11, 19)} UTC`;
}

export default function EarthRecord({ player = false }: { player?: boolean }) {
  const [explorePoint, setExplorePoint] = useState<GeoPoint | null>(null);
  const explorePointRef = useRef<GeoPoint | null>(null);
  const exploreFeaturesRef = useRef<AudioFeatures | null>(null);
  const appliedExplorePointRef = useRef<GeoPoint | null>(null);
  const [detailView, setDetailView] = useState(false);
  const [listeningMode, setListeningMode] = useState<ListeningMode>("ambient");
  const [natureLevel, setNatureLevel] = useState(45);
  const [scratchReady, setScratchReady] = useState(false);
  const [contextState, setContextState] = useState("未作成");
  const [satrec, setSatrec] = useState<satellite.SatRec | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [track, setTrack] = useState<{ past: Position[]; future: Position[] }>({ past: [], future: [] });
  const [history, setHistory] = useState<TrailSample[]>([]);
  const [sequenceCycle, setSequenceCycle] = useState<TrailSample[]>([]);
  const [features, setFeatures] = useState<ImageFeatures>(EMPTY_FEATURES);
  const [environmentReading, setEnvironment] = useState<Environment & { cell: string }>({ ...EMPTY_ENVIRONMENT, cell: "" });
  const environmentCell = position ? `${Math.round(position.latitude)}:${Math.round(position.longitude)}` : "";
  const environment = environmentReading.cell === environmentCell ? environmentReading : EMPTY_ENVIRONMENT;
  const [orbitStatus, setOrbitStatus] = useState<"connecting" | "live" | "reference" | "degraded">("connecting");
  const [orbitData, setOrbitData] = useState<OrbitResponse | null>(null);
  const [orbitAttempt, setOrbitAttempt] = useState(0);
  const lastValidOrbit = useRef<OrbitResponse | null>(null);
  const [mapMode, setMapMode] = useState<"contour" | "surface">("contour");
  const guideRef = useRef<HTMLDialogElement>(null);
  const [imageReady, setImageReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageFailures, setImageFailures] = useState(0);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [clouds, setClouds] = useState(true);
  const [volume, setVolume] = useState(72);
  const [auditionModifiers,setAuditionModifiers]=useState<AuditionModifiers>({...DEFAULT_AUDITION_MODIFIERS});
  const [tempoRuntime,setTempoRuntime]=useState<TempoRuntime|null>(null);
  const [terrainState,setTerrainState]=useState<{cell:string;data:TerrainData|null;status:string}>({cell:"",data:null,status:"位置待ち"});
  const [auditionId, setAuditionId] = useState<string | null>(null);
  const auditionRef = useRef<AudioFeatures | null>(null);
  const savedTempoRef = useRef<TempoSettings | null>(null);
  const savedTempoRuntimeRef = useRef<TempoRuntime | null>(null);
  const groundMemoryRef = useRef(new Map<string, { profile: GroundProfile; ground: GroundReading }>());
  const [tempoSettings, setTempoSettings] = useState<TempoSettings>({ ...DEFAULT_TEMPO });
  const [windReadings, setWindReadings] = useState<WindReading[]>([]);
  const [weatherAcquisition, setWeatherAcquisition] = useState({
    status: "位置待ち", latitude: null as number | null, longitude: null as number | null, receivedAt: null as string | null,
  });
  const [clock, setClock] = useState("");
  const [coordinateCardSide, setCoordinateCardSide] = useState<"left" | "right">("left");
  const imageRef = useRef<HTMLImageElement>(null);
  const imageFailureCounter = useRef(new ImageFailureCounter());
  const reportImageFailure = useCallback(() => {
    const count = imageFailureCounter.current.report(imageAttempt);
    if (count === null) return;
    setImageFailed(true); setImageFailures(count);
  }, [imageAttempt]);
  useEffect(() => {
    if (!imageFailed) return;
    const delay = imageRetryDelay(imageFailures);
    if (delay === null) return;
    const timer = window.setTimeout(() => {
      setImageFailed(false);
      setImageAttempt(Date.now());
    }, delay);
    return () => window.clearTimeout(timer);
  }, [imageFailed, imageFailures]);
  const exploration = useExploreEarth(explorePoint, imageRef, imageReady);
  const selectedReading = exploration.reading;
  useEffect(() => {
    if (!explorePoint) { exploreFeaturesRef.current = null; appliedExplorePointRef.current = null; }
    else if (selectedReading) { exploreFeaturesRef.current = selectedReading.features; appliedExplorePointRef.current = selectedReading.point; }
  }, [selectedReading, explorePoint]);
  const contourRef = useRef<HTMLCanvasElement>(null);
  const scoreTrailRef = useRef<HTMLCanvasElement>(null);
  const lastPixels = useRef<number[] | null>(null);
  const [voiceLevels, setVoiceLevels] = useState<SoundEnergy>({ ...EMPTY_SOUND_ENERGY });
  const voiceMeterRef = useRef(new VoiceMeter());
  const soundEnergyRef = useRef<SoundEnergy>({ ...EMPTY_SOUND_ENERGY });
  const liveFeaturesRef = useRef<AudioFeatures>({
    ...EMPTY_FEATURES,
    latitude: 0,
    temperature: null,
    wind: null,
    wave: null,
    isDay: null,
    tonality: "major",
    earthProfile: "ocean",
  });
  const tonalityRef = useRef<Tonality>("major");
  const historyRef = useRef<TrailSample[]>([]);
  const sequenceResetTimerRef = useRef<number | null>(null);
  const audioRef = useRef<EarthAudioEngine | null>(null);
  const stateRef = useRef({
    position: null as Position | null,
    features: EMPTY_FEATURES,
    environment: EMPTY_ENVIRONMENT,
    playing: false,
    volume: 72,
  });

  useEffect(() => {
    const updateClock = () => setClock(new Date().toISOString().slice(11, 19));
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    audioRef.current = new EarthAudioEngine(
      () => {
        if (auditionRef.current) return { ...auditionRef.current, memory: [auditionRef.current] };
        if (exploreFeaturesRef.current) return exploreFeaturesRef.current;
        const samples = historyRef.current;
        const memory = samples
          .slice(-PHRASE_SAMPLE_COUNT)
          .map((sample) => sample.audioFeatures);
        return { ...liveFeaturesRef.current, memory };
      },
      ({ layer, level }) => {
        if (!auditionRef.current && !explorePointRef.current) soundEnergyRef.current[layer] += level;
        voiceMeterRef.current.push(layer, level, player && !auditionRef.current ? "listening" : "original");
      },
      true,
    );
    audioRef.current.setListeningMode(player ? "ambient" : "original");
    return () => audioRef.current?.destroy();
  }, [player]);

  useEffect(()=>{
    const timer=window.setInterval(()=>{
      const next=audioRef.current?.getTempoStatus()??null;
      const diagnostic = audioRef.current?.getDiagnostics();
      setContextState(diagnostic?.contextState ?? "未作成");
      setScratchReady(diagnostic?.scratch.ready ?? false);
      setTempoRuntime(previous=>previous?.bpm===next?.bpm&&previous?.targetBpm===next?.targetBpm&&previous?.source===next?.source&&previous?.mode===next?.mode?previous:next);
    },200);
    return ()=>window.clearInterval(timer);
  },[]);

  useEffect(() => {
    if (!playing) return;
    let lastRead = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      setVoiceLevels(voiceMeterRef.current.read(now - lastRead));
      lastRead = now;
    }, 100);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    // NUCC uses its own namespace, separate from the original edition.
    window.localStorage.removeItem("earth-groove-nucc-v2-score-v1");
  }, []);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => () => {
    if (sequenceResetTimerRef.current !== null) {
      window.clearTimeout(sequenceResetTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool(
        {
          name: "read_earth_state",
          title: "Read Earth state",
          description: "Read the current Ten-Koh 2 subpoint and the Earth features controlling the music.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: () => ({
            position: stateRef.current.position
              ? {
                  latitude: stateRef.current.position.latitude,
                  longitude: stateRef.current.position.longitude,
                  altitudeKm: stateRef.current.position.altitude,
                }
              : null,
            surface: classifySurface(stateRef.current.features),
            audioSource: auditionRef.current ? "synthetic-audition" : explorePointRef.current ? "explore-environment" : "live-environment",
            listeningPoint: explorePointRef.current ? appliedExplorePointRef.current : stateRef.current.position,
            requestedListeningPoint: explorePointRef.current,
            audition: auditionRef.current?.scenarioId ?? null,
            scratch: audioRef.current?.getDiagnostics()?.scratch ?? null,
            tempo: audioRef.current?.getTempoStatus() ?? null,
            listeningMode: audioRef.current?.getDiagnostics()?.listeningMode ?? null,
            features: stateRef.current.features,
            playing: stateRef.current.playing,
            volume: stateRef.current.volume,
          }),
        },
        { signal: lifecycle.signal },
      );
      await context.registerTool(
        {
          name: "set_playback_volume",
          title: "Set playback volume",
          description: "Set the EARTH GROOVE NUCC playback volume from 0 to 100 without starting audio.",
          inputSchema: {
            type: "object",
            properties: { volume: { type: "number", minimum: 0, maximum: 100 } },
            required: ["volume"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: (input) => {
            const next = Number((input as { volume?: unknown }).volume);
            if (!Number.isFinite(next) || next < 0 || next > 100) throw new Error("Volume must be between 0 and 100.");
            setVolume(next);
            audioRef.current?.setVolume(next / 100);
            return { volume: next };
          },
        },
        { signal: lifecycle.signal },
      );
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await earthRequest("/api/orbit", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (!response.ok) throw new Error("Orbit fetch failed");
        const data = await response.json() as OrbitResponse;
        const verified = validateOrbit(data.line1, data.line2);
        data.epoch = verified.epoch;
        const record = satellite.twoline2satrec(data.line1, data.line2);
        if (record.satnum !== String(MISSION.noradId) || !readPosition(record, new Date())) {
          throw new Error("Invalid Ten-Koh 2 orbit");
        }
        if (!active) return;
        lastValidOrbit.current = data;
        setSatrec(record);
        setTrack(makeTrack(record, new Date()));
        setOrbitData(data);
        setOrbitStatus(data.mode === "reference" ? "reference" : "live");
      } catch {
        if (!active) return;
        const retained = retainOrbit(lastValidOrbit.current);
        if (retained) {
          lastValidOrbit.current = retained;
          setOrbitData(retained);
          setOrbitStatus("reference");
          return;
        }
        lastValidOrbit.current = null;
        setSatrec(null);
        setPosition(null);
        setTrack({ past: [], future: [] });
        setOrbitData(null);
        setOrbitStatus("degraded");
        if (!auditionRef.current && !explorePointRef.current) { audioRef.current?.stop(); setPlaying(false); }
      }
    };
    void load();
    const timer = window.setInterval(load, 30 * 60_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [orbitAttempt]);

  useEffect(() => {
    if (!satrec) return;
    const timer = window.setInterval(() => setTrack(makeTrack(satrec, new Date())), 60_000);
    return () => window.clearInterval(timer);
  }, [satrec]);

  useEffect(() => {
    if (!satrec) return;
    const update = () => {
      const next = readPosition(satrec, new Date());
      if (!next) return;
      setPosition(next);
      const point = mapPoint(next);
      // Preserve the dead zone so the coordinate card stays clear of the moving needle.
      if (point.x < 44) setCoordinateCardSide("right");
      if (point.x > 56) setCoordinateCardSide("left");
      if (explorePointRef.current) return;
      setHistory((current) => {
        const latest = current.at(-1);
        if (latest && next.timestamp - latest.timestamp < HISTORY_SAMPLE_MS) return current;
        const energy = stateRef.current.playing
          ? { ...soundEnergyRef.current }
          : { ...EMPTY_SOUND_ENERGY };
        soundEnergyRef.current = { ...EMPTY_SOUND_ENERGY };
        const imageFeatures = { ...stateRef.current.features };
        const sample: TrailSample = {
          ...next,
          energy,
          audioFeatures: { ...liveFeaturesRef.current },
          imageFeatures,
          surface: classifySurface(imageFeatures),
        };
        setSequenceCycle((cycle) => {
          if (cycle.at(-1)?.timestamp === sample.timestamp) return cycle;
          const nextCycle = [...cycle, sample].slice(-PHRASE_SAMPLE_COUNT);
          if (nextCycle.length === PHRASE_SAMPLE_COUNT) {
            if (sequenceResetTimerRef.current !== null) {
              window.clearTimeout(sequenceResetTimerRef.current);
            }
            sequenceResetTimerRef.current = window.setTimeout(() => {
              setSequenceCycle([]);
              sequenceResetTimerRef.current = null;
            }, SEQUENCE_RESET_HOLD_MS);
          }
          return nextCycle;
        });
        const cutoff = next.timestamp - HISTORY_DURATION_MS;
        return [...current.filter((item) => item.timestamp >= cutoff), sample];
      });
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [satrec]);

  const roundedLat = position ? Math.round(position.latitude) : null;
  const roundedLon = position ? Math.round(position.longitude) : null;

  const geography=useMemo(()=>roundedLat===null||roundedLon===null?null:surfaceMixAt(roundedLat,roundedLon),[roundedLat,roundedLon]);
  const terrainCell=`${roundedLat}:${roundedLon===180?-180:roundedLon}`;
  const needsTerrain=(geography?.landFraction??0)>.08;
  const terrainData=needsTerrain&&terrainState.cell===terrainCell?terrainState.data:null;
  const terrainStatus=!geography?"位置待ち":!needsTerrain?"海上（起伏の適用なし）":terrainState.cell===terrainCell?terrainState.status:"地形取得中";
  useEffect(()=>{
    if(!needsTerrain||roundedLat===null||roundedLon===null) return;
    let active=true;
    const controller=new AbortController();
    const load=()=>{
      earthRequest(`/api/terrain?lat=${roundedLat}&lon=${roundedLon}`,{signal:controller.signal})
        .then(async response=>{if(!response.ok)throw Error('Terrain unavailable');return await response.json() as TerrainData;})
        .then(data=>{if(active)setTerrainState({cell:terrainCell,data,status:'標高9点から地域の起伏を算出'});})
        .catch(()=>{if(active)setTerrainState({cell:terrainCell,data:null,status:'地形未取得（起伏効果は中立）'});});
    };
    load();const timer=window.setInterval(load,60000);
    return ()=>{active=false;controller.abort();window.clearInterval(timer);};
  },[needsTerrain,roundedLat,roundedLon,terrainCell]);

  useEffect(() => {
    if (roundedLat === null || roundedLon === null) return;
    let active = true;
    const controller = new AbortController();
    const load = () => {
      setWeatherAcquisition(current => ({ ...current, status: "取得中（直前の取得値を継続）" }));
      earthRequest(
        `/api/environment?lat=${roundedLat}&lon=${roundedLon}`,
        { signal: controller.signal },
      )
        .then((response) => {
          if (!response.ok) throw new Error("Weather fetch failed");
          return response.json() as Promise<Partial<Environment>>;
        })
        .then((data) => {
          if (!active) return;
          const receivedAt = new Date().toISOString();
          setEnvironment({ ...EMPTY_ENVIRONMENT, ...data, cell: `${roundedLat}:${roundedLon}` });
          if (process.env.NODE_ENV === "development") setWindReadings(current => recordWind(current, {
            receivedAt, latitude: roundedLat, longitude: roundedLon, wind: data.windSpeed ?? null,
            modelTime: data.weatherModelTime ?? null, intervalSeconds: data.weatherIntervalSeconds ?? null,
          }));
          setWeatherAcquisition({ status: "取得済み（欠測は下表に表示）", latitude: roundedLat, longitude: roundedLon, receivedAt });
        })
        .catch(() => {
          if (active) setWeatherAcquisition(current => ({ ...current, status: "取得失敗（直前の取得値を継続）" }));
        });
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [roundedLat, roundedLon]);

  const analyzeImage = useCallback(() => {
    const image = imageRef.current;
    if (!image || !image.naturalWidth || !position) return;
    const canvas = document.createElement("canvas");
    const size = 40;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    const centerX = ((position.longitude + 180) / 360) * image.naturalWidth;
    const centerY = ((90 - position.latitude) / 180) * image.naturalHeight;
    const sourceSize = Math.max(16, image.naturalWidth / 60);
    const sourceX = Math.min(image.naturalWidth - sourceSize, Math.max(0, centerX - sourceSize / 2));
    const sourceY = Math.min(image.naturalHeight - sourceSize, Math.max(0, centerY - sourceSize / 2));
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);

    const pixels = context.getImageData(0, 0, size, size).data;
    const { features: analyzed, compact } = analyzeReadWindow(pixels, size, lastPixels.current);
    lastPixels.current = compact;
    const cell = `${Math.floor(position.latitude / 2)}:${Math.floor(position.longitude / 2)}`;
    const land = isLandAt(position.latitude, position.longitude) ?? true;
    const ground = chooseGround(land, analyzed, groundMemoryRef.current.get(cell));
    if (analyzed.clearFraction >= .25) {
      groundMemoryRef.current.delete(cell);
      groundMemoryRef.current.set(cell, ground);
      if (groundMemoryRef.current.size > 128) groundMemoryRef.current.delete(groundMemoryRef.current.keys().next().value!);
    }
    const next: ImageFeatures = { ...analyzed, ground: ground.ground, surface: GROUND_LABELS[ground.profile],
      groundSource: ground.source, landProfile: chooseGround(true,analyzed,groundMemoryRef.current.get(cell)).profile, analyzedAt: new Date().toISOString() };
    setFeatures(next);
  }, [position]);

  const renderContourMap = useCallback(() => {
    const image = imageRef.current;
    const canvas = contourRef.current;
    if (!image || !canvas || !image.naturalWidth) return;
    const width = 480;
    const height = 240;
    const source = document.createElement("canvas");
    source.width = width;
    source.height = height;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    const targetContext = canvas.getContext("2d");
    if (!sourceContext || !targetContext) return;
    sourceContext.drawImage(image, 0, 0, width, height);
    const input = sourceContext.getImageData(0, 0, width, height);
    const output = targetContext.createImageData(width, height);
    const lightAt = (x: number, y: number) => {
      const index = (y * width + x) * 4;
      return input.data[index] * 0.24 + input.data[index + 1] * 0.68 + input.data[index + 2] * 0.08;
    };
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const gx = lightAt(x + 1, y) - lightAt(x - 1, y);
        const gy = lightAt(x, y + 1) - lightAt(x, y - 1);
        const edge = Math.min(255, Math.hypot(gx, gy) * 2.25);
        const alpha = edge > 28 ? Math.min(220, (edge - 28) * 2.4) : 0;
        const index = (y * width + x) * 4;
        output.data[index] = 106;
        output.data[index + 1] = 245;
        output.data[index + 2] = 219;
        output.data[index + 3] = alpha;
      }
    }
    canvas.width = width;
    canvas.height = height;
    targetContext.putImageData(output, 0, 0);
  }, []);

  const renderScoreTrail = useCallback(() => {
    const canvas = scoreTrailRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(bounds.width * pixelRatio);
    canvas.height = Math.round(bounds.height * pixelRatio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);

    for (let index = 1; index < history.length; index += 1) {
      const from = history[index - 1];
      const to = history[index];
      if (Math.abs(from.longitude - to.longitude) > 180) continue;
      const start = mapPoint(from);
      const end = mapPoint(to);
      const x1 = (start.x / 100) * bounds.width;
      const y1 = (start.y / 100) * bounds.height;
      const x2 = (end.x / 100) * bounds.width;
      const y2 = (end.y / 100) * bounds.height;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.hypot(dx, dy) || 1;
      const normalX = -dy / length;
      const normalY = dx / length;
      const ageFade = 0.38 + 0.62 * (index / history.length);

      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.strokeStyle = `rgba(${SURFACE_COLOURS[to.surface]}, ${0.42 * ageFade})`;
      context.lineWidth = 8;
      context.shadowColor = `rgba(${SURFACE_COLOURS[to.surface]}, ${0.26 * ageFade})`;
      context.shadowBlur = 7;
      context.stroke();

      for (const { layer } of AUDIO_LAYERS) {
        const intensity = clamp(to.energy[layer] / SOUND_ENERGY_CEILING[layer]);
        const offset = SCORE_OFFSETS[layer];
        context.beginPath();
        context.moveTo(x1 + normalX * offset, y1 + normalY * offset);
        context.lineTo(x2 + normalX * offset, y2 + normalY * offset);
        context.strokeStyle = `rgba(${SCORE_COLOURS[layer]}, ${(0.13 + intensity * 0.87) * ageFade})`;
        context.lineWidth = 0.65 + intensity * 1.55;
        context.shadowColor = `rgba(${SCORE_COLOURS[layer]}, ${intensity * 0.65})`;
        context.shadowBlur = intensity * 5;
        context.stroke();
      }
    }
    context.shadowBlur = 0;
  }, [history]);

  // The image can finish loading before React attaches onLoad (e.g. from cache), so check once on mount.
  useEffect(() => {
    if (!IMAGE_ANALYSIS_ENABLED) return;
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth) {
      setImageReady(true);
      window.requestAnimationFrame(renderContourMap);
    } else if (image?.complete) {
      reportImageFailure();
    }
  }, [renderContourMap, reportImageFailure]);

  useEffect(() => {
    if (!imageReady || !position) return;
    analyzeImage();
    const timer = window.setInterval(analyzeImage, 10_000);
    return () => window.clearInterval(timer);
  }, [analyzeImage, imageReady, position]);

  useEffect(() => {
    renderScoreTrail();
    const canvas = scoreTrailRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(renderScoreTrail);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [renderScoreTrail]);

  useEffect(() => {
    const liveSurface = classifySurface(features);
    const next: AudioFeatures = {
      ...features,
      groundBrightness: features.ground.brightness, groundSaturation: features.ground.saturation,
      groundVariance: features.ground.variance, groundEdges: features.ground.edgeDensity, groundBlue: features.ground.blue,
      source: "live",
      landFraction:geography?.landFraction??(SURFACE_PROFILES[liveSurface]==='ocean'?0:1),
      landProfile:features.landProfile??'mixed',
      terrainRelief:terrainData?.relief??null,terrainElevation:terrainData?.elevation??null,terrainRange:terrainData?.range??null,
      cloud: clamp((features.cloud + (environment.cloudCover ?? features.cloud * 100) / 100) / 2),
      latitude: position?.latitude ?? 0,
      temperature: environment.temperature,
      wind: environment.windSpeed,
      wave: environment.waveHeight,
      isDay: environment.isDay === null ? null : environment.isDay === 1,
      tonality: tonalityRef.current,
      earthProfile: SURFACE_PROFILES[liveSurface],
    };
    next.tonality = deriveTonality(next, tonalityRef.current);
    tonalityRef.current = next.tonality;
    liveFeaturesRef.current = next;
    stateRef.current = { position, features, environment, playing, volume };
  }, [features, environment, position, playing, volume, geography, terrainData]);

  useEffect(() => {
    // The final sequence cell represents the live 10-second recording window.
    // Keep it aligned with the immediately updating surface label instead of
    // leaving the previous surface colour visible until the next sample tick.
    const liveSurface = classifySurface(features);
    const liveAudioFeatures = { ...liveFeaturesRef.current };
    setHistory((current) => {
      const latest = current.at(-1);
      if (!latest) return current;

      const surfaceChanged = latest.surface !== liveSurface;
      const featuresChanged =
        latest.imageFeatures.brightness !== features.brightness ||
        latest.imageFeatures.saturation !== features.saturation ||
        latest.imageFeatures.variance !== features.variance ||
        latest.imageFeatures.edgeDensity !== features.edgeDensity ||
        latest.imageFeatures.cloud !== features.cloud ||
        latest.imageFeatures.blue !== features.blue ||
        latest.imageFeatures.delta !== features.delta;
      const audioChanged = latest.audioFeatures.tonality !== liveAudioFeatures.tonality ||
        latest.audioFeatures.terrainRelief !== liveAudioFeatures.terrainRelief || latest.audioFeatures.landFraction !== liveAudioFeatures.landFraction || latest.audioFeatures.wind !== liveAudioFeatures.wind;
      if (!surfaceChanged && !featuresChanged && !audioChanged) return current;

      const synced = [...current];
      synced[synced.length - 1] = {
        ...latest,
        surface: liveSurface,
        imageFeatures: { ...features },
        audioFeatures: liveAudioFeatures,
      };
      return synced;
    });
    setSequenceCycle((current) => {
      const latest = current.at(-1);
      if (!latest) return current;
      return [
        ...current.slice(0, -1),
        {
          ...latest,
          surface: liveSurface,
          imageFeatures: { ...features },
          audioFeatures: liveAudioFeatures,
        },
      ];
    });
  }, [features, environment, geography, terrainData]);

  const currentPoint = position ? mapPoint(position) : { x: 50, y: 50 };


  const pastPath = useMemo(() => pathFromPositions(track.past), [track.past]);
  const futurePath = useMemo(() => pathFromPositions(track.future), [track.future]);
  const surface = classifySurface(features);
  const earthProfile = SURFACE_PROFILES[surface];
  const earthSound = EARTH_SOUND_SOURCES[earthProfile];
  const isDay = environment.isDay === null ? true : environment.isDay === 1;
  const rhythm = clamp(features.ground.edgeDensity * 0.68 + features.delta * 0.32);
  const audioCloud = clamp(
    (features.cloud + (environment.cloudCover ?? features.cloud * 100) / 100) / 2,
  );
  const analysisField = {
    width: 100 / 60,
    height: 100 / 30,
  };
  const phraseHistory = sequenceCycle;
  const phraseOffset = PHRASE_SAMPLE_COUNT - phraseHistory.length;
  const activePreset = AUDITION_PRESETS.find(p => p.id === auditionId);
  const activeAudition=activePreset?applyAuditionModifiers(activePreset.features,auditionModifiers):null;
  const soundMix=deriveTerrainSound(activeAudition??{earthProfile,landProfile:features.landProfile,landFraction:geography?.landFraction});
  const soundMixLand=EARTH_SOUND_SOURCES[soundMix.landProfile as EarthSurfaceProfile];
  const naturalSource=soundMix.landFraction<=0?EARTH_SOUND_SOURCES.ocean:soundMixLand;
  const soundSurface = activePreset ? GROUND_LABELS[activePreset.features.earthProfile as GroundProfile] : surface;
  const liveTonality = history.at(-1)?.audioFeatures.tonality ?? "major";
  const currentTonality = activePreset?.features.tonality ?? liveTonality;

  const readAudioDiagnostics = useCallback(() => audioRef.current?.getDiagnostics() ?? null, []);
  const changeTempo = (next: TempoSettings) => {
    setTempoSettings(next);
    audioRef.current?.setTempo(next);
  };

  const selectAudition = (id: string | null) => {
    if (process.env.NODE_ENV !== "development") return;
    const base = id ? auditionFeatures(id) : null;
    const preset = base ? applyAuditionModifiers(base,auditionModifiers) : null;
    if (id && !preset) return;
    if (preset && !auditionRef.current) {
      savedTempoRef.current = { ...tempoSettings };
      savedTempoRuntimeRef.current=audioRef.current?.getTempoStatus()??null;
      changeTempo({ mode: "manual", manualBpm: tempoSettings.manualBpm });
    }
    auditionRef.current = preset;
    setAuditionId(id);
    audioRef.current?.resetSequence();
    soundEnergyRef.current = { ...EMPTY_SOUND_ENERGY };
    voiceMeterRef.current.clear(); setVoiceLevels({ ...EMPTY_SOUND_ENERGY });
    if (!preset) {
      if (savedTempoRef.current) changeTempo(savedTempoRef.current);
      savedTempoRef.current = null;
      audioRef.current?.restoreTempoStatus(savedTempoRuntimeRef.current);
      savedTempoRuntimeRef.current=null;
      if (!position || !imageReady) { audioRef.current?.stop(); setPlaying(false); }
    }
  };

  const changeAuditionModifiers=(next:AuditionModifiers,reset=false)=>{
    setAuditionModifiers(next);
    const base=auditionId?auditionFeatures(auditionId):null;
    if(base)auditionRef.current=applyAuditionModifiers(base,next);
    if(reset){audioRef.current?.resetSequence();voiceMeterRef.current.clear();setVoiceLevels({...EMPTY_SOUND_ENERGY});}
  };

  const togglePlayback = () => {
    if (!auditionRef.current && !exploreFeaturesRef.current && (!position || !imageReady) && !playing) return;
    if (playing) {
      audioRef.current?.stop();
      setPlaying(false);
      voiceMeterRef.current.clear(); setVoiceLevels({ ...EMPTY_SOUND_ENERGY });
    } else {
      audioRef.current?.start();
      setPlaying(true);
    }
  };

  const playerFeatures: AudioFeatures = activeAudition ?? selectedReading?.features ?? {
    ...features, earthProfile, source: "live",
    groundBrightness: features.ground.brightness, groundSaturation: features.ground.saturation,
    groundVariance: features.ground.variance, groundEdges: features.ground.edgeDensity, groundBlue: features.ground.blue,
    landFraction: geography?.landFraction ?? (earthProfile === "ocean" ? 0 : 1), landProfile: features.landProfile ?? "mixed",
    terrainRelief: terrainData?.relief ?? null, terrainElevation: terrainData?.elevation ?? null, terrainRange: terrainData?.range ?? null,
    latitude: position?.latitude ?? 0,
    wind: environment.windSpeed, temperature: environment.temperature, wave: environment.waveHeight,
    isDay: environment.isDay === null ? null : environment.isDay === 1,
    cloud: audioCloud, tonality: liveTonality,
  };
  const changeListeningMode = (mode: ListeningMode) => {
    if (mode === listeningMode) return;
    audioRef.current?.listeningTransitionSound(mode);
    audioRef.current?.setListeningMode(mode); setListeningMode(mode);
  };
  const playerReady = !!activeAudition || (explorePoint ? !!selectedReading : (!!position && imageReady));
  const selectExplore = (point: GeoPoint) => {
    const normalized = normalizeView(point);
    if (!normalized) return;
    if (auditionRef.current) selectAudition(null);
    explorePointRef.current = normalized; setExplorePoint(normalized);
    audioRef.current?.endScratch();
  };
  const returnLive = () => {
    explorePointRef.current = null; exploreFeaturesRef.current = null; setExplorePoint(null);
    audioRef.current?.endScratch();
    if (!position || !imageReady) { audioRef.current?.stop(); setPlaying(false); }
  };
  const playerStatus = explorePoint ? exploration.error ?? (exploration.pending ? "選んだ土地を取得中 · 直前の音を続けています" : selectedReading?.weatherPending ? "選んだ地点の地表を演奏 · 気象モデルを取得中" : selectedReading?.weatherMissing ? "選んだ地点を演奏 · 風は欠測のため直前のBPMを維持" : playing ? "選んだ地点の風景を聴いています · LIVEで衛星の位置へ戻れます" : "選んだ地点を演奏できます") : !position ? orbitStatus === "degraded" ? "軌道を取得できません。再取得かLOCALで聴けます。" : "てんこう2の軌道を取得中" : !imageReady ? imageFailed ? imageRetryDelay(imageFailures) !== null ? "衛星位置は取得済み · 地表画像を自動再取得します" : "衛星位置は取得済み · 地表画像を取得できません。再取得かLOCALで聴けます。" : "衛星位置は取得済み · 地表画像を取得中" : auditionId ? "合成条件の試聴中 · 実際の地球とは連動しません" : orbitStatus === "reference" ? "保存した軌道から現在位置を推定" : playing ? "てんこう2と、地球を聴いています" : "そのまま聴く。ときどき、音に触れる。";

  const changeDetailView = (value:boolean) => {
    if(value===detailView)return;
    audioRef.current?.endScratch(); audioRef.current?.viewTransitionSound(value); setDetailView(value);
  };

  return <>
    {player && <PlayerViews loading={(!position && orbitStatus === "connecting") || (!imageReady && !imageFailed) || (!!explorePoint && exploration.pending)} inspect={detailView} onChange={changeDetailView} touch={<GroovePlayer mode="live" features={playerFeatures} position={position} track={track} cloudImageRef={imageRef} clouds={clouds} onClouds={setClouds} playing={playing} ready={playerReady} volume={volume} levels={voiceLevels}
      explore={explorePoint ? { point: selectedReading?.point ?? null, target: explorePoint, pending: exploration.pending, weatherPending: selectedReading?.weatherPending ?? true, error: exploration.error } : null}
      onExplore={selectExplore} onLive={returnLive} autoLiveEnabled={!detailView && !!position && !activeAudition} onLiveReturnSound={() => audioRef.current?.liveReturnSound()}
      listeningMode={listeningMode} tempo={tempoSettings} runtime={tempoRuntime} status={playerStatus} observation={imageReady ? IMAGE_DATE : undefined} weatherTime={explorePoint ? selectedReading?.weatherTime : environment.weatherModelTime}
      onToggle={togglePlayback} onVolume={value => { setVolume(value); audioRef.current?.setVolume(value / 100); }} onListeningMode={changeListeningMode} onTempo={changeTempo}
      onInspect={() => changeDetailView(true)} onScratch={(velocity, strength) => audioRef.current?.scratch(velocity, strength)}
      scratchReady={scratchReady} onScratchStart={held => audioRef.current?.beginScratch(held)} onScratchRelease={() => audioRef.current?.releaseScratch()} onScratchEnd={() => audioRef.current?.endScratch()}
      natureLevel={natureLevel} onNatureLevel={value => { setNatureLevel(value); audioRef.current?.setNatureLevel(value / 100); }}
      onRetry={() => {
        if (!position) setOrbitAttempt(value => value + 1);
        imageFailureCounter.current.reset();
        setImageFailures(0); setImageFailed(false); setImageAttempt(Date.now());
      }}
      needsReconnect={playing && contextState !== "running"} onReconnect={() => { audioRef.current?.start(); setPlaying(true); }} />} inspection={
    <InspectPlayer clouds={clouds} onClouds={setClouds} features={playerFeatures}
      point={activeAudition?null:selectedReading?.point??position} satellite={position} mode={activeAudition?'audition':explorePoint?'explore':'live'}
      playing={playing} ready={playerReady} levels={voiceLevels} listeningMode={listeningMode} runtime={tempoRuntime} volume={volume} pending={!!explorePoint && exploration.pending}
      observation={imageReady?IMAGE_DATE:undefined} orbitEpoch={orbitData?.epoch} weatherTime={explorePoint?selectedReading?.weatherTime:environment.weatherModelTime}
      onToggle={togglePlayback} onVolume={value=>{setVolume(value);audioRef.current?.setVolume(value/100);}} readDiagnostics={readAudioDiagnostics} orbitPaths={{past:pastPath,future:futurePath}} contourRef={contourRef} active={detailView} />} /> }
    <div className="v2-detail-wrap" hidden={player}>
    {player && <button type="button" className="v2-back-button" onClick={() => setDetailView(false)}>← TOUCH <span>再生画面へ戻る · 演奏はそのまま続きます</span></button>}
    {explorePoint && <section className="v2-explore-detail" aria-label="選択した土地の演奏"><strong>EXPLORE · 選んだ土地を演奏</strong><p>選択地点 {explorePoint.latitude.toFixed(3)}°, {explorePoint.longitude.toFixed(3)}° · {playerStatus}</p><p>適用中：{selectedReading ? `${selectedReading.point.latitude.toFixed(3)}°, ${selectedReading.point.longitude.toFixed(3)}° / ${selectedReading.features.earthProfile} / 雲 ${Math.round(selectedReading.features.cloud * 100)}% / 風 ${selectedReading.features.wind ?? "欠測"} m/s / ${selectedReading.features.tonality}` : "取得待ち（直前の演奏を継続）"}</p><small>下の地図と取得表は衛星のLIVE側。音の開発モニターではEXPLOREの適用値を表示します。</small><button type="button" onClick={returnLive}>衛星のLIVEへ戻る</button></section>}
    <main className="earth-app nucc-edition">
      <img
        ref={imageRef}
        className="analysis-image"
        src={imageAttempt ? `${EARTH_IMAGE_URL}?retry=${imageAttempt}` : EARTH_IMAGE_URL}
        alt=""
        crossOrigin="anonymous"
        onError={reportImageFailure}
        onLoad={() => {
          setImageFailed(false);
          imageFailureCounter.current.reset();
          setImageFailures(0);
          if (!IMAGE_ANALYSIS_ENABLED) return;
          setImageReady(true);
          window.requestAnimationFrame(renderContourMap);
        }}
      />

      <header className="topbar">
        <div className="brand-lockup">
          <img className="brand-logo" src={appPath("/earth-groove-logo.svg")} alt="Earth Groove — Play the Earth." />
          <div className="nucc-badge">
            <span aria-hidden="true">×</span>
            <picture>
              <source media="(max-width: 520px)" srcSet={appPath("/brand/nucc-stacked-light.svg")} />
              <img className="nucc-full-logo" src={appPath("/brand/nucc-horizontal-light.svg")} alt="N.U Cosmic Campus" />
            </picture>
          </div>
        </div>
        <div className="header-center" aria-live="polite">
          <span className={`live-pip ${orbitStatus}`} />
          <span>{orbitStatus === "live" ? "軌道データ取得済み" : orbitStatus === "reference" ? "保存済みの軌道を使用" : orbitStatus === "connecting" ? "軌道データを取得中" : "軌道データ未取得"}</span>
          <i />
          <span>{clock || "--:--:--"} UTC</span>
        </div>
        <a className="local-mode-link" href={appPath("/local/")}>ローカルモード</a>
        <button className="guide-button" type="button" aria-label="この作品について" onClick={() => guideRef.current?.showModal()}>
          <Info size={16} aria-hidden="true" /><span>この作品について</span>
        </button>
      </header>

      <section className="mission-intro" aria-label="N.U Cosmic Campus">
        <div className="mission-copy">
          <span className="mission-eyebrow">N.U COSMIC CAMPUS / EARTH GROOVE</span>
          <h1>宇宙を針に、<span>地球を奏でる。</span></h1>
          <p>てんこう2が巡る地球の風景を、音楽に。</p>
        </div>
        <div className="mission-satellite">
          <div className="mission-logos">
            <img className="mission-logo-ja" src={appPath("/brand/tenkoh2-ja-light.svg")} alt="てんこう2" />
            <img className="mission-logo-en" src={appPath("/brand/tenkoh2-en-light.svg")} alt="TEN-KOH2" />
          </div>
          <div className="mission-identity"><span>OUR RECORD NEEDLE</span><strong>地球を読む衛星</strong><em>NORAD {MISSION.noradId} · 地球低軌道</em></div>
        </div>
      </section>

      <section className="workbench">
        <section className="map-panel" aria-label="てんこう2の推定位置と軌道">
          <div className="panel-kicker">
            <span>01 / 地球を巡る軌道</span>
            <div className="map-mode" aria-label="地図の表示">
              <button type="button" aria-pressed={mapMode === "contour"} onClick={() => setMapMode("contour")}>輪郭</button>
              <button type="button" aria-pressed={mapMode === "surface"} onClick={() => setMapMode("surface")}>地表</button>
            </div>
          </div>
          <div className={`world-stage ${mapMode === "surface" ? "is-surface" : ""}`}>
            <img
              className={`world-image ${imageReady ? "ready" : ""}`}
              src={EARTH_IMAGE_URL}
              crossOrigin="anonymous"
              alt={`NASA Earth observation from ${IMAGE_DATE}`}
            />
            <canvas ref={contourRef} className={`contour-map ${imageReady ? "ready" : ""}`} aria-hidden="true" />
            <div className="world-fallback" />
            <div className="longitude-grid" />
            <div className="latitude-grid" />
            <div className="night-vignette" />
            <svg className="terrain-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path className="terrain-shadow" d={WORLD_LAND_PATH} />
              <path className="terrain-coast" d={WORLD_LAND_PATH} />
            </svg>
            <canvas ref={scoreTrailRef} className="score-trail-canvas" aria-hidden="true" />
            <svg className="track-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path className="track-predicted track-past" d={pastPath} />
              <path className="track-predicted track-future" d={futurePath} />
              {position && (
                <>
                  <line x1={currentPoint.x} y1="0" x2={currentPoint.x} y2="100" className="scan-line" />
                  <line x1="0" y1={currentPoint.y} x2="100" y2={currentPoint.y} className="scan-line" />
                </>
              )}
            </svg>
            <div className="map-labels" aria-hidden="true">
              {MAP_LABELS.map((item) => (
                <span key={item.label} style={{ left: `${item.x}%`, top: `${item.y}%` }}>{item.label}</span>
              ))}
            </div>
            {position && (
              <div
                className="analysis-field"
                aria-label="てんこう2直下の画像解析範囲。およそ東西6度、南北6度"
                style={{
                  left: `${currentPoint.x}%`,
                  top: `${currentPoint.y}%`,
                  width: `${analysisField.width}%`,
                  height: `${analysisField.height}%`,
                }}
              >
                <span>READ WINDOW</span>
              </div>
            )}
            {position ? (
              <div
                className={`satellite-marker located ${currentPoint.x > 78 ? "label-left" : ""}`}
                style={{ left: `${currentPoint.x}%`, top: `${currentPoint.y}%` }}
              >
                <span className="marker-ring" />
                <Satellite aria-hidden="true" />
                <label><img src={appPath("/brand/tenkoh2-en-light.svg")} alt="TEN-KOH2" /></label>
              </div>
            ) : (
              <div className="orbit-empty" role="status">
                <Satellite size={28} aria-hidden="true" />
                <strong>{orbitStatus === "connecting" ? "てんこう2の軌道を探しています" : "軌道データを取得できませんでした"}</strong>
                <span>{orbitStatus === "connecting" ? "地球を聴く準備をしています。" : "接続を確認して、もう一度お試しください。"}</span>
                {orbitStatus === "degraded" && <button type="button" onClick={() => { setOrbitStatus("connecting"); setOrbitAttempt((attempt) => attempt + 1); }}><RotateCcw size={14} /> 再取得する</button>}
              </div>
            )}
            <div className="record-grooves" aria-hidden="true">
              <span /><span /><span /><span />
            </div>
            <div className="map-caption">
              <span>THE EARTH IS OUR RECORD</span>
              <strong>EARTH</strong>
            </div>
            <div className="surface-chip" aria-label={`Current surface ${surface}`}>
              <strong style={{ color: `rgb(${SURFACE_COLOURS[surface]})` }}>
                <i />{position && imageReady ? SURFACE_LABELS[surface] : "地表データ待ち"}
              </strong>
              <span>{position && imageReady ? `${surface} · ${earthSound.code}` : "WAITING FOR EARTH DATA"}</span>
            </div>
            <div
              className={`coordinate-card coordinate-card--${coordinateCardSide}`}
              data-corner={`${coordinateCardSide}-bottom`}
            >
              <div><span>LAT</span><strong>{position ? `${position.latitude >= 0 ? "+" : ""}${position.latitude.toFixed(4)}°` : "—"}</strong></div>
              <div><span>LON</span><strong>{position ? `${position.longitude >= 0 ? "+" : ""}${position.longitude.toFixed(4)}°` : "—"}</strong></div>
              <div><span>ALT</span><strong>{position ? `${position.altitude.toFixed(0)} KM` : "—"}</strong></div>
              <div><span>VEL</span><strong>{position ? `${position.velocity.toFixed(2)} KM/S` : "—"}</strong></div>
            </div>
          </div>
          <div className="map-footer">
            <span>通過した軌道</span><i className="legend-line solid" />
            <span>これからの軌道</span><i className="legend-line dashed" />
            <span className="field-trail-legend" style={{ color: `rgb(${SURFACE_COLOURS[surface]})` }}>
              <i />{earthSound.code} SAMPLE TRAIL
            </span>
            <span className="map-source">NASA GIBS / {IMAGE_DATE}</span>
          </div>
        </section>

        <aside className="control-panel">
          <section className="now-reading">
            <div className="panel-kicker">
              <span>02 / いま、針の下にある風景</span>
              <span>{imageReady ? "地表画像を取得" : imageFailed ? "画像の接続待ち" : "画像を取得中"}</span>
            </div>
            <div className="reading-visual">
              <div
                className="local-image"
                style={{
                  backgroundImage: `url("${EARTH_IMAGE_URL}")`,
                  backgroundPosition: `${currentPoint.x}% ${currentPoint.y}%`,
                }}
              />
              <div className="needle"><span /><Satellite aria-hidden="true" /></div>
              <div className="reading-title">
                <span>てんこう2の直下 / EARTH SUBPOINT</span>
                <strong>{position && imageReady ? SURFACE_LABELS[surface] : "風景を待っています"}</strong>
                <em>{environment.isDay === null ? "日照データ待ち" : isDay ? "昼の地球" : "夜の地球"}{geography?.coastal?' · 海陸混在':''}{terrainData&&terrainData.relief>.55?' · 起伏大':''}</em>
                <small>{position && imageReady ? `EARTH AUDIO · ${earthSound.label}` : "EARTH AUDIO · WAITING"}</small>
              </div>
            </div>
          </section>

          <section className="environment-grid" aria-label="地表の気象モデル">
            <article><div className="data-icon"><Activity /></div><span>地域の起伏差</span><strong title={terrainData?`標高 ${Math.round(terrainData.elevation)}m / 周辺9点の高低差` : terrainStatus}>{terrainData?`${Math.round(terrainData.range)} M`:'—'}</strong></article>
            <article><div className="data-icon"><Cloud /></div><span>雲</span><strong>{environment.cloudCover === null ? imageReady && position ? `${Math.round(features.cloud * 100)}%` : "—" : `${Math.round(environment.cloudCover)}%`}</strong></article>
            <article><div className="data-icon"><Wind /></div><span>風</span><strong>{environment.windSpeed === null ? "—" : `${environment.windSpeed.toFixed(1)} M/S`}</strong></article>
            <article><div className="data-icon"><Waves /></div><span>波</span><strong>{environment.waveHeight === null ? "—" : `${environment.waveHeight.toFixed(1)} M`}</strong></article>
          </section>

          <section className="mapping-panel">
            <div className="panel-kicker"><span>03 / 風景が音に変わる</span><AudioLines aria-hidden="true" /></div>
            <div className="metrics">
              <MetricBar label="地表の明るさ → 音の高さ" value={features.ground.brightness} />
              <MetricBar label="地表の色 → 音色" value={features.ground.saturation} />
              <MetricBar label={player && !activeAudition ? "地表の質感（解析値・V2は記録のみ）" : "地表の質感 → メロディ"} value={features.ground.variance} />
              <MetricBar label={player && !activeAudition ? "風景の変化（解析値・V2は記録のみ）" : "風景の変化 → リズム"} value={rhythm} />
              <MetricBar label="雲 → 長短調・余韻" value={audioCloud} />
            </div>
            <p className="mapping-note">{activePreset ? "実環境の解析値です。合成試聴の設定は左下に表示。" : "風で速さ、雲で長短調、起伏で音の跳躍。海岸では波と陸の音が重なります。"}</p>
          </section>
        </aside>
      </section>

      <footer className={`sound-deck ${playing ? "is-playing" : "is-stopped"}`}>
        <div className="deck-header">
          <span>04 / 地球のサウンド</span>
          <strong><i />{activePreset ? `合成条件の試聴 · ${activePreset.label}${playing ? " · 再生中" : " · 停止中"}` : playing ? "地球を演奏中" : !position ? "軌道データを待っています" : !imageReady ? "地表画像を待っています" : "再生ボタンで、地球を聴く"}</strong>
        </div>

        <div className="deck-body">
          <div className="transport-controls">
            <button className={`play-button ${playing ? "playing" : ""}`} onClick={togglePlayback} type="button" disabled={!activePreset && (!position || !imageReady)} aria-pressed={playing}>
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              <span>{playing ? "演奏を止める" : activePreset ? "試聴する" : "地球を聴く"}<small>{playing ? "PAUSE EARTH" : "PLAY EARTH"}</small></span>
            </button>
            <TempoControls input={activeAudition ?? { wind: environment.windSpeed }}
              profile={player ? listeningMode : "original"} settings={tempoSettings} onChange={changeTempo} ready={!!activePreset || (!!position && imageReady)} synthetic={!!activePreset} runtime={tempoRuntime} playing={playing} />
            <div className="volume-control">
              <Volume2 aria-hidden="true" />
              <label htmlFor="volume">音量 / VOLUME</label>
              <input
                id="volume"
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setVolume(next);
                  audioRef.current?.setVolume(next / 100);
                }}
              />
              <output>{volume}</output>
            </div>
          </div>

          <div className="sound-console">
            <div className="voice-grid" aria-label="Four live sound voices">
              {AUDIO_LAYERS.map((item) => {
                const level = voiceLevels[item.layer];
                return (
                  <article
                    key={item.layer}
                    className={`voice-channel sound-${item.layer} ${level > 0.08 && playing ? "active" : ""}`}
                  >
                    <div className="voice-heading"><span>{item.label}</span><i /></div>
                    <strong title={VOICE_DRIVERS[item.layer]}>{player && !activeAudition && item.layer !== 'motif' ? item.layer === 'pad' ? 'NATURE + SOFT CHORD' : item.layer === 'bass' ? 'WARM SUB' : listeningMode === 'ambient' ? 'REST' : 'SOFT BRUSH' : item.layer==='motif'&&activeAudition?.motifStyle==='original'?'ORIGINAL FM':VOICE_TIMBRES[soundSurface][item.layer]}</strong>
                    <small>{activeAudition?.motifOnly?(item.layer==='motif'?'SYNTH ONLY':'MUTED'):`${soundMix.mixed?`OCN + ${soundMixLand.code}`:naturalSource.code} FIELD + SYNTH`}</small>
                    <div className="voice-meter" aria-label={`${item.label} activity ${Math.round(level * 100)} percent`}>
                      <span style={{ transform: `scaleX(${Math.max(0.025, level)})` }} />
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="sample-history" aria-label="Ground track phrase memory">
              <div className="history-label">
                <Activity aria-hidden="true" />
                <div>
                  <span>{activePreset ? "実環境の履歴 / 試聴には混合しません" : "巡った風景の記憶 / 160 SEC"}</span>
                  <strong>{activePreset ? "SYNTHETIC AUDITION" : "EARTH SEQUENCE"} · {currentTonality === "major" ? "長調" : "短調"}</strong>
                </div>
              </div>
              <div className="sample-cells">
                {Array.from({ length: 16 }).map((_, index) => {
                  // Keep existing readings fixed in place. Each new reading
                  // occupies the next empty cell to the left.
                  const sample = index >= phraseOffset
                    ? phraseHistory[PHRASE_SAMPLE_COUNT - 1 - index]
                    : undefined;
                  const tonality = sample?.audioFeatures.tonality;
                  const sampleCode = sample ? EARTH_SOUND_SOURCES[SURFACE_PROFILES[sample.surface]].code : null;
                  return (
                    <span
                      key={index}
                      className={sample ? `sample filled tonality-${tonality}` : "sample"}
                      aria-label={sample ? `${tonality} Earth sample` : "Awaiting Earth sample"}
                      style={sample ? {
                        opacity: 0.62 + sample.imageFeatures.brightness * 0.38,
                        "--sample-fill": 0.42 + sample.imageFeatures.edgeDensity * 0.58,
                        "--sample-colour": SURFACE_COLOURS[sample.surface],
                        borderColor: `rgba(${SURFACE_COLOURS[sample.surface]}, .72)`,
                      } as CSSProperties : undefined}
                    >
                      {sample ? (
                        <><b>{sampleCode}</b><small>{tonality === "major" ? "MAJ" : "MIN"}</small></>
                      ) : "—"}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="data-lineage" aria-label="Current data sources and sampling status">
          <div>
            <span>てんこう2の位置 / 軌道から推定</span>
            <strong>{orbitData ? `${orbitData.source}${orbitStatus === "reference" ? " 保存データ" : ""} / TLE ${orbitData.epoch.slice(0, 10)}` : "軌道データ待ち"}</strong>
          </div>
          <div>
            <span>地表画像 / NASAの観測</span>
            <strong>{imageReady ? `NASA GIBS / OBSERVED ${IMAGE_DATE}` : "NASA GIBS / 画像待ち"}</strong>
          </div>
          <div>
            <span>地表の気象 / モデルデータ</span>
            <strong>OPEN-METEO / {formatSampleTime(environment.sampledAt)}</strong>
          </div>
          <div className="earth-audio-source">
            <span>自然の録音 / {naturalSource.license}{soundMix.mixed?' · 海岸ミックス':''}</span>
            {soundMix.mixed?<><a href={EARTH_SOUND_SOURCES.ocean.sourceUrl} target="_blank" rel="noreferrer">GULF WAVES / {EARTH_SOUND_SOURCES.ocean.creator}</a><a href={soundMixLand.sourceUrl} target="_blank" rel="noreferrer"> ＋ {soundMixLand.label} / {soundMixLand.creator}</a></>:<a href={naturalSource.sourceUrl} target="_blank" rel="noreferrer">{naturalSource.label} / {naturalSource.creator}</a>}
          </div>
        </div>
      </footer>


      <dialog ref={guideRef} className="mission-guide" aria-labelledby="guide-title" onClick={(event) => { if (event.target === event.currentTarget) guideRef.current?.close(); }}>
        <div className="guide-content">
          <button className="guide-close" type="button" aria-label="作品の説明を閉じる" onClick={() => guideRef.current?.close()}><X size={20} /></button>
          <span className="mission-eyebrow">EARTH GROOVE × N.U COSMIC CAMPUS</span>
          <div className="guide-title-row">
            <h2 id="guide-title">地球がレコード。<br />てんこう2が、その針。</h2>
            <img className="guide-nucc-logo" src={appPath("/brand/nucc-stacked-light.svg")} alt="N.U Cosmic Campus" />
          </div>
          <p>地球を巡る小さな衛星。その針の下に広がる海や森、雲の風景が、一度きりの音楽になります。「地球を聴く」を押して、宇宙からの視点を体験してください。</p>
          <ol className="guide-steps">
            <li><span>01</span><div><strong>地球を巡る</strong><p>公開された軌道データから、てんこう2のいまの位置を推定します。</p></div></li>
            <li><span>02</span><div><strong>風景を読む</strong><p>衛星の直下にあるNASAの地表画像と、地表の気象モデルを読み取ります。</p></div></li>
            <li><span>03</span><div><strong>地球を奏でる</strong><p>風景の色や明るさを音色やメロディに。自然の録音と重ねて、音楽を生み出します。</p></div></li>
          </ol>
          <p className="guide-data-note">地域の起伏はCopernicus DEM GLO-90（Open-Meteo経由）の周辺9点から算出。海岸の混合は簡略な地図の周辺6°の海陸割合を使い、正確な海岸線や山頂の判定ではありません。</p>
          <p className="guide-data-note">この作品の音楽は地上で生成しています。てんこう2から直接受信した音声や写真ではありません。地表画像は観測日の画像を使用し、位置は軌道から計算しています。</p>
          <div className="guide-mission-logos" aria-label="てんこう2のロゴ">
            <img src={appPath("/brand/tenkoh2-ja-light.svg")} alt="てんこう2" />
            <img src={appPath("/brand/tenkoh2-en-light.svg")} alt="TEN-KOH2" />
          </div>
          <div className="guide-links"><a href={MISSION.website} target="_blank" rel="noreferrer">N.U Cosmic Campus ↗</a><a href={MISSION.satelliteWebsite} target="_blank" rel="noreferrer">てんこう2について ↗</a></div>
        </div>
      </dialog>
    </main></div>
    <div className={player?"v2-inspect-tools":undefined} hidden={player&&!detailView}>
      {process.env.NODE_ENV === "development" && <DevAudition selected={auditionId} playing={playing} settings={tempoSettings} modifiers={auditionModifiers}
        onSelect={selectAudition} onTogglePlayback={togglePlayback} onTempoChange={changeTempo} onModifiers={changeAuditionModifiers} />}
      {process.env.NODE_ENV === "development" && <DevAudioInspector exploration={explorePoint ? selectedReading ?? undefined : undefined}
        settings={tempoSettings} readDiagnostics={readAudioDiagnostics} windReadings={windReadings} audition={activePreset&&activeAudition?{...activePreset,features:activeAudition}:undefined} terrain={{data:terrainData,status:terrainStatus,geography}} groundSource={features.groundSource}
        inputs={{ position, orbit: orbitData, orbitStatus, imageReady, imageFailed, imageDate: IMAGE_DATE,
          imageAnalyzedAt: features.analyzedAt, features: { ...features,
            landFraction:geography?.landFraction??(earthProfile==='ocean'?0:1),landProfile:features.landProfile??'mixed',
            terrainRelief:terrainData?.relief??null,terrainElevation:terrainData?.elevation??null,terrainRange:terrainData?.range??null,
            groundBrightness: features.ground.brightness, groundSaturation: features.ground.saturation,
            groundVariance: features.ground.variance, groundEdges: features.ground.edgeDensity, groundBlue: features.ground.blue,
            cloud: audioCloud, latitude: position?.latitude ?? 0,
            temperature: environment.temperature, wind: environment.windSpeed, wave: environment.waveHeight,
            isDay: environment.isDay === null ? null : environment.isDay === 1,
            tonality: liveTonality, earthProfile }, imageCloud: features.cloud,
          environment, weather: weatherAcquisition }} />}

    </div>
  </>;
}
