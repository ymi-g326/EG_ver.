"use client";

import { appPath } from "@/lib/app-path";

import { useEffect, useRef, useState, useCallback, type CSSProperties, type RefObject } from "react";
import { ArrowUpRight, AudioLines, Cloud, Info, LocateFixed, Pause, Play, Radio, RotateCcw, SlidersHorizontal, Volume2, Wind, X } from "lucide-react";
import { VOICE_COLORS } from "@/lib/voice-colors";
import type { OrbitalPoint } from "@/lib/globe-atmosphere";
import { useStyleFeedback, useScratchFeedback } from "@/components/style-feedback";
import type { ScratchWaveSource } from "@/lib/scratch-feedback";
import RecordGlobe from "@/components/record-globe";
import MissionMark from "@/components/mission-mark";
import { LiveReturnIdle, LIVE_RETURN_IDLE_MS, LIVE_RETURN_CHECK_MS } from "@/lib/live-return";
import type { GeoPoint } from "@/lib/globe-geometry";
import { EARTH_SOUND_SOURCES, type AudioFeatures, type AudioLayer, type ListeningMode } from "@/lib/audio-engine";
import { AUTO_BPM_MAX, type TempoRuntime, type TempoSettings } from "@/lib/audio-tempo";
import { motifInstrument } from "@/lib/theme-voice";

type Props = {
  mode: "live" | "local";
  features: AudioFeatures;
  position: (GeoPoint & { altitude?: number }) | null;
  track?: { past: OrbitalPoint[]; future: OrbitalPoint[] };
  cloudImageRef?: RefObject<HTMLImageElement|null>;
  clouds?: boolean; onClouds?: (enabled:boolean) => void;
  playing: boolean;
  ready: boolean;
  volume: number;
  levels: Record<AudioLayer, number>;
  listeningMode: ListeningMode;
  tempo: TempoSettings;
  runtime: TempoRuntime | null;
  status: string;
  observation?: string;
  weatherTime?: string | null;
  onToggle: () => void;
  onVolume: (value: number) => void;
  onListeningMode: (mode: ListeningMode) => void;
  onTempo: (settings: TempoSettings) => void;
  onInspect: () => void;
  onExplore?: (point: GeoPoint) => void;
  onLive?: () => void;
  autoLiveEnabled?: boolean;
  onLiveReturnSound?: () => void;
  explore?: { point: GeoPoint | null; target: GeoPoint; pending: boolean; weatherPending: boolean; error: string | null } | null;
  onScratch: (velocity: number, strength?: number) => void;
  onScratchStart: (held?: boolean) => void;
  onScratchRelease: () => void;
  onScratchEnd: () => void;
  scratchReady: boolean;
  natureLevel: number;
  onNatureLevel: (value: number) => void;
  onRetry?: () => void;
  onNext?: () => void;
  needsReconnect?: boolean;
  onReconnect?: () => void;
};

const LANDSCAPES = {
  ocean: { name: "Open ocean", japanese: "海の風景", code: "OCN", natural: "Ocean waves" },
  vegetated: { name: "Forest canopy", japanese: "緑の風景", code: "FRS", natural: "Wind & leaves" },
  arid: { name: "Dry earth", japanese: "乾いた大地", code: "DRY", natural: "Dry wind" },
  mixed: { name: "Land & stone", japanese: "陸の風景", code: "LND", natural: "Stone textures" },
  cloud: { name: "Cloud cover", japanese: "雲の風景", code: "CLD", natural: "Rain textures" },
};
const LAYERS: AudioLayer[] = ["motif", "pad", "bass", "pulse"];
const LAYER_NAMES = { motif: "MELODY", pad: "HARMONY", bass: "LOW END", pulse: "RHYTHM" };
const COLORS = VOICE_COLORS;

