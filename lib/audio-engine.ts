import { appPath } from "./app-path";
import { renderStyleFeedback, STYLE_FEEDBACK } from "./style-feedback";
import { scratchControl, SCRATCH_RETURN_SECONDS } from "./scratch-control";
import { renderViewTransitionSound, VIEW_TRANSITION_MS, VIEW_TRANSITION_LEVEL } from "./view-transition-sound";
import { createMasterOutput } from "./audio-master";
import { renderLiveReturnSound, LIVE_RETURN_SOUND_SECONDS, LIVE_RETURN_SOUND_LEVEL } from "./live-return-sound";
import { themeForProfile, motifInstrument, renderThemeVoice, type ThemeVoice } from "./theme-voice";
import { cloudMotif, deriveCloudTonality } from "./cloud-harmony";
import { deriveCloudSound } from "./cloud-sound";
import { deriveTerrainSound, terrainChord } from "./terrain-sound";
import { listeningScore, type ListeningPhrase } from "./listening-score";
import { DEFAULT_TEMPO, resolveTempo, advanceTempo, type TempoRuntime, type TempoSettings, type TempoProfile } from "./audio-tempo";

export type AudioFeatures = {
  brightness: number;
  saturation: number;
  variance: number;
  edgeDensity: number;
  cloud: number;
  blue: number;
  delta: number;
  latitude: number;
  temperature: number | null;
  wind: number | null;
  wave: number | null;
  isDay: boolean | null;
  tonality: Tonality;
  earthProfile: EarthSurfaceProfile;
  groundBrightness?: number; groundSaturation?: number; groundVariance?: number; groundEdges?: number; groundBlue?: number;
  cloudTexture?: number; cloudEdges?: number;
  source?: "live" | "audition" | "local" | "explore"; scenarioId?: string;
  motifStyle?: "themed" | "original"; motifOnly?: boolean;
  terrainRelief?: number | null; terrainElevation?: number | null; terrainRange?: number | null;
  landFraction?: number; landProfile?: EarthSurfaceProfile;
  memory?: AudioFeatures[];
};

export type ListeningMode = TempoProfile;

export type Tonality = "major" | "minor";

export type AudioLayer = "bass" | "motif" | "pad" | "pulse";

export type EarthSurfaceProfile = "ocean" | "cloud" | "arid" | "vegetated" | "mixed";

export const EARTH_SOUND_SOURCES: Record<
  EarthSurfaceProfile,
  { label: string; code: string; material: string; file: string; creator: string; sourceUrl: string; license: "CC0" }
> = {
  ocean: {
    label: "GULF WAVES",
    code: "OCN",
    material: "WATER / SURF",
    file: appPath("/audio/earth/ocean-waves.mp3"),
    creator: "the_toilet_guy",
    sourceUrl: "https://freesound.org/s/255153/",
    license: "CC0",
  },
  cloud: {
    label: "THUNDER RAIN",
    code: "CLD",
    material: "RAIN / THUNDER",
    file: appPath("/audio/earth/thunder-rain.mp3"),
    creator: "secretmojo",
    sourceUrl: "https://freesound.org/s/238862/",
    license: "CC0",
  },
  arid: {
    label: "DRY WIND",
    code: "DRY",
    material: "WIND / BADLANDS",
    file: appPath("/audio/earth/dry-wind.mp3"),
    creator: "PLukx",
    sourceUrl: "https://freesound.org/s/256125/",
    license: "CC0",
  },
  vegetated: {
    label: "WIND + LEAVES",
    code: "FRS",
    material: "TREE / LEAVES",
    file: appPath("/audio/earth/forest-leaves.mp3"),
    creator: "SamuelGremaud",
    sourceUrl: "https://freesound.org/s/546527/",
    license: "CC0",
  },
  mixed: {
    label: "ROCK COLLISIONS",
    code: "RCK",
    material: "STONE / IMPACT",
    file: appPath("/audio/earth/rock-collisions.mp3"),
    creator: "Plaban2001",
    sourceUrl: "https://freesound.org/s/579409/",
    license: "CC0",
  },
};

export type AudioLayerEvent = {
  layer: AudioLayer;
  level: number;
};

export type AudioDiagnosticEvent = {
  id: number; layer: AudioLayer; profile: EarthSurfaceProfile; frequencies: number[];
  level: number; bpm: number; audioTime: number; timestamp: number; duration?: number; instrument?: string;
};
export type AudioDiagnosticFrame = {
  profile: EarthSurfaceProfile; baseMidi: number; tonality: Tonality;
  motifInstrument: string; motifOnly: boolean;
  cutoffHz: number; reverbGain: number; activity: number; memoryCount: number;
  brightness: number; cloud: number; bpm: number; timestamp: number;
  terrainRelief: number; terrainElevation: number | null; terrainRange: number | null; landFraction: number; landProfile: EarthSurfaceProfile; targetBpm: number;
  cloudComplexity: number; source: "live" | "audition" | "local" | "explore"; scenarioId?: string;
  phrase?: ListeningPhrase; detailSource?: "cloud-texture" | "surface-texture";
  motifNotesPerBar?: number; ornamentNotesPerBar?: number;
};
export type AudioDiagnostics = {
  listeningMode: ListeningMode;
  natureLevel: number; scratch: { ready: boolean; active: boolean; held: boolean; musicGain: number; rate: number; returnMix: number; continuous: boolean; continuousAvailable: boolean; capturedSeconds: number; strength: number; velocity: number };
  contextState: string; playing: boolean; outputDb: number | null; outputPeakDb: number | null; masterBoostDb: number;
  transport: { playedSeconds: number; sceneChanges: number; resyncs: number; activeSources: number; themeBuffers: number };
  tempo: TempoRuntime; samples: { profile: EarthSurfaceProfile; weight: number; appliedGain: number; ready: boolean; paused: boolean; error: boolean }[];
  frame: AudioDiagnosticFrame | null; events: AudioDiagnosticEvent[];
  sample: { ready: boolean; paused: boolean; error: boolean } | null;
};

type SurfaceProfile = EarthSurfaceProfile;

type EarthSampleChannel = {
  element: HTMLAudioElement;
  profileGain: GainNode;
  layerGains: Record<AudioLayer, GainNode>;
};

const midiToHz = (note: number) => 440 * 2 ** ((note - 69) / 12);
const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export function deriveTonality(features: AudioFeatures, previous: Tonality = "major"): Tonality {
  return deriveCloudTonality(features.cloud, previous);
}

function surfaceProfile(features: AudioFeatures): SurfaceProfile {
  return features.earthProfile;
}

