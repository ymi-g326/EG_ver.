"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { ArrowRight, Cloud, Wind, Mountain, AudioLines, Info, Play, Pause, Volume2, Radio } from "lucide-react";
import { VOICE_COLORS } from "@/lib/voice-colors";
import { WORLD_LAND_PATH } from "@/lib/world-map";
import { motifInstrument } from "@/lib/theme-voice";
import MissionMark from "@/components/mission-mark";
import type { AudioFeatures, AudioDiagnostics, AudioLayer, ListeningMode } from "@/lib/audio-engine";
import type { GeoPoint } from "@/lib/globe-geometry";
import type { TempoRuntime } from "@/lib/audio-tempo";

type Props = {
  active: boolean; orbitPaths?: {past:string;future:string}; contourRef?: RefObject<HTMLCanvasElement|null>;
  clouds?: boolean; onClouds?: (enabled:boolean) => void;
  features: AudioFeatures; point: GeoPoint | null; satellite?: GeoPoint | null;
  mode: "live" | "explore" | "local" | "audition"; playing: boolean; ready: boolean;
  levels: Record<AudioLayer, number>; listeningMode: ListeningMode; runtime: TempoRuntime | null;
  volume: number; pending?: boolean; observation?: string; orbitEpoch?: string; weatherTime?: string | null;
  onToggle: () => void; onVolume: (value: number) => void;
  readDiagnostics: () => AudioDiagnostics | null;
};
const names = { ocean: "Open ocean", vegetated: "Forest canopy", arid: "Dry earth", mixed: "Land & stone", cloud: "Cloud cover" };
const voices: [AudioLayer,string][] = [["motif","MELODY"],["pad","HARMONY"],["bass","LOW END"],["pulse","RHYTHM"]];
const xy = (p: GeoPoint) => ({x:(p.longitude+180)/3.6,y:(90-p.latitude)/1.8});
const num = (n: number | null | undefined, digits=1) => n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits);
export default function InspectPlayer(p: Props) {
  const {active,readDiagnostics,contourRef}=p;
  const contourCopy = useRef<HTMLCanvasElement>(null);
  const [diagnostics,setDiagnostics]=useState<AudioDiagnostics|null>(null);
  useEffect(()=>{if(!active)return;const timer=window.setInterval(()=>setDiagnostics(readDiagnostics()),200);return()=>window.clearInterval(timer);},[readDiagnostics,active]);
  useEffect(() => {
    if (!active || !contourRef) return;
    const copy = () => {
      const source = contourRef?.current, canvas = contourCopy.current;
      if (!source || !canvas || !source.width) return;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      canvas.width = source.width; canvas.height = source.height;
      ctx.drawImage(source, 0, 0);
    };
    copy(); const timer = window.setInterval(copy, 1000);
    return () => window.clearInterval(timer);
  }, [active,contourRef]);
  const f=p.features,point=p.point?xy(p.point):null,satellite=p.satellite?xy(p.satellite):null;
  const known=p.ready||p.playing;
  const rest=p.listeningMode==='ambient'&&f.source!=='audition';
  return <main className="groove-v2 v2-inspect" aria-label="地球の音を調べる">
    <header className="v2-header">
      <a className="v2-brand" href="/" aria-label="EARTH GROOVE V2 ホーム">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/earth-groove-logo.svg" alt="EARTH GROOVE"/><span>VOL. 02</span>
      </a>
      <div className="v2-view-space" aria-hidden="true" />
      <div className="v2-header-right"><div className="v2-mission-brand"><MissionMark /><small>N.U COSMIC CAMPUS</small></div><details className="v2-inspect-info"><summary aria-label="データについて"><Info size={19}/></summary><div><strong>ONE EARTH. TWO VIEWS.</strong><p>TOUCHと同じデータ・同じ演奏です。</p><p>位置は公開軌道から推定。画像はNASAの観測、気象は地表のモデルです。衛星からの直接受信ではありません。</p><p>EXPLOREは選択地点、LOCALとAUDITIONは合成条件を表示します。</p><small>TLE {p.orbitEpoch?.slice(0,10)??"—"}<br/>IMAGE {p.observation??"—"}<br/>WEATHER {p.weatherTime??"—"}</small></div></details></div>
    </header>
    <section className="v2-inspect-grid">
      <section className="v2-inspect-earth" aria-label="演奏地点">
        <div className="v2-mode-row"><i className={`v2-signal ${p.ready?'is-ready':''}`}/>{p.pending?"HOLD":p.mode.toUpperCase()} / {p.mode==='local'||p.mode==='audition'?'SYNTHETIC':'EARTH DATA'}<span className="v2-edition">01</span></div>
        <div className="v2-inspect-map-heading"><h1>{known?names[f.earthProfile]:"Finding Earth."}</h1>{p.onClouds&&<div className="v2-globe-options"><button type="button" aria-pressed={p.clouds} onClick={()=>p.onClouds?.(!p.clouds)} title="観測画像の雲・地表の細かな輪郭をON/OFFします。海岸線と軌道、音の条件は保ちます。"><Cloud size={13}/> CLOUDS {p.clouds?"ON":"OFF"}</button></div>}</div>
        <div className="v2-inspect-map-frame"><div className="v2-map-longitudes" aria-label="経度目盛り">{[-180,-120,-60,0,60,120,180].map(n=><span key={n}>{n}°</span>)}</div><div className="v2-map-latitudes" aria-label="緯度目盛り">{[90,45,0,-45,-90].map(n=><span key={n}>{n}°</span>)}</div><div className="v2-inspect-map"><canvas ref={contourCopy} className="v2-map-contour" hidden={p.clouds===false} aria-hidden="true"/><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={p.point?`演奏地点 ${num(p.point.latitude,2)}, ${num(p.point.longitude,2)}`:'合成風景・実際の演奏地点なし'}>
          {[16.67,33.33,50,66.67,83.33].map(n=><path key={n} d={`M${n} 0V100M0 ${n}H100`} className="v2-map-grid"/>)}
          <path d={WORLD_LAND_PATH} className="v2-map-land"/>
          {p.orbitPaths && <g className="v2-map-orbit"><path d={p.orbitPaths.past} className="v2-map-orbit-past"/><path d={p.orbitPaths.future} className="v2-map-orbit-future"/></g>}
          {satellite&&<g className="v2-map-scan"><path d={`M${satellite.x} 0V100M0 ${satellite.y}H100`}/><rect x={satellite.x-.83} y={satellite.y-1.67} width="1.66" height="3.34"/></g>}
          {satellite&&<circle cx={satellite.x} cy={satellite.y} r="1" className="v2-map-satellite"/>}
          {point&&<g transform={`translate(${point.x} ${point.y})`} className="v2-map-point"><circle r="3"/><circle r=".65"/><path d="M-5 0H-3M3 0H5M0 -5V-3M0 3V5"/></g>}
        </svg><span>{p.mode==='local'||p.mode==='audition'?'SYNTHETIC LANDSCAPE':p.pending?'PLAYING / DATA PENDING':p.mode==='explore'?'SELECTED LAND':'TEN-KOH 2 / ORBIT'}</span></div></div>
        <div className="v2-inspect-map-key"><span><i/>COASTLINE</span>{p.orbitPaths&&<><span><i/>PAST</span><span><i/>PREDICTED</span></>}{p.mode==='explore'&&<span>＋ SELECTED POINT</span>}</div>
        <div className="v2-inspect-coordinates"><span>{p.point?`${num(p.point.latitude,2)}° LAT`:'— LAT'}</span><span>{p.point?`${num(p.point.longitude,2)}° LON`:'— LON'}</span></div>
        <div className="v2-inspect-terrain"><span>SEA <b>{num((1-(f.landFraction??(f.earthProfile==='ocean'?0:1)))*100,0)}%</b></span><div><i style={{width:`${(f.landFraction??(f.earthProfile==='ocean'?0:1))*100}%`}}/></div><span>LAND <b>{num((f.landFraction??(f.earthProfile==='ocean'?0:1))*100,0)}%</b></span></div>
      </section>
      <section className="v2-inspect-sound" aria-label="データから音への対応">
        <div className="v2-mode-row">INPUT <ArrowRight size={14}/> SOUND<span className="v2-edition">02</span></div>
        <div className="v2-inspect-mapping"><Wind/><div><small>WIND</small><strong>{num(known?f.wind:null)}<em>m/s</em></strong></div><ArrowRight/><div><small>{p.runtime?.mode==='manual'?'MANUAL':'TEMPO'}</small><strong>{num(p.runtime?.bpm,0)}<em>BPM</em></strong></div></div>
        <div className="v2-inspect-mapping"><Cloud/><div><small>CLOUD</small><strong>{known?num(f.cloud*100,0):"—"}<em>%</em></strong></div><ArrowRight/><div><small>HARMONY</small><strong className="v2-inspect-word">{known?(f.tonality==='major'?'MAJOR':'MINOR'):'—'}</strong></div></div>
        <div className="v2-inspect-mapping"><Mountain/><div><small>RELIEF</small><strong>{num(known?f.terrainRange:null,0)}<em>m</em></strong></div><ArrowRight/><div><small>PHRASE</small><strong className="v2-inspect-word">{(f.terrainRelief??0)>.4?'LEAPS':'FLOW'}</strong></div></div>
        <div className="v2-inspect-instrument"><AudioLines size={22}/><div><small>SURFACE → INSTRUMENT</small><strong>{known?motifInstrument(f.earthProfile,f.motifStyle):"—"}</strong></div></div>
        <div className="v2-inspect-voices" aria-label="4パートの発音">{voices.map(([layer,name])=><div key={layer} style={{"--voice-color":VOICE_COLORS[layer]} as CSSProperties}><span><i/>{name}</span><meter min="0" max="1" value={p.playing&&!(layer==='pulse'&&rest)?p.levels[layer]:0} aria-label={`${name}の発音`}/><small>{layer==='pulse'&&rest?'REST':p.playing?'ACTIVE':'STANDBY'}</small></div>)}</div>
      </section>
    </section>
    <footer className="v2-inspect-footer"><button className="v2-play-button" type="button" onClick={p.onToggle} disabled={!p.ready&&!p.playing} aria-label={p.playing?'演奏を一時停止':'地球を聴く'}>{p.playing?<Pause size={20}/>:<Play size={20}/>}</button><span className="v2-eyebrow">{p.playing?'NOW PLAYING':p.ready?'READY':'CONNECTING'} · {p.listeningMode.toUpperCase()}</span><label className="v2-volume"><Volume2 size={16}/><span className="v2-sr-only">音量</span><input type="range" min="0" max="100" value={p.volume} style={{"--range-fill":`${p.volume}%`} as CSSProperties} onChange={e=>p.onVolume(Number(e.target.value))}/><output>{p.volume}</output></label><span className="v2-inspect-output"><Radio size={13}/>{num(diagnostics?.outputDb)} dBFS</span></footer>
  </main>;
}