export default function GroovePlayer(props: Props) {
  const clouds = props.clouds ?? false;
  const styleFeedback = useStyleFeedback();
  const scratchFeedback = useScratchFeedback();
  const scratchWave = useCallback((source: ScratchWaveSource) => {
    const mode = latest.current.listeningMode;
    if (latest.current.playing && (mode === "ambient" || mode === "groove")) scratchFeedback(mode, source);
  }, [scratchFeedback]);
  const [centerToken, setCenterToken] = useState(0);
  const [followingLive, setFollowingLive] = useState(props.mode === "live");
  const latest = useRef(props);
  const rootRef = useRef<HTMLElement>(null);
  const idle = useRef(new LiveReturnIdle());
  useEffect(() => { latest.current = props; });
  const leaveLive = useCallback((returnOnRelease = true) => {
    if (latest.current.mode !== "live") return;
    idle.current.leaveLive(performance.now(), returnOnRelease); setFollowingLive(false);
  }, []);
  const returnLive = useCallback(() => {
    const state = latest.current;
    if (!state.position || !state.onLive || (!idle.current.isAway && !state.explore)) return;
    idle.current.returned(performance.now());
    state.onScratchEnd(); state.onLive(); setFollowingLive(true);
    setCenterToken(value => value + 1);
    if (state.playing) state.onLiveReturnSound?.();
  }, []);
  useEffect(() => {
    const release = (event: globalThis.PointerEvent) => idle.current.release(event.pointerId, performance.now());
    const releaseKey = (event: globalThis.KeyboardEvent) => idle.current.releaseKey(event.key, performance.now());
    const suspend = () => idle.current.releaseAll(performance.now());
    const timer = window.setInterval(() => {
      if (!idle.current.isAway) return;
      const state = latest.current;
      const enabled = state.mode === "live" && !!state.onLive && !!state.position && state.autoLiveEnabled !== false
        && !document.hidden && !!rootRef.current?.getClientRects().length;
      if (idle.current.shouldReturn(performance.now(), enabled, state.playing)) returnLive();
    }, LIVE_RETURN_CHECK_MS);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("keyup", releaseKey);
    window.addEventListener("blur", suspend);
    document.addEventListener("visibilitychange", suspend);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("keyup", releaseKey);
      window.removeEventListener("blur", suspend);
      document.removeEventListener("visibilitychange", suspend);
    };
  }, [returnLive]);
  const [touched, setTouched] = useState(false);
  const [viewPoint, setViewPoint] = useState<GeoPoint>({ latitude: 20, longitude: 135 });
  const demoTimer = useRef<number | null>(null);
  useEffect(() => () => { if (demoTimer.current !== null) window.clearTimeout(demoTimer.current); }, []);
  const infoRef = useRef<HTMLDialogElement>(null);
  const landscape = LANDSCAPES[props.features.earthProfile];
  const source = EARTH_SOUND_SOURCES[props.features.earthProfile];
  const motif = motifInstrument(props.features.earthProfile);
  const bpm = props.runtime?.bpm ?? (props.tempo.mode === "manual" ? props.tempo.manualBpm : null);
  const local = props.mode === "local";
  const followingSatellite = followingLive && !props.explore && !local;
  const followLabel = followingSatellite ? "てんこう2を追従中…" : "てんこう2に帰還";
  const loaded = props.ready;
  const rhythmResting = props.listeningMode === "ambient" && props.features.source !== "audition";
  const coordinates = props.explore ? props.explore.point : props.position;
  const coordinateText = (point: GeoPoint) => `${Math.abs(point.latitude).toFixed(2)}°${point.latitude >= 0 ? "N" : "S"} / ${Math.abs(point.longitude).toFixed(2)}°${point.longitude >= 0 ? "E" : "W"}`;
  const scratch = (velocity: number, strength = 1) => { props.onScratch(velocity, strength); if (props.playing && Math.abs(velocity) > .05) setTouched(true); };

  const demoScratch = () => {
    props.onScratchStart(); scratch(.85);
    if (demoTimer.current !== null) window.clearTimeout(demoTimer.current);
    demoTimer.current = window.setTimeout(() => scratch(-.65), 140);
  };
  return <main ref={rootRef} className={`groove-v2 ${props.playing ? "is-playing" : ""}`}
    onPointerDownCapture={event => idle.current.hold(event.pointerId, performance.now())}
    onPointerUpCapture={event => idle.current.release(event.pointerId, performance.now())}
    onPointerCancelCapture={event => idle.current.release(event.pointerId, performance.now())}
    onKeyDownCapture={event => {
      const now = performance.now(); idle.current.touch(now);
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) idle.current.holdKey(event.key, now);
    }}
    onWheelCapture={() => idle.current.touch(performance.now())}
    onInputCapture={() => idle.current.touch(performance.now())}>
    <header className="v2-header">
      <a href={appPath("/")} className="v2-brand" aria-label="EARTH GROOVE V2 ホーム">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={appPath("/earth-groove-logo.svg")} alt="EARTH GROOVE" />
        <span>VOL. 02</span>
      </a>
      <div className="v2-view-space" aria-hidden="true" />
      <div className="v2-header-right"><div className="v2-mission-brand"><MissionMark /><small>N.U COSMIC CAMPUS</small></div><button type="button" className="v2-icon-button" aria-label="この作品について" onClick={() => infoRef.current?.showModal()}><Info size={19} /></button></div>
    </header>

    <section className="v2-listening-room" aria-label="地球のレコードプレイヤー">
      <div className="v2-record-side">
        <div className="v2-record-topline"><span>EARTH SIDE / {local ? "LOCAL COLLECTION" : props.explore ? "EXPLORE" : "TEN-KOH 2"}</span><div className="v2-globe-options">{!local && <button type="button" aria-pressed={clouds} onClick={()=>props.onClouds?.(!clouds)} title="NASA観測画像の白い領域を薄く重ねます。雪や氷も含みます。音は変わりません。"><Cloud size={13}/> CLOUDS {clouds?"ON":"OFF"}</button>}</div></div>
        <RecordGlobe clouds={clouds && !local} cloudImageRef={props.cloudImageRef} position={local ? null : props.position} track={local ? undefined : props.track} playing={props.playing} centerToken={centerToken} followPosition={!local && followingLive} onViewInteraction={leaveLive} onScratch={scratch} onScratchWave={scratchWave} listeningPoint={props.explore?.point} onViewChange={setViewPoint} canExplore={!!props.onExplore} onScratchStart={props.onScratchStart} onScratchRelease={props.onScratchRelease} onScratchEnd={props.onScratchEnd} />
        <div className="v2-touch-controls"><div>
          {props.onExplore && <button type="button" className="v2-listen-here" onClick={() => { leaveLive(false); props.onExplore?.(viewPoint); }}>＋ ここを聴く</button>}

          <span className="v2-scratch-source">{props.playing ? props.scratchReady ? "ROTATE + SCRATCH / LIVE SOUND" : "ROTATE + SCRATCH / PREVIEW" : "回転させて地球を眺める"}</span>
        </div><p>{props.onExplore ? "地球を回すと音もスクラッチ。中央の土地は『ここを聴く』で演奏できます。" : "地球を回す動きで音をスクラッチ。LOCALの演奏は合成風景です。"}</p></div>
        <div className="v2-globe-tools"><p>{props.onExplore ? `CENTRE  ${coordinateText(viewPoint)}` : "そのまま聴く。ときどき、地球を回して音に触れる。"}</p><button type="button" className="v2-live-follow" data-following={followingSatellite} disabled={!props.position || local} onClick={returnLive} aria-label={followLabel} title={followLabel}><LocateFixed size={14} aria-hidden="true" /><MissionMark decorative /><span>{followingSatellite ? "追従中…" : "に帰還"}</span></button></div>
      </div>

      <aside className="v2-track-side" aria-label="いま聴いている風景">
        <div className="v2-mode-row"><span className={`v2-signal ${loaded ? "is-ready" : ""}`} /><span>{local ? "LOCAL / SHUFFLE" : props.explore ? "EXPLORE / SELECTED LAND" : "LIVE / ORBIT-DRIVEN"}</span><span className="v2-edition">02</span></div>
        <div className="v2-track-title"><p className="v2-eyebrow">{props.playing ? "NOW PLAYING" : loaded ? "READY TO LISTEN" : !local && props.position ? "POSITION READY / IMAGE PENDING" : "CONNECTING TO EARTH"}</p><h1>{loaded ? landscape.name : !local && props.position ? "Reading\nEarth." : "Finding\nour groove."}</h1><p>{loaded ? landscape.japanese : !local && props.position ? "衛星の位置は取得済み · 地表データ待ち" : "地球を聴く準備をしています"}<span> / {loaded ? landscape.code : "—"}</span></p></div>
        <div className="v2-track-credit"><span className="v2-cover-mark" aria-hidden="true"><AudioLines size={23} /></span><div><strong>{loaded ? motif : "EARTH GROOVE"}</strong><span>{loaded ? `with ${landscape.natural.toLowerCase()}` : "A continuous record of our planet"}</span></div></div>
        <div className="v2-condition-line">
          <span><Cloud size={15} /> {loaded ? `${Math.round(props.features.cloud * 100)}%` : "—"}<small>CLOUD</small></span>
          <span><Wind size={15} /> {loaded && props.features.wind !== null ? `${props.features.wind.toFixed(1)}` : "—"}<small>m/s</small></span>
          <span>{loaded ? props.features.tonality === "major" ? "MAJOR" : "MINOR" : "—"}<small>{loaded ? props.features.tonality === "major" ? "長調" : "短調" : "調"}</small></span>
        </div>
        <div className="v2-mix-choice"><span className="v2-eyebrow">LISTENING STYLE</span><div role="group" aria-label="音のスタイル"><button type="button" aria-pressed={props.listeningMode === "ambient"} onClick={event => { if (props.listeningMode === "ambient") return; props.onListeningMode("ambient"); styleFeedback("ambient", event.currentTarget); }}>AMBIENT</button><button type="button" aria-pressed={props.listeningMode === "groove"} onClick={event => { if (props.listeningMode === "groove") return; props.onListeningMode("groove"); styleFeedback("groove", event.currentTarget); }}>GROOVE</button></div><p>{props.listeningMode === "ambient" ? "自然音に、ゆっくりほどける旋律。" : "地球の風景に、穏やかなビートを。"}</p></div>
        <section className="v2-deck" aria-label="再生コントロール">
      <div className="v2-play-group"><button className="v2-play-button" type="button" aria-label={props.playing ? "演奏を一時停止" : "地球を聴く"} aria-pressed={props.playing} disabled={!loaded && !props.playing} onClick={props.onToggle}>{props.playing ? <Pause size={23} fill="currentColor" /> : <Play size={23} fill="currentColor" />}</button><div><strong>{props.playing ? "Let the Earth play." : "Press play. Stay a while."}</strong><span role="status">{props.status}</span></div></div>
      <div className="v2-tempo"><div><span className="v2-eyebrow">TEMPO</span><strong>{bpm?.toFixed(0) ?? "—"}<small>BPM</small></strong></div><button type="button" aria-pressed={props.tempo.mode === "auto"} onClick={() => props.onTempo({ ...props.tempo, mode: props.tempo.mode === "auto" ? "manual" : "auto" })}>{props.tempo.mode === "auto" ? "AUTO / WIND" : "MANUAL"}</button></div>
      <label className="v2-volume"><Volume2 size={17} /><span className="v2-sr-only">音量</span><input type="range" min="0" max="100" value={props.volume} style={{"--range-fill":`${props.volume}%`} as CSSProperties} onChange={event => props.onVolume(Number(event.target.value))} /><output>{props.volume}</output></label>
      <details className="v2-settings"><summary aria-label="再生設定"><SlidersHorizontal size={18} /><span>SETTINGS</span></summary><div className="v2-settings-panel"><label htmlFor="v2-manual-tempo">手動BPM <output>{props.tempo.manualBpm}</output></label><input id="v2-manual-tempo" type="range" min="80" max="150" value={props.tempo.manualBpm} disabled={props.tempo.mode !== "manual"} onChange={event => props.onTempo({ mode: "manual", manualBpm: Number(event.target.value) })} /><p>AUTOは風速0〜20 m/sで、{props.listeningMode.toUpperCase()}は80〜{AUTO_BPM_MAX[props.listeningMode]} BPM。手動は80〜150 BPM。</p><label htmlFor="v2-nature-level">自然音の音量 <output>{props.natureLevel}</output></label><input id="v2-nature-level" type="range" min="0" max="100" value={props.natureLevel} onChange={event => props.onNatureLevel(Number(event.target.value))} /><p>旋律と和音の音量はそのまま、波や葉音だけ調整します。</p><button type="button" disabled={!props.playing} onClick={demoScratch}>スクラッチを試す</button><small>{touched ? "鳴っている音を、手の速度に合わせて連続して前後にこすります。非対応端末では合成音でプレビューします。" : "再生中、地球を回すと音も一緒にスクラッチします。"}</small>{props.onNext && <button type="button" onClick={props.onNext}>次の合成風景へ</button>}</div></details>
    </section>

    {(props.needsReconnect || (!loaded && props.onRetry)) && <div className="v2-recovery" role="status"><span>{props.needsReconnect ? "音声が待機しています。再接続すると演奏を再開します。" : props.status}</span><button type="button" onClick={props.needsReconnect ? props.onReconnect : props.onRetry}><RotateCcw size={14} />{props.needsReconnect ? "音声を再接続" : "データを再取得"}</button></div>}
        <div className="v2-voice-strip" aria-label="演奏する4つのパート">{LAYERS.map(layer => {
          const resting = layer === "pulse" && rhythmResting;
          return <div key={layer} className={resting ? "is-resting" : undefined} style={{ "--voice-color": COLORS[layer] } as CSSProperties}
            title={resting ? "AMBIENTでは拍を休止します。GROOVEでリズムを演奏できます。" : undefined}>
            <span>{LAYER_NAMES[layer]}{resting && <small>REST</small>}</span>
            <meter min="0" max="1" value={props.playing && !resting ? Math.min(1, props.levels[layer]) : 0} aria-label={`${LAYER_NAMES[layer]}の発音`}
              aria-valuetext={resting ? "AMBIENTではリズムを休止中。GROOVEで演奏します。" : undefined} />
          </div>;
        })}</div>
        <p className="v2-source-note">{local ? "保存した合成風景を使います。衛星の現在位置・実際の気象とは連動しません。" : props.explore ? "自分で選んだ地点の画像と気象を音楽に。衛星の現在位置とは独立しています。" : "てんこう2の推定位置から、地表画像と気象を音楽に。"}</p>
      </aside>
    </section>

    <footer className="v2-footer"><div><Radio size={14} /><span>{local ? "OFFLINE COLLECTION · SYNTHETIC LANDSCAPES" : coordinates ? `${coordinateText(coordinates)} · ${props.explore ? "SELECTED LISTENING POINT" : "ESTIMATED SATELLITE POSITION"}` : props.explore ? "READING SELECTED LANDSCAPE" : "TEN-KOH 2 / NORAD 68261"}</span></div><nav aria-label="データモード">{props.onLive ? <button type="button" aria-pressed={!props.explore} onClick={returnLive}>LIVE</button> : <a href={appPath("/")}>LIVE</a>}<a href={appPath("/local/")} aria-current={local ? "page" : undefined}>LOCAL</a>{process.env.NODE_ENV === "development" && <a href="http://127.0.0.1:3301/">SERVER ↗</a>}</nav></footer>

    <dialog ref={infoRef} className="v2-about" aria-labelledby="v2-about-title"><button type="button" aria-label="説明を閉じる" className="v2-about-close" onClick={() => infoRef.current?.close()}><X size={21} /></button><p className="v2-eyebrow">EARTH GROOVE / VOL. 02</p><h2 id="v2-about-title">地球をレコードに、<br />衛星を針に。</h2><p>流れ続ける音楽を聴き、ときどき、その音に触れる。地表の風景で音色、雲で長短調、風で速さが変わります。</p><p>地球をドラッグすると、地球儀が回りながら直前の約2秒の音をスクラッチします。『ここを聴く』で中央の土地を選ぶとEXPLOREに切り替わり、その地点の風景から音楽を作ります。「てんこう2に帰還」で衛星の現在位置へ戻ります。操作中は通常の演奏を消し、スクラッチ音だけを聴かせます。手を離すと慣性に合わせて音が変化し、止まり切る前から通常の演奏へ溶けて戻ります。LIVEの再生中は、地球儀から手を離すと待たずに帰還を始めます。強く回した時は回転の向きと勢いを引き継ぎ、減速しながら衛星の現在位置へ合流します。停止中や「ここを聴く」で選んだ土地は、{LIVE_RETURN_IDLE_MS / 1_000}秒操作がないと自動で戻り、追従を再開します。音声処理に非対応の端末では合成音のプレビューになります。</p><p>軌道は取得した衛星高度で地表から離して描いています。CLOUDSはNASA観測画像の明るく白い領域を抽出した表示で、雪・氷も含みます。表示のON/OFFは演奏に影響しません。</p><p>衛星の位置は公開軌道から推定。地表画像はNASAの観測、気象は地表のモデルデータです。この音楽は地上で生成しており、衛星から直接受信した音ではありません。</p>{!local && <p>地表画像の観測日：{props.observation ?? "未取得"}<br />気象モデル時刻：{props.weatherTime ?? "未取得"}</p>}<p>自然音：<a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.label} / {source.creator} · CC0 ↗</a></p><button type="button" className="v2-inspect-link" onClick={() => { infoRef.current?.close(); props.onInspect(); }}>データと音の仕組みを見る <ArrowUpRight size={16} /></button></dialog>
  </main>;
}
