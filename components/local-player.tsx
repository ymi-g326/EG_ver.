"use client";

import Link from "next/link";
import { VoiceMeter } from "@/lib/voice-meter";
import PlayerViews from "@/components/player-views";
import InspectPlayer from "@/components/inspect-player";
import GroovePlayer from "@/components/groove-player";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { EarthAudioEngine, EARTH_SOUND_SOURCES, type ListeningMode, type AudioDiagnostics, type AudioFeatures, type AudioLayer } from "@/lib/audio-engine";
import { DEFAULT_TEMPO, type TempoSettings } from "@/lib/audio-tempo";
import { LocalJourney, localFeatures, sceneRemaining, type LocalScene } from "@/lib/local-journey";
import { motifInstrument } from "@/lib/theme-voice";
import { WORLD_LAND_PATH } from "@/lib/world-map";
import TempoControls from "@/components/tempo-controls";

const COLORS: Record<string, string> = { ocean: "#479bff", vegetated: "#53d682", arid: "#e8b149", mixed: "#be97ff" };
const LAYERS: AudioLayer[] = ["motif", "pad", "bass", "pulse"];
const INITIAL_FEATURES = localFeatures("forest-clear");
const EMPTY_LEVELS = { motif: 0, pad: 0, bass: 0, pulse: 0 };
const elapsedText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export default function LocalPlayer() {
  const [natureLevel, setNatureLevel] = useState(45);
  const [detailView, setDetailView] = useState(false);
  const [listeningMode, setListeningMode] = useState<ListeningMode>("ambient");
  const engineRef = useRef<EarthAudioEngine | null>(null);
  const journeyRef = useRef<LocalJourney | null>(null);
  const featuresRef = useRef<AudioFeatures>(INITIAL_FEATURES);
  const currentRef = useRef<LocalScene | null>(null);
  const pendingRef = useRef<LocalScene | null>(null);
  const startedAt = useRef(0);
  const levelsRef = useRef(new VoiceMeter());
  const [scene, setScene] = useState<LocalScene | null>(null);
  const [pending, setPending] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [diagnostics, setDiagnostics] = useState<AudioDiagnostics | null>(null);
  const [levels, setLevels] = useState({ ...EMPTY_LEVELS });
  const [history, setHistory] = useState<LocalScene[]>([]);
  const [tempo, setTempo] = useState<TempoSettings>({ ...DEFAULT_TEMPO });
  const [volume, setVolume] = useState(72);
  const [error, setError] = useState("");

  const applyScene = useCallback((next: LocalScene) => {
    featuresRef.current = next.features;
    currentRef.current = next;
    pendingRef.current = null;
    startedAt.current = engineRef.current?.getPlaybackSeconds() ?? 0;
    setScene(next); setPending(false); setRemaining(next.durationSeconds);
    setHistory(previous => [...previous, next].slice(-16));
  }, []);

  const requestNext = useCallback(() => {
    if (!journeyRef.current || pendingRef.current || !engineRef.current) return;
    const next = journeyRef.current.next();
    pendingRef.current = next;
    setPending(true);
    engineRef.current.queueSceneChange(() => applyScene(next));
  }, [applyScene]);

  useEffect(() => {
    // This page imports local presets and assets only. No live-data components mount.
    const journey = new LocalJourney();
    journeyRef.current = journey;
    const engine = new EarthAudioEngine(() => featuresRef.current, ({ layer, level }) => {
      levelsRef.current.push(layer, level, "listening");
    }, true);
    engine.setListeningMode("ambient");
    engineRef.current = engine;
    pendingRef.current = null;
    currentRef.current = null;
    levelsRef.current.clear();
    // Choose the random opening after hydration; cancel on Strict Mode cleanup.
    const initial = window.setTimeout(() => {
      setHistory([]); setPlaying(false); setDiagnostics(null); setError("");
      applyScene(journey.next());
    }, 0);
    let lastRead = performance.now();
    const timer = window.setInterval(() => {
      const status = engine.getDiagnostics();
      setDiagnostics(status);
      const current = currentRef.current;
      if (current) {
        const left = sceneRemaining(current, engine.getPlaybackSeconds(), startedAt.current);
        setRemaining(left);
        if (status?.playing && left <= 0) requestNext();
      }
      const now = performance.now();
      setLevels(levelsRef.current.read(now - lastRead));
      lastRead = now;
    }, 100);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      engine.destroy();
      engineRef.current = null;
      journeyRef.current = null;
    };
  }, [applyScene, requestNext]);

  const togglePlayback = () => {
    const engine = engineRef.current;
    if (!engine || !scene) return;
    if (playing) {
      engine.stop();
      // If the operator pauses while waiting for a bar, prepare that scene now.
      const next = pendingRef.current;
      if (next) engine.queueSceneChange(() => applyScene(next));
      levelsRef.current.clear();
      setLevels({ ...EMPTY_LEVELS });
      setPlaying(false);
    } else {
      try { engine.start(); setError(""); setPlaying(true); }
      catch { setError("音声を開始できませんでした。もう一度「演奏を開始」を押してください。"); }
    }
  };
  const readAudioDiagnostics = useCallback(() => engineRef.current?.getDiagnostics() ?? null, []);
  const changeTempo = (next: TempoSettings) => { setTempo(next); engineRef.current?.setTempo(next); };
  const active = scene?.features ?? INITIAL_FEATURES;
  const source = EARTH_SOUND_SOURCES[active.earthProfile];
  const color = COLORS[active.earthProfile] ?? COLORS.mixed;
  const needsResume = playing && diagnostics?.contextState !== "running";
  const sampleError = diagnostics?.samples.some(sample => sample.error);

  const changeListeningMode = (mode: ListeningMode) => {
    if (mode === listeningMode) return;
    engineRef.current?.listeningTransitionSound(mode);
    engineRef.current?.setListeningMode(mode); setListeningMode(mode);
  };
  const changeDetailView = (value:boolean) => {
    if(value===detailView)return;
    engineRef.current?.endScratch(); engineRef.current?.viewTransitionSound(value); setDetailView(value);
  };
  return <>
    <PlayerViews loading={!scene} inspect={detailView} onChange={changeDetailView} touch={<GroovePlayer mode="local" features={active} position={null} playing={playing} ready={!!scene} volume={volume} levels={levels} listeningMode={listeningMode}
      tempo={tempo} runtime={diagnostics?.tempo ?? null} status={error || (pending ? "次の小節から風景を切り替えます" : playing ? `合成風景をシャッフル演奏 · 次の風景まで約${Math.ceil(remaining)}秒` : "通信不要 · 保存した8つの合成風景を巡ります")}
      onToggle={togglePlayback} onVolume={value => { setVolume(value); engineRef.current?.setVolume(value / 100); }} onListeningMode={changeListeningMode} onTempo={changeTempo}
      onInspect={() => changeDetailView(true)} onScratch={(velocity, strength) => engineRef.current?.scratch(velocity, strength)}
      scratchReady={diagnostics?.scratch.ready ?? false} onScratchStart={held => engineRef.current?.beginScratch(held)} onScratchRelease={() => engineRef.current?.releaseScratch()} onScratchEnd={() => engineRef.current?.endScratch()}
      natureLevel={natureLevel} onNatureLevel={value => { setNatureLevel(value); engineRef.current?.setNatureLevel(value / 100); }} onNext={requestNext}
      needsReconnect={!!needsResume} onReconnect={() => { try { engineRef.current?.start(); setPlaying(true); setError(""); } catch { setError("音声を開始できませんでした。"); } }} />} inspection={
    <InspectPlayer features={active} point={null} mode="local" playing={playing} ready={!!scene}
      levels={levels} listeningMode={listeningMode} runtime={diagnostics?.tempo??null} volume={volume}
      onToggle={togglePlayback} onVolume={value=>{setVolume(value);engineRef.current?.setVolume(value/100);}} readDiagnostics={readAudioDiagnostics} active={detailView} />} />
    <div className="v2-detail-wrap" hidden><button type="button" className="v2-back-button" onClick={() => setDetailView(false)}>← TOUCH <span>再生画面へ戻る · 演奏はそのまま続きます</span></button>
    <main className={`local-player ${playing ? "is-playing" : ""}`} style={{ "--scene-color": color } as CSSProperties}>
    <header className="local-header">
      <div className="local-brands">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/earth-groove-logo.svg" alt="EARTH GROOVE" />
        <span aria-hidden="true">×</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/nucc-horizontal-light.svg" alt="N.U Cosmic Campus" />
      </div>
      <nav aria-label="演奏モード"><Link href="/" prefetch={false}>実環境モード</Link><Link href="/local" prefetch={false} aria-current="page">ローカルモード</Link></nav>
    </header>

    <section className="local-intro">
      <div><span className="local-eyebrow">LOCAL SOUND JOURNEY</span><h1>地球の風景を、巡る。</h1></div>
      <p><strong>通信不要 · ローカルモード</strong><br />保存した合成風景をシャッフル演奏します。衛星の現在位置・実際の気象とは連動しません。</p>
    </section>

    <section className="local-landscape" aria-label="演奏中の合成風景">
      <svg className="local-world" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={WORLD_LAND_PATH} /></svg>
      <div className="local-scene-heading">
        <span>合成風景 · {String(scene?.number ?? 0).padStart(2, "0")}</span>
        <h2>{scene?.label ?? "風景を準備しています"}</h2>
        <p>{motifInstrument(active.earthProfile)}<span>＋ {active.earthProfile === "ocean" ? "波音" : active.earthProfile === "vegetated" ? "葉音" : active.earthProfile === "arid" ? "乾いた風" : "石の打音"}</span></p>
      </div>
      <dl className="local-conditions">
        <div><dt>合成雲量</dt><dd>{Math.round(active.cloud * 100)}%</dd></div>
        <div><dt>調</dt><dd>{active.tonality === "major" ? "長調" : "短調"}</dd></div>
        <div><dt>合成風速</dt><dd>{active.wind?.toFixed(1)} <small>m/s</small></dd></div>
      </dl>
      <p className="local-reason">地表で楽器、雲で長短調、合成風速でAUTOの速さが変わります。</p>
    </section>

    <section className="local-transport" aria-label="ローカル演奏の操作">
      <div className="local-play-controls">
        <button className="local-play" type="button" disabled={!scene} aria-pressed={playing} onClick={togglePlayback}>{playing ? "一時停止" : "演奏を開始"}</button>
        <button type="button" onClick={requestNext} disabled={!scene || pending}>次の風景へ</button>
        <p className="local-progress" role="status">{pending ? "次の小節から風景を切り替えます" : playing ? `次の風景まで約 ${Math.ceil(remaining)} 秒` : (diagnostics?.transport.playedSeconds ?? 0) > 0 ? `一時停止中 · この風景の残り約 ${Math.ceil(remaining)} 秒` : "開始後は45〜90秒ごとに自動で切り替わります"}</p>
      </div>
      <TempoControls input={active} profile={listeningMode} settings={tempo} onChange={changeTempo} ready={!!scene} runtime={diagnostics?.tempo ?? null} playing={playing} />
      <div className="local-volume">
        <label htmlFor="local-volume">音量 <output>{volume}</output></label>
        <input id="local-volume" type="range" min="0" max="100" value={volume} onChange={event => { const value = Number(event.target.value); setVolume(value); engineRef.current?.setVolume(value / 100); }} />
        <small>一巡するまで重複せず、8つの風景を繰り返します。</small>
      </div>
    </section>

    {(error || needsResume || sampleError) && <div className="local-audio-notice" role="status">
      <p>{error || (needsResume ? "音声が待機しています。「音声を再接続」を押してください。" : "自然音を読み込めませんでした。合成した旋律で演奏を続けます。")}</p>
      <button type="button" onClick={() => { try { engineRef.current?.start(); setPlaying(true); setError(""); } catch { setError("音声を開始できませんでした。"); } }}>音声を再接続</button>
    </div>}

    <section className="local-voices" aria-label="演奏する4つの声">{LAYERS.map(layer => <div key={layer}><span>{layer.toUpperCase()}</span><meter min="0" max="1" value={levels[layer]} aria-label={`${layer}の発音`} /></div>)}</section>
    <section className="local-history" aria-label="巡った合成風景"><span>巡った風景</span><ol>{history.map(item => <li key={item.number} aria-current={item.number === scene?.number ? "step" : undefined} style={{ borderColor: COLORS[item.features.earthProfile] }}>{item.label}</li>)}</ol></section>
    <footer className="local-footer"><span>自然音：<a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.label} / {source.creator} · CC0</a></span><span>音源・地図・合成条件を端末内から読み込みます。</span></footer>

    {process.env.NODE_ENV === "development" && <details className="local-diagnostics"><summary>開発用 · 連続演奏の状態</summary>
      <p>AudioContext: {diagnostics?.contextState ?? "未作成"} / {diagnostics?.playing ? "再生中" : "停止中"} / 出力 {diagnostics?.outputDb?.toFixed(1) ?? "—"} dBFS</p>
      <dl><div><dt>再生時計</dt><dd>{elapsedText(diagnostics?.transport.playedSeconds ?? 0)}</dd></div><div><dt>場面転換</dt><dd>{diagnostics?.transport.sceneChanges ?? 0}</dd></div><div><dt>遅延からの復帰</dt><dd>{diagnostics?.transport.resyncs ?? 0}</dd></div><div><dt>発音中の音源 / キャッシュ</dt><dd>{diagnostics?.transport.activeSources ?? 0} / {diagnostics?.transport.themeBuffers ?? 0}</dd></div></dl>
      {diagnostics?.samples.map(sample => <p key={sample.profile}>自然音 {sample.profile}: {sample.ready ? "読み込み済み" : "読み込み待ち"} / {sample.paused ? "停止" : "再生"}{sample.error ? " / エラー" : ""}</p>)}
      <ol aria-label="ローカル発音ログ">{diagnostics?.events.slice(-8).reverse().map(event => <li key={event.id}>{event.layer.toUpperCase()} · {event.instrument ?? event.profile} · {event.bpm.toFixed(1)} BPM{event.duration ? ` · ${event.duration.toFixed(2)}秒` : ""}</li>)}</ol>
    </details>}
  </main></div></>;
}