export class EarthAudioEngine {
  private listeningMode: ListeningMode = "original";
  private listeningBar = -1;
  private lastScratchTime = -Infinity;
  private lastLiveReturnTime = -Infinity;
  private liveReturnSource: AudioBufferSourceNode | null = null;
  private natureLevel = .45;
  private musicGate: GainNode | null = null;
  private scratchOutput: GainNode | null = null;
  private scratchPreviewOutput: GainNode | null = null;
  private recorder: AudioWorkletNode | null = null;
  private scratchPlayer: AudioWorkletNode | null = null;
  private continuousScratchActive = false;
  private scratchRate = 0;
  private scratchBlend = 0;
  private recorderSink: GainNode | null = null;
  private recorderReady = false;
  private capturePending = false;
  private scratchBuffers: { forward: AudioBuffer; back: AudioBuffer } | null = null;
  private scratchRecordedVolume = .72;
  private scratchActive = false;
  private scratchHeld = false;
  private scratchStrength = 0;
  private scratchVelocity = 0;
  private scratchCursor = 0;
  private scratchReleaseTimer: number | null = null;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private voiceBus: GainNode | null = null;
  private retiredBuses = new Map<GainNode, number>();
  private pendingScene: (() => void) | null = null;
  private playedSeconds = 0;
  private sceneChanges = 0;
  private resyncs = 0;
  private reverb: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private earthSampleBus: GainNode | null = null;
  private earthSamples = new Map<EarthSurfaceProfile, EarthSampleChannel>();
  private activeEarthProfile: EarthSurfaceProfile | null = null;
  private activeMix = new Map<EarthSurfaceProfile, number>();
  private activeMixKey = "";
  private tempoRuntime: TempoRuntime | null = null;
  private lastTempoTime = 0;
  private timer: number | null = null;
  private nextStepTime = 0;
  private step = 0;
  private volume = 0.72;
  private tempo: TempoSettings = { ...DEFAULT_TEMPO };
  private analyser: AnalyserNode | null = null;
  private transitionCue: {source:AudioBufferSourceNode;gain:GainNode;level:number} | null = null;
  private masterOutput: ReturnType<typeof createMasterOutput> | null = null;
  private diagnosticEvents: AudioDiagnosticEvent[] = [];
  private diagnosticFrame: AudioDiagnosticFrame | null = null;
  private diagnosticId = 0;
  private activeSources = new Set<AudioScheduledSourceNode>();
  private themeBuffers = new Map<string, AudioBuffer>();

  constructor(
    private getFeatures: () => AudioFeatures,
    private onLayer?: (event: AudioLayerEvent) => void,
    private diagnosticsEnabled = false,
  ) {}

  start() {
    if (this.context?.state === "closed") this.destroy();
    if (!this.context) this.setup();
    if (!this.context) return;
    // Resume and media playback must be requested directly inside the user's
    // click gesture. Do not await either operation here: some WebKit-based
    // browsers keep the promise pending while they unlock audio, which used to
    // leave the transport UI looking stopped even though PLAY was pressed.
    void this.context.resume().catch(() => undefined);
    for (const channel of this.earthSamples.values()) {
      if (channel.element.error) channel.element.load();
      void channel.element.play().catch(() => undefined);
    }
    if (this.timer !== null) return;
    this.recorder?.port.postMessage({ type: "enabled", value: true });
    this.recorderReady = false;
    this.scratchOutput?.gain.setValueAtTime(1, this.context.currentTime);
    this.scratchPreviewOutput?.gain.setValueAtTime(this.volume*.48, this.context.currentTime);
    this.updateEarthProfile(surfaceProfile(this.getFeatures()), this.context.currentTime, true);
    this.master?.gain.setTargetAtTime(this.volume * 0.48, this.context.currentTime, 0.03);
    this.tempoRuntime = advanceTempo(this.tempoRuntime,this.getFeatures(),this.tempo,0,this.listeningMode);
    this.lastTempoTime = this.context.currentTime;
    this.nextStepTime = this.context.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() {
    this.endScratch();
    try { this.liveReturnSource?.stop(); } catch { /* already ended */ }
    this.liveReturnSource = null; this.lastLiveReturnTime = -Infinity;
    this.scratchOutput?.gain.setTargetAtTime(0, this.context?.currentTime ?? 0, .02);
    this.scratchPreviewOutput?.gain.setTargetAtTime(0, this.context?.currentTime ?? 0, .02);
    this.recorder?.port.postMessage({ type: "enabled", value: false });
    this.recorderReady = false;
    this.scratchBuffers = null;
    this.scratchPlayer?.port.postMessage({type:"reset"});this.continuousScratchActive=false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.diagnosticEvents = this.diagnosticEvents.filter(event => event.audioTime <= (this.context?.currentTime ?? 0));
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.04);
    }
    for (const channel of this.earthSamples.values()) channel.element.pause();
  }

  setVolume(value: number) {
    this.volume = clamp(value);
    if(this.context)this.scratchPreviewOutput?.gain.setTargetAtTime(this.timer!==null?this.volume*.48:0,this.context.currentTime,.03);
    if(this.transitionCue && this.context)this.transitionCue.gain.gain.setTargetAtTime(this.volume*this.transitionCue.level,this.context.currentTime,.01);
    if (this.scratchOutput && this.context) this.scratchOutput.gain.setTargetAtTime(this.volume <= .001 ? 0 : Math.min(2, this.volume / Math.max(.01, this.scratchRecordedVolume)), this.context.currentTime, .03);
    if (this.master && this.context && this.timer !== null) {
      this.master.gain.setTargetAtTime(this.volume * 0.48, this.context.currentTime, 0.04);
    }
  }

  setTempo(settings: TempoSettings) {
    const resolved = resolveTempo(this.getFeatures(), settings, undefined, this.listeningMode);
    this.tempo = { mode: settings.mode, manualBpm: resolved.manualBpm };
    this.updateTempoTarget();
  }

  private updateTempoTarget() {
    this.tempoRuntime = this.timer === null
      ? resolveTempo(this.getFeatures(),this.tempo,this.tempoRuntime?.bpm,this.listeningMode)
      : advanceTempo(this.tempoRuntime,this.getFeatures(),this.tempo,0,this.listeningMode);
  }

  restoreTempoStatus(snapshot: TempoRuntime | null) {
    this.tempoRuntime=snapshot?{...snapshot}:null;
    this.lastTempoTime=this.context?.currentTime??0;
  }

  getTempoStatus(): TempoRuntime {
    return this.timer !== null && this.tempoRuntime ? this.tempoRuntime
      : resolveTempo(this.getFeatures(),this.tempo,this.tempoRuntime?.bpm,this.listeningMode);
  }

  getPlaybackSeconds() { return this.playedSeconds; }

  /** Apply one queued landscape on the next bar; paused changes apply immediately. */
  queueSceneChange(apply: () => void) {
    if (this.timer === null) {
      this.pendingScene = null;
      this.rotateVoiceBus(this.context?.currentTime ?? 0);
      apply();
    } else this.pendingScene = apply;
  }

  private rotateVoiceBus(time: number) {
    if (!this.context || !this.filter) return;
    const old = this.voiceBus;
    this.voiceBus = this.context.createGain();
    this.voiceBus.gain.setValueAtTime(.0001, time);
    this.voiceBus.gain.linearRampToValueAtTime(1, time + .8);
    this.voiceBus.connect(this.filter);
    if (old) {
      old.gain.cancelScheduledValues(time);
      old.gain.setValueAtTime(old.gain.value, time);
      old.gain.linearRampToValueAtTime(.0001, time + .8);
      const timer = window.setTimeout(() => { old.disconnect(); this.retiredBuses.delete(old); }, 5000);
      this.retiredBuses.set(old, timer);
    }
    this.sceneChanges++;
  }

  /** Begin each comparison at the same phrase; do not carry live notes into a trial. */
  resetSequence() {
    this.pendingScene = null;
    const context = this.context;
    if (context) {
      for (const source of this.activeSources) { try { source.stop(); } catch { /* already ended */ } }
      this.activeSources.clear();
      this.nextStepTime = context.currentTime + .08;
      // Reset sample envelopes and the deterministic recording offsets as well.
      let index = 0;
      for (const channel of this.earthSamples.values()) {
        for (const gain of Object.values(channel.layerGains)) {
          gain.gain.cancelScheduledValues(context.currentTime);
          gain.gain.setValueAtTime(.0001, context.currentTime);
        }
        if (Number.isFinite(channel.element.duration) && channel.element.duration > 2)
          channel.element.currentTime = channel.element.duration * [.12, .27, .41, .19, .08][index];
        index++;
      }
      // Reassigning the impulse clears the previous scene's reverberation tail.
      if (this.reverb) { const impulse = this.reverb.buffer; this.reverb.buffer = null; this.reverb.buffer = impulse; }
    }
    this.step = 0;
    this.listeningBar = -1;
    this.diagnosticEvents = [];
    this.diagnosticFrame = null;
  }

  private trackSource(source: AudioScheduledSourceNode) {
    this.activeSources.add(source);
    source.addEventListener("ended", () => { this.activeSources.delete(source); source.disconnect(); }, { once: true });
  }

  getDiagnostics(): AudioDiagnostics | null {
    if (!this.diagnosticsEnabled) return null;
    let outputDb: number | null = null;
    let outputPeakDb: number | null = null;
    if (this.analyser) {
      const samples = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length);
      const peak = samples.reduce((highest, n) => Math.max(highest, Math.abs(n)), 0);
      outputPeakDb = Math.max(-100, 20 * Math.log10(Math.max(.00001, peak)));
      outputDb = Math.max(-100, 20 * Math.log10(Math.max(0.00001, rms)));
    }
    const channel = this.activeEarthProfile ? this.earthSamples.get(this.activeEarthProfile) : null;
    const audioTime = this.context?.currentTime ?? 0;
    return {
      contextState: this.context?.state ?? "未作成", playing: this.timer !== null,
      listeningMode: this.listeningMode, natureLevel: this.natureLevel,
      scratch: { ready: this.recorderReady, active: this.scratchActive, held: this.scratchHeld, musicGain: this.musicGate?.gain.value ?? 1, rate:this.scratchRate, returnMix:this.scratchBlend, continuous:this.continuousScratchActive, continuousAvailable:!!this.scratchPlayer, capturedSeconds: (this.scratchBuffers?.forward.length ?? 0) / (this.context?.sampleRate ?? 1), strength: this.scratchStrength, velocity: this.scratchVelocity }, outputDb, outputPeakDb, masterBoostDb: 20 * Math.log10(this.masterOutput?.input.gain.value ?? 1), frame: this.diagnosticFrame, tempo: this.getTempoStatus(),
      transport: { playedSeconds: this.playedSeconds, sceneChanges: this.sceneChanges, resyncs: this.resyncs, activeSources: this.activeSources.size, themeBuffers: this.themeBuffers.size },
      samples: [...this.activeMix].filter(([,weight])=>weight>0).map(([profile,weight])=>{
        const element=this.earthSamples.get(profile)!.element;
        return {profile,weight,appliedGain:this.earthSamples.get(profile)!.profileGain.gain.value,ready:element.readyState>=2,paused:element.paused,error:!!element.error};
      }),
      events: this.diagnosticEvents.filter(event => event.audioTime <= audioTime),
      sample: channel ? { ready: channel.element.readyState >= 2, paused: channel.element.paused, error: !!channel.element.error } : null,
    };
  }

  private recordDiagnostic(layer: AudioLayer, time: number, notes: number[], level: number, profile: EarthSurfaceProfile, duration?: number, instrument?: string) {
    if (!this.diagnosticsEnabled || !this.context) return;
    this.diagnosticEvents.push({ id: ++this.diagnosticId, layer, profile,
      frequencies: notes.map(midiToHz), level, duration, instrument, bpm: this.tempoRuntime?.bpm ?? resolveTempo(this.getFeatures(), this.tempo, undefined, this.listeningMode).bpm,
      audioTime: time, timestamp: Date.now() + Math.max(0, time - this.context.currentTime) * 1000 });
    this.diagnosticEvents = this.diagnosticEvents.slice(-64);
  }

  destroy() {
    this.pendingScene = null;
    this.stop();
    for (const source of this.activeSources) { try { source.stop(); } catch { /* already ended */ } }
    this.activeSources.clear();
    for (const [bus, timer] of this.retiredBuses) { window.clearTimeout(timer); bus.disconnect(); }
    this.retiredBuses.clear();
    this.voiceBus?.disconnect();
    this.voiceBus = null;
    for (const channel of this.earthSamples.values()) {
      channel.element.removeAttribute("src");
      channel.element.load();
    }
    this.earthSamples.clear();
    this.themeBuffers.clear();
    this.recorder?.port.close(); this.recorder?.disconnect(); this.recorder = null;
    this.scratchPlayer?.port.close();this.scratchPlayer?.disconnect();this.scratchPlayer=null;this.continuousScratchActive=false;
    this.recorderSink?.disconnect(); this.recorderSink = null;
    this.musicGate?.disconnect(); this.musicGate = null;
    this.scratchOutput?.disconnect(); this.scratchOutput = null;
    this.scratchPreviewOutput?.disconnect(); this.scratchPreviewOutput = null;
    this.scratchBuffers = null; this.recorderReady = false; this.capturePending = false;
    this.transitionCue?.gain.disconnect(); this.transitionCue = null;
    this.masterOutput?.destroy(); this.masterOutput = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
  }

  private setup() {
    this.lastScratchTime = -Infinity;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.volume * 0.48;

    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 12;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.3;

    this.filter = this.context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 4200;
    this.filter.Q.value = 0.7;
    this.voiceBus = this.context.createGain();
    this.voiceBus.connect(this.filter);

    this.dryGain = this.context.createGain();
    this.reverbGain = this.context.createGain();
    this.reverb = this.context.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.8, 2.4);

    this.filter.connect(this.dryGain);
    this.filter.connect(this.reverb);
    this.reverb.connect(this.reverbGain);
    this.dryGain.connect(this.master);
    this.reverbGain.connect(this.master);
    this.earthSampleBus = this.context.createGain();
    this.earthSampleBus.gain.value = this.natureGain();
    this.earthSampleBus.connect(this.master);
    this.setupEarthSamples();
    this.musicGate = this.context.createGain();
    this.musicGate.gain.value = 1;
    this.master.connect(this.musicGate); this.musicGate.connect(compressor);
    this.scratchOutput = this.context.createGain();
    this.scratchOutput.connect(compressor);
    this.scratchPreviewOutput = this.context.createGain();
    this.scratchPreviewOutput.gain.value = this.volume*.48;
    this.scratchPreviewOutput.connect(compressor);
    void this.setupScratchRecorder(this.context);
    this.masterOutput = createMasterOutput(this.context);
    compressor.connect(this.masterOutput.input);
    if (this.diagnosticsEnabled) {
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.masterOutput.output.connect(this.analyser);
      this.analyser.connect(this.context.destination);
    } else {
      this.masterOutput.output.connect(this.context.destination);
    }
  }

  private setupEarthSamples() {
    if (!this.context || !this.earthSampleBus) return;
    const filters: Record<AudioLayer, { type: BiquadFilterType; frequency: number; q: number }> = {
      bass: { type: "lowpass", frequency: 360, q: 0.8 },
      motif: { type: "bandpass", frequency: 2300, q: 1.7 },
      pad: { type: "lowpass", frequency: 5200, q: 0.45 },
      pulse: { type: "highpass", frequency: 3800, q: 0.7 },
    };

    (Object.keys(EARTH_SOUND_SOURCES) as EarthSurfaceProfile[]).forEach((profile, profileIndex) => {
      const sourceInfo = EARTH_SOUND_SOURCES[profile];
      const element = new Audio(sourceInfo.file);
      element.preload = "auto";
      element.loop = true;
      element.crossOrigin = "anonymous";
      element.playbackRate = [0.92, 0.86, 0.8, 0.96, 0.74][profileIndex];
      element.addEventListener("loadedmetadata", () => {
        if (Number.isFinite(element.duration) && element.duration > 2) {
          element.currentTime = element.duration * [0.12, 0.27, 0.41, 0.19, 0.08][profileIndex];
        }
      }, { once: true });

      const media = this.context!.createMediaElementSource(element);
      const profileGain = this.context!.createGain();
      profileGain.gain.value = 0.0001;
      const layerGains = {} as Record<AudioLayer, GainNode>;

      (Object.keys(filters) as AudioLayer[]).forEach((layer) => {
        const settings = filters[layer];
        const filter = this.context!.createBiquadFilter();
        const gain = this.context!.createGain();
        filter.type = settings.type;
        filter.frequency.value = profile === "mixed" && layer === "pad" ? 2200 : settings.frequency;
        filter.Q.value = settings.q;
        gain.gain.value = 0.0001;
        media.connect(filter);
        filter.connect(gain);
        gain.connect(profileGain);
        layerGains[layer] = gain;
      });

      profileGain.connect(this.earthSampleBus!);
      this.earthSamples.set(profile, { element, profileGain, layerGains });
    });
  }

  private updateEarthProfile(profile: EarthSurfaceProfile, time: number, immediate = false, f = this.getFeatures()) {
    const terrain=deriveTerrainSound(f);
    const key=`${profile}:${terrain.landProfile}:${terrain.landFraction.toFixed(2)}`;
    if(key===this.activeMixKey&&!immediate) return;
    this.activeMixKey=key;this.activeEarthProfile=profile;
    this.activeMix=new Map([["ocean",terrain.oceanWeight],[terrain.landProfile as EarthSurfaceProfile,terrain.landWeight]]);
    for(const [name,channel] of this.earthSamples) {
      const gain=channel.profileGain.gain;
      gain.cancelScheduledValues(time);
      gain.setTargetAtTime(Math.max(.0001,(this.activeMix.get(name)??0) * (name === "mixed" ? .25 : 1)),time,immediate ? .035 : 1.05);
    }
  }

  private earthSampleVoice(
    time: number,
    layer: AudioLayer,
    level: number,
    duration: number,
  ) {
    const context = this.context;
    if (!context) return;
    for(const [name,weight] of this.activeMix) {
      if(weight<=0) continue;
      const channel=this.earthSamples.get(name);
      if(!channel) continue;
      const gain = channel.layerGains[layer].gain;
      const attack = layer === "pad" ? .38 : layer === "bass" ? .08 : .018;
      const release = layer === "pad" ? .72 : .12;
      gain.cancelScheduledValues(time);
      gain.setValueAtTime(Math.max(.0001,gain.value),time);
      gain.setTargetAtTime(Math.max(.0002,level),time,attack);
      gain.setTargetAtTime(.0001,time+duration,release);
    }
  }

  private makeImpulse(duration: number, decay: number) {
    const context = this.context!;
    const length = context.sampleRate * duration;
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const pseudoRandom = Math.sin(i * 12.9898 + channel * 78.233) * 43758.5453;
        data[i] = ((pseudoRandom - Math.floor(pseudoRandom)) * 2 - 1) *
          (1 - i / length) ** decay;
      }
    }
    return impulse;
  }

  private schedule() {
    const context = this.context;
    if (!context) return;

    const features = this.getFeatures();
    const elapsed = Math.max(0, context.currentTime - this.lastTempoTime);
    this.playedSeconds += elapsed;
    this.tempoRuntime=advanceTempo(this.tempoRuntime,features,this.tempo,elapsed,this.listeningMode);
    this.lastTempoTime=context.currentTime;
    const {bpm}=this.tempoRuntime;
    const sixteenth = 60 / bpm / 4;

    // A delayed timer must never emit a burst of all the notes missed during sleep.
    if (this.nextStepTime < context.currentTime - .25) {
      this.nextStepTime = context.currentTime + .08;
      this.step = 0;
      this.resyncs++;
    }
    while (this.nextStepTime < context.currentTime + 0.12) {
      if (this.step === 0 && this.pendingScene) {
        const apply = this.pendingScene;
        this.pendingScene = null;
        this.rotateVoiceBus(this.nextStepTime);
        apply();
      }
      this.scheduleStep(this.nextStepTime, this.step, this.getFeatures(), bpm);
      this.nextStepTime += sixteenth;
      this.step = (this.step + 1) % 16;
    }
  }

  setListeningMode(mode: ListeningMode) {
    if (!["ambient", "groove", "original"].includes(mode)) return;
    this.listeningMode = mode;
    if (this.tempoRuntime) this.updateTempoTarget();
  }

  setNatureLevel(value: number) {
    if (!Number.isFinite(value)) return;
    this.natureLevel = clamp(value);
    if (this.context) this.earthSampleBus?.gain.setTargetAtTime(this.natureGain(), this.context.currentTime, .15);
  }

  private natureGain() {
    return (this.listeningMode === "ambient" ? .58 : this.listeningMode === "groove" ? .43 : .34) * this.natureLevel;
  }

  private async setupScratchRecorder(context: AudioContext) {
    if (!context.audioWorklet || typeof AudioWorkletNode === "undefined") return;
    try {
      await context.audioWorklet.addModule(appPath("/audio/scratch-recorder.js"));
      if (this.context !== context || context.state === "closed" || !this.master) return;
      const recorder = new AudioWorkletNode(context, "earth-scratch-recorder", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      this.recorder = recorder;
      this.recorderSink = context.createGain(); this.recorderSink.gain.value = 0;
      this.master.connect(recorder); recorder.connect(this.recorderSink); this.recorderSink.connect(context.destination);
      recorder.port.onmessage = ({ data }) => {
        if (this.context !== context) return;
        if (data.type === "ready") { this.recorderReady = true; return; }
        if (data.type !== "snapshot") return;
        this.capturePending = false;
        if (!this.scratchActive || this.timer === null) return;
        const channels = data.channels as Float32Array[];
        const length = Math.min(context.sampleRate*2, channels[0]?.length ?? 0);
        if (!length || !channels.length) return;
        const count = Math.min(2, channels.length);
        const forward = context.createBuffer(count, length, context.sampleRate);
        const back = context.createBuffer(count, length, context.sampleRate);
        for (let channel = 0; channel < count; channel++) {
          const a = forward.getChannelData(channel), b = back.getChannelData(channel);
          for (let i = 0; i < length; i++) {
            const sample = channels[channel][i];
            a[i] = Number.isFinite(sample) ? sample : 0;
            b[length - 1 - i] = a[i];
          }
        }
        this.scratchBuffers = { forward, back };
        this.scratchCursor = Math.max(0, length / context.sampleRate - .3);
        this.scratchRecordedVolume = this.volume;
        this.scratchOutput?.gain.setTargetAtTime(1, context.currentTime, .02);
        this.startContinuousScratch();
      };
      recorder.port.postMessage({ type: "enabled", value: this.timer !== null });
      try {
        await context.audioWorklet.addModule(appPath("/audio/scratch-player.js"));
        if(this.context!==context || !this.scratchOutput)return;
        this.scratchPlayer=new AudioWorkletNode(context,"earth-scratch-player",{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
        this.scratchPlayer.connect(this.scratchOutput);this.startContinuousScratch();
      } catch { /* The bounded preview remains available on unsupported devices. */ }
    } catch { /* The timbre preview remains usable if worklets are unavailable. */ }
  }

  private startContinuousScratch() {
    if(!this.scratchActive || !this.scratchPlayer || !this.scratchBuffers || this.continuousScratchActive)return;
    const buffer=this.scratchBuffers.forward;
    const channels=Array.from({length:buffer.numberOfChannels??2},(_,i)=>buffer.getChannelData(Math.min(i,(buffer.numberOfChannels??2)-1)).slice());
    const control=scratchControl(this.scratchVelocity,this.scratchStrength||1,this.scratchHeld);
    this.scratchPlayer.port.postMessage({type:"begin",channels,rate:this.scratchRate,weight:control.scratchGain,held:this.scratchHeld},channels.map(c=>c.buffer));
    this.continuousScratchActive=true;
  }

  beginScratch(held = false) {
    if (!this.context || this.timer === null) return;
    this.scratchActive = true;
    this.scratchHeld = held;
    this.scratchRate=0;this.scratchBlend=0;this.scratchStrength=1;this.scratchVelocity=0;
    this.continuousScratchActive=false;this.scratchPlayer?.port.postMessage({type:"reset"});
    if(this.scratchReleaseTimer!==null)window.clearTimeout(this.scratchReleaseTimer);
    this.scratchReleaseTimer=null;
    // Keep the upstream mix running for the rolling recording, but silence its direct playback.
    this.musicGate?.gain.cancelScheduledValues(this.context.currentTime);
    this.musicGate?.gain.setTargetAtTime(0,this.context.currentTime,.012);
    this.scratchPreviewOutput?.gain.setTargetAtTime(this.volume*.48,this.context.currentTime,.01);
    this.lastScratchTime = -Infinity;
    this.scratchBuffers = null;
    this.capturePending = false;
    this.requestScratchCapture();
    this.armScratchRelease();
  }

  /** Pointer release hands control to inertia without replacing the captured phrase. */
  releaseScratch() {
    this.scratchHeld=false;
    this.scratchPlayer?.port.postMessage({type:"control",held:false,rate:this.scratchRate,weight:1});
    if(this.scratchActive)this.armScratchRelease();
  }

  private armScratchRelease() {
    if(this.scratchHeld)return;
    if(this.scratchReleaseTimer!==null)window.clearTimeout(this.scratchReleaseTimer);
    this.scratchReleaseTimer=window.setTimeout(()=>this.endScratch(),220);
  }

  private requestScratchCapture() {
    if (this.recorderReady && this.recorder && !this.capturePending) {
      this.capturePending = true;
      this.recorder.port.postMessage({ type: "snapshot" });
    }
  }

  endScratch() {
    this.scratchActive = false; this.scratchHeld = false;
    this.scratchStrength = 0; this.scratchVelocity = 0;
    this.capturePending = false;
    if (this.scratchReleaseTimer !== null) window.clearTimeout(this.scratchReleaseTimer);
    this.scratchReleaseTimer = null;
    this.scratchRate=1;this.scratchBlend=1;
    this.scratchPlayer?.port.postMessage({type:"end",seconds:SCRATCH_RETURN_SECONDS});this.continuousScratchActive=false;
    if(this.context && this.musicGate){
      const now=this.context.currentTime;
      this.musicGate.gain.cancelScheduledValues(now);this.musicGate.gain.setValueAtTime(this.musicGate.gain.value,now);
      this.musicGate.gain.linearRampToValueAtTime(1,now+SCRATCH_RETURN_SECONDS);
    }
  }

  /** Both types of UI cue share one bounded voice and the same master volume. */
  private playTransitionCue(key: string, render: (rate:number)=>Float32Array, duration:number, level:number) {
    if(this.volume<=.001 || typeof AudioContext==="undefined")return;
    try {
      if(this.context?.state==="closed")this.destroy();
      if(!this.context)this.setup();
    } catch { return; }
    const context=this.context;
    if(!context || !this.masterOutput)return;
    void context.resume().catch(()=>undefined);
    if(this.transitionCue){
      const old=this.transitionCue;old.gain.gain.cancelScheduledValues(context.currentTime);
      old.gain.gain.setTargetAtTime(0,context.currentTime,.006);
      try{old.source.stop(context.currentTime+.025);}catch{/* already ended */}
    }
    const cacheKey=`${key}:${context.sampleRate}`;
    let buffer=this.themeBuffers.get(cacheKey);
    if(!buffer){
      const data=render(context.sampleRate);
      buffer=context.createBuffer(1,data.length,context.sampleRate);buffer.getChannelData(0).set(data);
      if(this.themeBuffers.size>=48)this.themeBuffers.delete(this.themeBuffers.keys().next().value!);
      this.themeBuffers.set(cacheKey,buffer);
    }
    const source=context.createBufferSource(),gain=context.createGain();
    source.buffer=buffer;gain.gain.setValueAtTime(this.volume*level,context.currentTime);
    source.connect(gain);gain.connect(this.masterOutput.input);
    const cue={source,gain,level};this.transitionCue=cue;
    source.addEventListener("ended",()=>{gain.disconnect();if(this.transitionCue===cue)this.transitionCue=null;},{once:true});
    this.trackSource(source);source.start(context.currentTime+.005);source.stop(context.currentTime+duration+.025);
  }

  viewTransitionSound(inspect:boolean) {
    this.playTransitionCue(`view-transition:${inspect}`,rate=>renderViewTransitionSound(rate,inspect),VIEW_TRANSITION_MS/1000,VIEW_TRANSITION_LEVEL);
  }

  listeningTransitionSound(mode: ListeningMode) {
    if(mode==="original")return;
    const spec=STYLE_FEEDBACK[mode];
    this.playTransitionCue(`listening-transition:${mode}`,rate=>renderStyleFeedback(rate,mode),spec.soundDurationMs/1000,spec.level);
  }

  /** A soft low-frequency descent accompanies the slower pull back into LIVE. */
  liveReturnSound() {
    const context = this.context;
    if (!context || context.state !== "running" || this.timer === null || !this.master || this.volume <= .001) return;
    const now = context.currentTime;
    const duration = LIVE_RETURN_SOUND_SECONDS;
    if (now >= this.lastLiveReturnTime && now - this.lastLiveReturnTime < duration + .1) return;
    this.lastLiveReturnTime = now;
    const key = `live-return-gravity:${context.sampleRate}`;
    let buffer = this.themeBuffers.get(key);
    if (!buffer) {
      const data = renderLiveReturnSound(context.sampleRate);
      buffer = context.createBuffer(1, data.length, context.sampleRate);
      buffer.getChannelData(0).set(data);
      if (this.themeBuffers.size >= 48) this.themeBuffers.delete(this.themeBuffers.keys().next().value!);
      this.themeBuffers.set(key, buffer);
    }
    const source = context.createBufferSource(), gain = context.createGain();
    this.liveReturnSource = source;
    source.buffer = buffer;
    gain.gain.setValueAtTime(LIVE_RETURN_SOUND_LEVEL, now);
    source.connect(gain); gain.connect(this.master);
    source.addEventListener("ended", () => {
      gain.disconnect(); if (this.liveReturnSource === source) this.liveReturnSource = null;
    }, { once: true });
    this.trackSource(source); source.start(now); source.stop(now + duration + .02);
    this.recordDiagnostic("bass", now, [], LIVE_RETURN_SOUND_LEVEL, this.getFeatures().earthProfile, duration, "LIVE RETURN / GRAVITY");
    this.onLayer?.({ layer: "bass", level: LIVE_RETURN_SOUND_LEVEL });
  }

  /** A continuous signed read head in modern browsers; a bounded preview on older devices. */
  scratch(velocity: number, strength = 1) {
    const context = this.context;
    if (!context || context.state !== "running" || this.timer === null || !this.master || !Number.isFinite(velocity) || !Number.isFinite(strength) || strength <= 0 || this.volume <= .001) return;
    const now = context.currentTime;
    if (!this.scratchActive) this.beginScratch();
    strength = clamp(strength);
    this.scratchStrength = strength; this.scratchVelocity = velocity;
    if (!this.scratchBuffers) this.requestScratchCapture();
    this.armScratchRelease();
    const control=scratchControl(velocity,strength,this.scratchHeld);
    this.scratchRate=control.rate;this.scratchBlend=control.blend;
    this.musicGate?.gain.setTargetAtTime(control.musicGain,now,.035);
    this.startContinuousScratch();
    const f = this.getFeatures();
    const direction = velocity < 0 ? "back" : "forward";
    if(this.continuousScratchActive && this.scratchPlayer){
      this.scratchPlayer.port.postMessage({type:"control",rate:control.rate,weight:control.scratchGain,held:this.scratchHeld});
      if(now-this.lastScratchTime>=.045){
        this.lastScratchTime=now;
        this.recordDiagnostic("motif",now,[],control.scratchGain*.95,f.earthProfile,undefined,`SCRATCH / LIVE ${direction}`);
        this.onLayer?.({layer:"motif",level:.2*control.scratchGain});
      }
      return;
    }
    if(!this.scratchBuffers && this.recorderReady && this.capturePending && this.scratchPlayer)return;
    if(now-this.lastScratchTime<.045 || Math.abs(control.rate)<.02)return;
    this.lastScratchTime=now;
    const rate=Math.max(.05,Math.abs(control.rate));
    const live = this.scratchBuffers;
    let buffer: AudioBuffer;
    let offset = 0;
    let duration = .22;
    if (live) {
      const seconds = live.forward.length / context.sampleRate;
      duration = Math.min(.22, seconds * .7);
      this.scratchCursor = clamp(this.scratchCursor + Math.sign(velocity) * .04, 0, Math.max(0, seconds - duration));
      buffer = live[direction];
      offset = direction === "back" ? Math.max(0, seconds - this.scratchCursor - duration) : this.scratchCursor;
    } else {
      // Clearly identified synthesis preview while the recorder is warming up or unavailable.
      const theme = themeForProfile(f.earthProfile) ?? "harp";
      const pitch = midiToHz(60 + (f.tonality === "minor" ? 3 : 4));
      const key = `scratch:${theme}:${direction}:${pitch}:${context.sampleRate}`;
      let cached = this.themeBuffers.get(key);
      if (!cached) {
        const phrase = renderThemeVoice(theme, pitch, .65, context.sampleRate);
        const length = Math.floor(context.sampleRate * duration);
        cached = context.createBuffer(1, length, context.sampleRate);
        const target = cached.getChannelData(0);
        for (let i = 0; i < length; i++) target[i] = phrase[direction === "back" ? length - 1 - i : i] * Math.sin(Math.PI * i / Math.max(1, length - 1)) ** 2;
        if (this.themeBuffers.size >= 48) this.themeBuffers.delete(this.themeBuffers.keys().next().value!);
        this.themeBuffers.set(key, cached);
      }
      buffer = cached;
    }
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; source.playbackRate.setValueAtTime(rate, now);
    const level = (live ? .95 : .19) * control.scratchGain;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.linearRampToValueAtTime(level, now + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration / rate);
    source.connect(gain); gain.connect(live ? this.scratchOutput! : this.scratchPreviewOutput!);
    source.addEventListener("ended", () => gain.disconnect(), { once: true });
    this.trackSource(source); source.start(now, offset, duration); source.stop(now + duration / rate + .025);
    this.recordDiagnostic("motif", now, [], level, f.earthProfile, duration / rate, `SCRATCH / ${live ? "LIVE " : "PREVIEW "}${direction}`);
    this.onLayer?.({ layer: "motif", level: .2 * strength });
  }

  private scheduleListeningStep(time: number, step: number, f: AudioFeatures, bpm: number) {
    if (!this.context || !this.filter || !this.reverbGain || !this.dryGain) return;
    if (step === 0) this.listeningBar++;
    const ambient = this.listeningMode === "ambient";
    const sky = deriveCloudSound(f);
    const score = listeningScore(f, ambient, this.listeningBar);
    const terrain = deriveTerrainSound(f);
    const profile = surfaceProfile(f);
    const beat = 60 / bpm;
    const roots = f.tonality === "major" ? [0, 5, 7, 4] : [0, 5, 7, 3];
    const base = 40 + Math.round(sky.brightness * 7) + terrain.heightLift;
    const root = base + roots[Math.floor(this.listeningBar / 4) % 4];
    const chord = terrainChord(f.tonality === "major" ? [0, 4, 7] : [0, 3, 7], terrain.relief * .5);
    const instrument = motifInstrument(profile);
    const cutoff = 1400 + sky.saturation * 2100;
    const reverb = .2 + f.cloud * .12;
    this.updateEarthProfile(profile, time, false, f);
    this.filter.frequency.setTargetAtTime(cutoff, time, 1.5);
    this.reverbGain.gain.setTargetAtTime(reverb, time, 1.2);
    this.dryGain.gain.setTargetAtTime(.82, time, 1.2);
    this.earthSampleBus?.gain.setTargetAtTime(this.natureGain(), time, .4);
    this.master?.gain.setTargetAtTime(this.volume * .48, time, .1);
    if (this.diagnosticsEnabled) this.diagnosticFrame = {
      profile, baseMidi: base, tonality: f.tonality, motifInstrument: instrument, motifOnly: false,
      cutoffHz: cutoff, reverbGain: reverb, activity: score.detail,
      memoryCount: 1, brightness: sky.brightness, cloud: f.cloud,
      bpm, timestamp: Date.now(), terrainRelief: terrain.relief,
      terrainElevation: f.terrainElevation ?? null, terrainRange: f.terrainRange ?? null,
      landFraction: terrain.landFraction, landProfile: terrain.landProfile as EarthSurfaceProfile,
      targetBpm: this.tempoRuntime?.targetBpm ?? bpm, cloudComplexity: sky.complexity,
      source: f.source ?? "live", scenarioId: f.scenarioId,
      phrase: score.phrase, detailSource: score.detailSource,
      motifNotesPerBar: score.motifSteps.length, ornamentNotesPerBar: score.ornamentSteps.length,
    };
    // One broad natural bed per bar, rather than chopped recordings on every beat.
    if (step === 0) {
      this.earthSampleVoice(time, "pad", ambient ? .42 : .3, beat * 4 + .4);
      this.onLayer?.({ layer: "pad", level: .045 });
      this.recordDiagnostic("pad", time, [], .045, profile, beat * 4, "NATURAL BED");
      if (this.listeningBar % 2 === 0) {
        for (const degree of chord) this.voice(time, midiToHz(root + 12 + degree), .021, beat * 9, "sine", beat * 1.4, 1900, degree % 2 ? -4 : 4);
        this.recordDiagnostic("pad", time, chord.map(n => root + 12 + n), .021, profile, beat * 9, "SOFT CHORD");
      }
    }
    const bassStep = score.bassSteps.includes(step);
    if (bassStep) {
      const level = ambient ? .045 : .065;
      const note = root - 12 + (!ambient && step === 14 ? 7 : 0);
      const duration = beat * (ambient ? 6 : .72);
      this.voice(time, midiToHz(note), level, duration, ambient ? "sine" : "triangle", ambient ? .4 : .012, 700);
      this.recordDiagnostic("bass", time, [note], level, profile, duration, ambient ? "WARM SUB" : "GROOVE BASS");
      this.onLayer?.({ layer: "bass", level });
    }
    const ornament = score.ornamentSteps.includes(step);
    const motifStep = score.motifSteps.includes(step) || ornament;
    if (motifStep) {
      const motif = cloudMotif(f.tonality, step, this.listeningBar * 3);
      const midi = root + 12 + motif.interval + (ornament ? 12 : 0) + (this.listeningBar % 4 === 3 ? Math.min(terrain.leap, 12) : 0);
      const duration = beat * (ambient ? (f.tonality === "minor" ? 2.5 : 1.6) : ornament ? .32 : .8);
      const level = ambient ? .065 : ornament ? .032 : .06;
      this.motifVoice(time, midiToHz(midi), level, profile, duration);
      this.recordDiagnostic("motif", time, [midi], level, profile, duration, ornament ? `${instrument} / ORNAMENT` : instrument);
      this.onLayer?.({ layer: "motif", level });
    }
    if (score.kickSteps.includes(step)) {
      this.kickVoice(time, .11);
      this.recordDiagnostic("pulse", time, [], .11, profile, .22, "SOFT KICK");
      this.onLayer?.({ layer: "pulse", level: .11 });
    }
    if (score.hatSteps.includes(step)) {
      const level = step % 4 === 2 ? .017 : .009;
      this.noise(time, level, .045, "highpass", 2600);
      this.recordDiagnostic("pulse", time, [], level, profile, .045, "TEXTURE HAT");
      this.onLayer?.({ layer: "pulse", level });
    }
    if (score.brushSteps.includes(step)) {
      this.noise(time, .026, .16, "lowpass", 1600);
      this.recordDiagnostic("pulse", time, [], .026, profile, .16, "SOFT BRUSH");
      this.onLayer?.({ layer: "pulse", level: .026 });
    }
  }

  private kickVoice(time: number, level: number) {
    const context = this.context;
    if (!context || !this.voiceBus) return;
    const source = context.createOscillator();
    const gain = context.createGain();
    source.type = "sine";
    source.frequency.setValueAtTime(125, time);
    source.frequency.exponentialRampToValueAtTime(46, time + .09);
    gain.gain.setValueAtTime(.0001, time);
    gain.gain.exponentialRampToValueAtTime(level, time + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, time + .22);
    source.connect(gain); gain.connect(this.voiceBus);
    source.addEventListener("ended", () => gain.disconnect(), { once: true });
    this.trackSource(source);
    source.start(time); source.stop(time + .24);
  }

  private scheduleStep(time: number, step: number, f: AudioFeatures, bpm: number) {
    if (!this.context || !this.filter || !this.reverbGain || !this.dryGain) return;

    if (this.listeningMode !== "original" && f.source !== "audition") {
      this.scheduleListeningStep(time, step, f, bpm); return;
    }
    this.earthSampleBus?.gain.setTargetAtTime(this.natureGain(), time, .4);
    const memory = f.memory?.length ? f.memory : [f];
    const average = (read: (sample: AudioFeatures) => number) =>
      memory.reduce((sum, sample) => sum + read(sample), 0) / memory.length;
    const sky = deriveCloudSound(f);
    const terrain = deriveTerrainSound(f);
    const first = deriveCloudSound(memory[0]);
    const last = deriveCloudSound(memory.at(-1) ?? f);
    const oceanMemory = average((sample) => sample.earthProfile === "ocean" ? 1 : 0);
    const reliefMemory = clamp(average((sample) => { const ground = deriveCloudSound(sample); return ground.variance * .62 + ground.edges * .58; }));
    const journeyChange = clamp(
      Math.abs(last.blue - first.blue) * 0.7 +
      Math.abs(last.saturation - first.saturation) * 0.45 +
      average((sample) => sample.delta) * 0.55,
    );
    const ocean = clamp((sky.sea ? 1 : 0) * .62 + oceanMemory * .38);
    const relief = clamp((sky.variance * 0.62 + sky.edges * 0.58) * 0.65 + reliefMemory * 0.35);
    const profile = surfaceProfile(f);
    const motifOnly = f.source === "audition" && !!f.motifOnly;
    const motifStyle = f.source === "audition" ? f.motifStyle ?? "themed" : "themed";
    const instrument = motifInstrument(profile, motifStyle);
    this.updateEarthProfile(profile, time, false, f);
    const chordShape = terrainChord(f.tonality === "major" ? [0,4,7] : [0,3,7],terrain.relief);
    const chordRoots = f.tonality === "major" ? [0, 5, 7, 4] : [0, 5, 7, 3];
    const base = 36 + Math.round(sky.brightness * 14) + Math.round(relief * 4) - Math.round(ocean * 3) + terrain.heightLift;
    const seed = Math.abs(Math.round((f.latitude + 90) * 41 + sky.variance * 997));
    const activity = clamp((.1 + sky.edges * .68 + f.delta * .48 + journeyChange * .38) * (1 - ocean * .34) + sky.melodyBoost + terrain.extraActivity);
    const cutoffHz = (700 + sky.saturation * 7000 + relief * 900) * sky.cutoffMultiplier;
    const reverbGain = sky.reverb + average(sample => sample.cloud) * .03;

    if (this.diagnosticsEnabled) {
      this.diagnosticFrame = {
        profile, baseMidi: base, tonality: f.tonality, motifInstrument: instrument, motifOnly,
        cutoffHz,
        reverbGain,
        activity, memoryCount: memory.length, brightness: sky.brightness, cloud: f.cloud,
        cloudComplexity: sky.complexity, source: f.source ?? "live", scenarioId: f.scenarioId,
        terrainRelief:terrain.relief,terrainElevation:f.terrainElevation??null,terrainRange:f.terrainRange??null,
        landFraction:terrain.landFraction,landProfile:terrain.landProfile as EarthSurfaceProfile,targetBpm:this.tempoRuntime?.targetBpm??bpm,
        bpm, timestamp: Date.now(),
      };
    }

    this.filter.frequency.setTargetAtTime(cutoffHz, time, .08);
    this.reverbGain.gain.setTargetAtTime(reverbGain, time, .1);
    this.dryGain.gain.setTargetAtTime(0.94 - f.cloud * 0.08, time, 0.1);
    this.master?.gain.setTargetAtTime(this.volume * 0.48, time, 0.04);

    if (!motifOnly && step % 4 === 0) {
      const bassDegree = chordRoots[(step / 4 + seed) % chordRoots.length];
      this.bassVoice(time, midiToHz(base - 12 + bassDegree), 0.3, profile);
      this.earthSampleVoice(time, "bass", 0.105 + ocean * 0.035, 0.62);
      this.recordDiagnostic("bass", time, [base - 12 + bassDegree], 0.3, profile);
      this.onLayer?.({ layer: "bass", level: 0.32 });
    }

    const trigger = ((seed * 13 + step * 17) % 100) / 100;
    const motif = cloudMotif(f.tonality, step, seed);
    // Expose a clear theme on every beat; the image adds intervening notes.
    if (motif.anchor || (step % 4 === 2 && trigger < activity)) {
      const root = base + chordRoots[(seed + Math.floor(step / 8)) % chordRoots.length];
      const midi = root + 12 + motif.interval + (step % 8 === 4 ? terrain.leap : 0);
      const duration = Math.max(.1, 60 / bpm * motif.beats);
      const level = motif.anchor ? .18 : .105 + sky.complexity * .035;
      this.motifVoice(time, midiToHz(midi), level, profile, duration, motifStyle);
      if (!motifOnly) this.earthSampleVoice(time, "motif", .085 + relief * .055, .24 + sky.variance * .22);
      this.recordDiagnostic("motif", time, [midi], level, profile, duration, instrument);
      this.onLayer?.({ layer: "motif", level });
    }

    if (!motifOnly && step % 8 === 0) {
      const root = base + chordRoots[(seed + step / 8) % chordRoots.length];
      this.padChord(time, root + 12, chordShape, profile, sky.padLevel);
      this.earthSampleVoice(time, "pad", 0.12 + f.cloud * 0.045, 2.7 + f.cloud * 1.4);
      this.recordDiagnostic("pad", time, chordShape.map(interval => root + 12 + interval), sky.padLevel, profile);
      this.onLayer?.({ layer: "pad", level: 0.075 });
    }

    if (!motifOnly && step % 4 === 2 && (sky.edges > .25 || trigger < sky.pulseDensity)) {
      this.pulseVoice(time, 0.018 + sky.edges * 0.035, profile);
      this.earthSampleVoice(time, "pulse", 0.06 + sky.edges * 0.07, 0.055 + sky.edges * 0.08);
      this.recordDiagnostic("pulse", time, [], 0.018 + sky.edges * 0.035, profile);
      this.onLayer?.({ layer: "pulse", level: 0.018 + sky.edges * 0.035 });
    }
  }

  private voice(
    time: number,
    frequency: number,
    level: number,
    duration: number,
    type: OscillatorType,
    attack = 0.02,
    cutoff = 12000,
    detune = 0,
  ) {
    if (!this.context || !this.filter) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const localFilter = this.context.createBiquadFilter();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.detune.setValueAtTime(detune, time);
    localFilter.type = "lowpass";
    localFilter.frequency.setValueAtTime(cutoff, time);
    localFilter.Q.value = 0.8;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(localFilter);
    localFilter.connect(gain);
    gain.connect(this.voiceBus!);
    oscillator.addEventListener("ended", () => { localFilter.disconnect(); gain.disconnect(); }, { once: true });
    this.trackSource(oscillator);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.05);
  }

  private bassVoice(time: number, frequency: number, level: number, profile: SurfaceProfile) {
    const settings: Record<SurfaceProfile, { type: OscillatorType; overtone: OscillatorType; duration: number; cutoff: number }> = {
      ocean: { type: "sine", overtone: "sine", duration: 0.95, cutoff: 900 },
      cloud: { type: "sine", overtone: "triangle", duration: 0.82, cutoff: 1250 },
      arid: { type: "triangle", overtone: "square", duration: 0.32, cutoff: 1800 },
      vegetated: { type: "triangle", overtone: "sine", duration: 0.55, cutoff: 1450 },
      mixed: { type: "sawtooth", overtone: "triangle", duration: 0.42, cutoff: 1150 },
    };
    const setting = settings[profile];
    this.voice(time, frequency, level, setting.duration, setting.type, 0.012, setting.cutoff);
    this.voice(time, frequency * 2, level * 0.16, setting.duration * 0.72, setting.overtone, 0.008, setting.cutoff * 1.25);
  }

  private motifVoice(
    time: number,
    frequency: number,
    level: number,
    profile: SurfaceProfile,
    duration: number,
    style: "themed" | "original" = "themed",
  ) {
    if (!this.context || !this.filter) return;
    if (profile === "mixed") level *= .65;
    const theme = style === "themed" ? themeForProfile(profile) : null;
    if (theme) {
      this.themeVoice(time, frequency, level, duration, theme);
      return;
    }
    const settings: Record<SurfaceProfile, { carrier: OscillatorType; ratio: number; index: number; decay: number }> = {
      ocean: { carrier: "sine", ratio: 2.02, index: 3.8, decay: 1.15 },
      cloud: { carrier: "sine", ratio: 3.5, index: 2.4, decay: 1.45 },
      arid: { carrier: "triangle", ratio: 1.49, index: 1.8, decay: 0.22 },
      vegetated: { carrier: "sine", ratio: 2.72, index: 5.4, decay: 0.48 },
      mixed: { carrier: "triangle", ratio: 2.11, index: 3.2, decay: 0.62 },
    };
    const setting = settings[profile];
    const carrier = this.context.createOscillator();
    const modulator = this.context.createOscillator();
    const modulation = this.context.createGain();
    const gain = this.context.createGain();
    carrier.type = setting.carrier;
    carrier.frequency.setValueAtTime(frequency, time);
    modulator.type = "sine";
    modulator.frequency.setValueAtTime(frequency * setting.ratio, time);
    modulation.gain.setValueAtTime(frequency * setting.index, time);
    modulation.gain.exponentialRampToValueAtTime(0.001, time + Math.min(duration, setting.decay));
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * 0.72), time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    modulator.connect(modulation);
    modulation.connect(carrier.frequency);
    carrier.connect(gain);
    gain.connect(this.voiceBus!);
    carrier.addEventListener("ended", () => { modulation.disconnect(); gain.disconnect(); }, { once: true });
    this.trackSource(carrier);
    this.trackSource(modulator);
    carrier.start(time);
    modulator.start(time);
    const stopAt = time + duration + 0.05;
    carrier.stop(stopAt);
    modulator.stop(stopAt);
  }

  private themeVoice(time: number, frequency: number, level: number, duration: number, theme: ThemeVoice) {
    const context = this.context;
    if (!context || !this.filter) return;
    const key = `${theme}:${frequency.toFixed(3)}:${duration.toFixed(3)}:${context.sampleRate}`;
    let buffer = this.themeBuffers.get(key);
    if (!buffer) {
      const samples = renderThemeVoice(theme, frequency, duration, context.sampleRate);
      buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.getChannelData(0).set(samples);
      if (this.themeBuffers.size >= 48) this.themeBuffers.delete(this.themeBuffers.keys().next().value!);
      this.themeBuffers.set(key, buffer);
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = level * 1.25;
    source.connect(gain);
    gain.connect(this.voiceBus!);
    source.addEventListener("ended", () => gain.disconnect(), { once: true });
    this.trackSource(source);
    source.start(time);
  }

  private padChord(
    time: number,
    midiRoot: number,
    chordShape: number[],
    profile: SurfaceProfile,
    level: number,
  ) {
    const settings: Record<SurfaceProfile, { type: OscillatorType; companion: OscillatorType; cutoff: number; duration: number }> = {
      ocean: { type: "sine", companion: "triangle", cutoff: 2600, duration: 3.5 },
      cloud: { type: "triangle", companion: "sine", cutoff: 4200, duration: 4.1 },
      arid: { type: "triangle", companion: "sawtooth", cutoff: 1900, duration: 2.3 },
      vegetated: { type: "triangle", companion: "sine", cutoff: 3200, duration: 3.2 },
      mixed: { type: "sawtooth", companion: "triangle", cutoff: 2400, duration: 2.8 },
    };
    const setting = settings[profile];
    chordShape.forEach((interval, index) => {
      const frequency = midiToHz(midiRoot + interval);
      const offset = index * 0.025;
      this.voice(time + offset, frequency, level, setting.duration, setting.type, 0.24, setting.cutoff, -7);
      this.voice(time + offset, frequency, 0.009, setting.duration * 0.94, setting.companion, 0.31, setting.cutoff * 1.2, 7);
    });
  }

  private pulseVoice(time: number, level: number, profile: SurfaceProfile) {
    if (profile === "ocean") {
      this.noise(time, level * 0.72, 0.13, "bandpass", 1250);
      return;
    }
    if (profile === "cloud") {
      this.noise(time, level * 0.52, 0.18, "lowpass", 2400);
      return;
    }
    if (profile === "vegetated") {
      this.voice(time, 620, level * 2.2, 0.055, "square", 0.003, 1900);
      return;
    }
    if (profile === "arid") {
      this.noise(time, level, 0.026, "highpass", 4800);
      return;
    }
    this.voice(time, 860, level * 1.7, 0.042, "triangle", 0.003, 2800);
    this.noise(time, level * 0.42, 0.04, "highpass", 3500);
  }

  private noise(
    time: number,
    level: number,
    duration: number,
    filterType: BiquadFilterType = "highpass",
    frequency = 3200,
  ) {
    if (!this.context || !this.filter) return;
    const length = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      const pseudo = Math.sin((i + this.step * 97) * 45.332) * 9282.112;
      data[i] = (pseudo - Math.floor(pseudo)) * 2 - 1;
    }
    const source = this.context.createBufferSource();
    const highpass = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    highpass.type = filterType;
    highpass.frequency.value = frequency;
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.buffer = buffer;
    source.connect(highpass);
    highpass.connect(gain);
    gain.connect(this.voiceBus!);
    source.addEventListener("ended", () => { highpass.disconnect(); gain.disconnect(); }, { once: true });
    this.trackSource(source);
    source.start(time);
  }
}
