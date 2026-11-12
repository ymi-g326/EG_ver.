"use client";

import { appPath } from "@/lib/app-path";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Info, Play, Pause, Volume2, Radio } from "lucide-react";
import InspectPanels, { type InspectDataProps } from "@/components/inspect-panels";
import { WORLD_LAND_PATH } from "@/lib/world-map";
import MissionMark from "@/components/mission-mark";
import type { AudioFeatures, AudioDiagnostics, AudioLayer, ListeningMode } from "@/lib/audio-engine";
import type { GeoPoint } from "@/lib/globe-geometry";
import type { TempoRuntime, TempoSettings } from "@/lib/audio-tempo";
import { useOrbitInspection } from "@/hooks/use-orbit-inspection";
import { DEFAULT_REFERENCE_SITE, visibilityBoundary, type ReferenceSite } from "@/lib/orbit-inspection";
import { geographicPath, mapPoint, mapWindow } from "@/lib/inspect-map";
import { utcTime, type InspectPosition } from "@/lib/inspect-data";

type Props = InspectDataProps & {
  active: boolean; orbitPaths?: {past:string;future:string}; contourRef?: RefObject<HTMLCanvasElement|null>;
  clouds?: boolean; onClouds?: (enabled:boolean) => void;
  features: AudioFeatures; point: GeoPoint | null; satellite?: GeoPoint | null;
  mode: "live" | "explore" | "local" | "audition"; playing: boolean; ready: boolean;
  levels: Record<AudioLayer, number>; listeningMode: ListeningMode; runtime: TempoRuntime | null;
  volume: number; pending?: boolean; observation?: string; orbitEpoch?: string; weatherTime?: string | null;
  onToggle: () => void; onVolume: (value: number) => void;
  onListeningMode?: (mode: ListeningMode) => void;
  tempo?: TempoSettings; onTempo?: (settings: TempoSettings) => void;
  readDiagnostics: () => AudioDiagnostics | null;
  track?: { past: InspectPosition[]; future: InspectPosition[] };
};
const names = { ocean: "Open ocean", vegetated: "Vegetated land", arid: "Arid land", mixed: "Mixed terrain", cloud: "Cloud cover" };
const xy = (p: GeoPoint) => ({x:(p.longitude+180)/3.6,y:(90-p.latitude)/1.8});
const num = (n: number | null | undefined, digits=1) => n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits);
export default function InspectPlayer(p: Props) {
  const {active,readDiagnostics,contourRef}=p;
  const contourCopy = useRef<HTMLCanvasElement>(null);
  const [diagnostics,setDiagnostics]=useState<AudioDiagnostics|null>(null);
  const [site, setSite] = useState<ReferenceSite>({ ...DEFAULT_REFERENCE_SITE });
  const inspection = useOrbitInspection(p.orbit, site, active);
  const [layers, setLayers] = useState({ grid: true, orbit: true, equator: true, coverage: false, texture: false });
  const [mapView, setMapView] = useState({ zoom: 1, center: { latitude: 0, longitude: 0 } });
  const pan = useRef<{ id: number; x: number; y: number; center: GeoPoint } | null>(null);
  const mapBounds = mapWindow(mapView.zoom, mapView.center);
  const sitePoint = mapPoint(site);
  const coverage = p.satelliteState ? geographicPath(visibilityBoundary(p.satelliteState, p.satelliteState.altitude, site.minimumElevation)) : "";
  const zoom = (value: number) => setMapView(current => ({ zoom: Math.max(1, Math.min(4, value)), center: current.zoom === 1 && value > 1 ? p.satellite ?? current.center : current.center }));
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
  return <main className="groove-v2 v2-inspect" aria-label="地球の音を調べる">
    <header className="v2-header">
      <a className="v2-brand" href={appPath("/")} aria-label="EARTH GROOVE V2 ホーム">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={appPath("/earth-groove-logo.svg")} alt="EARTH GROOVE"/><span>VOL. 02</span>
      </a>
      <div className="v2-view-space" aria-hidden="true" />
      <div className="v2-header-right"><div className="v2-mission-brand"><MissionMark /><small>N.U COSMIC CAMPUS</small></div><details className="v2-inspect-info"><summary aria-label="データについて"><Info size={19}/></summary><div><strong>ONE EARTH. TWO VIEWS.</strong><p>TOUCHと同じデータ・同じ演奏です。</p><p>位置は公開軌道から推定。画像はNASAの観測、気象は地表のモデルです。衛星からの直接受信ではありません。</p><p>EXPLOREは選択地点、LOCALとAUDITIONは合成条件を表示します。</p><small>TLE {p.orbitEpoch?.slice(0,10)??"—"}<br/>IMAGE {p.observation??"—"}<br/>WEATHER {p.weatherTime??"—"}</small></div></details></div>
    </header>
    <section className="v2-inspect-grid">
      <section className="v2-inspect-earth" aria-label="演奏地点">
        <div className="v2-mode-row"><i className={`v2-signal ${p.ready?'is-ready':''}`}/>{p.pending?"HOLD":p.mode.toUpperCase()} / {p.mode==='local'||p.mode==='audition'?'SYNTHETIC':'EARTH DATA'}<span className="v2-edition">01</span></div>
        <div className="v2-inspect-map-heading"><h1>{known?names[f.earthProfile]:"Finding Earth."}</h1></div>
        <div className="v2-map-controls" aria-label="地図の表示レイヤー">{([
          ["grid","GRID"],["equator","EQ 0°"],["orbit","TRACK"],["coverage",`${site.minimumElevation}° MASK`],["texture","TEXTURE"],
        ] as const).map(([key,label])=><button key={key} type="button" aria-pressed={layers[key]} disabled={key==="texture"&&!p.observation} onClick={()=>setLayers(current=>({...current,[key]:!current[key]}))}>{label}</button>)}</div>
        <div className="v2-map-navigation" aria-label="地図の拡大と中心"><label className="v2-map-zoom"><span>ZOOM</span><input type="range" min="1" max="4" step="0.1" value={mapBounds.scale} aria-label="地図の拡大率" aria-valuetext={`${mapBounds.scale.toFixed(1)}倍`} style={{"--map-zoom-fill":`${(mapBounds.scale-1)/3*100}%`} as CSSProperties} onChange={event=>zoom(Number(event.target.value))}/><output>×{mapBounds.scale.toFixed(1)}</output></label><button type="button" onClick={()=>setMapView({zoom:1,center:{latitude:0,longitude:0}})}>WORLD</button><button type="button" disabled={!p.satellite} onClick={()=>{if(p.satellite)setMapView({zoom:3,center:p.satellite});}}>SAT</button><button type="button" onClick={()=>setMapView({zoom:3,center:site})}>REF</button></div>
        <div className="v2-inspect-map-frame"><div className="v2-map-longitudes" aria-label="経度目盛り">{mapBounds.longitudes.map((n,i)=><span key={i}>{num(n,0)}°</span>)}</div><div className="v2-map-latitudes" aria-label="緯度目盛り">{mapBounds.latitudes.map((n,i)=><span key={i}>{num(n,0)}°</span>)}</div><div className="v2-inspect-map" title="拡大中はドラッグで移動。ダブルクリックで参照地点を指定。演奏地点は変わりません。"
          onPointerDown={event=>{if(mapBounds.scale<=1||pan.current)return;pan.current={id:event.pointerId,x:event.clientX,y:event.clientY,center:mapBounds.center};event.currentTarget.setPointerCapture(event.pointerId);}}
          onPointerMove={event=>{const start=pan.current;if(!start||start.id!==event.pointerId)return;const rect=event.currentTarget.getBoundingClientRect();setMapView(current=>({...current,center:{longitude:Math.max(-180,Math.min(180,start.center.longitude-(event.clientX-start.x)/rect.width*360/mapBounds.scale)),latitude:Math.max(-90,Math.min(90,start.center.latitude+(event.clientY-start.y)/rect.height*180/mapBounds.scale))}}));}}
          onPointerUp={event=>{pan.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
          onPointerCancel={()=>{pan.current=null;}}
          onDoubleClick={event=>{const rect=event.currentTarget.getBoundingClientRect();setSite(current=>({...current,heightKm:0,latitude:90-(mapBounds.y+(event.clientY-rect.top)/rect.height*mapBounds.size)*1.8,longitude:(mapBounds.x+(event.clientX-rect.left)/rect.width*mapBounds.size)*3.6-180}));}}>
          <canvas ref={contourCopy} className="v2-map-contour" hidden={!layers.texture} aria-hidden="true" style={{width:`${100*mapBounds.scale}%`,height:`${100*mapBounds.scale}%`,left:`${-mapBounds.x*mapBounds.scale}%`,top:`${-mapBounds.y*mapBounds.scale}%`,right:"auto",bottom:"auto"}}/>
          <svg viewBox={`${mapBounds.x} ${mapBounds.y} ${mapBounds.size} ${mapBounds.size}`} preserveAspectRatio="none" role="img" aria-label={p.point?`演奏地点 ${num(p.point.latitude,2)}, ${num(p.point.longitude,2)}`:'合成風景・実際の演奏地点なし'}>
          {layers.grid&&<g>{[16.67,33.33,50,66.67,83.33].map(n=><path key={`lon${n}`} d={`M${n} 0V100`} className="v2-map-grid"/>)}{[25,50,75].map(n=><path key={`lat${n}`} d={`M0 ${n}H100`} className="v2-map-grid"/>)}</g>}
          <path d={WORLD_LAND_PATH} className="v2-map-land"/>
          {layers.equator&&<path d="M0 50H100" className="v2-map-equator"/>}
          {layers.coverage&&coverage&&<path d={coverage} className="v2-map-coverage"/>}
          {layers.orbit&&p.orbitPaths&&<g className="v2-map-orbit"><path d={p.orbitPaths.past} className="v2-map-orbit-past"/><path d={p.orbitPaths.future} className="v2-map-orbit-future"/>
            {p.track?.future.filter((_,i)=>(i+1)%60===0).map(tick=>{const at=xy(tick);return <g key={tick.timestamp} className="v2-map-time-tick"><circle cx={at.x} cy={at.y} r={.3/mapBounds.scale}/><text x={at.x+1/mapBounds.scale} y={at.y-1/mapBounds.scale} fontSize={1.6/mapBounds.scale}>{new Date(tick.timestamp).toISOString().slice(11,16)}</text></g>;})}
          </g>}
          {satellite&&<circle cx={satellite.x} cy={satellite.y} r={.75/mapBounds.scale} className="v2-map-satellite"/>}
          {point&&<g transform={`translate(${point.x} ${point.y}) scale(${1/mapBounds.scale})`} className="v2-map-point"><circle r="2"/><circle r=".5"/><path d="M-4 0H-2M2 0H4M0 -4V-2M0 2V4"/></g>}
          <g transform={`translate(${sitePoint.x} ${sitePoint.y}) scale(${1/mapBounds.scale})`} className="v2-map-reference-site"><path d="M-1 1L0 -1L1 1Z"/><text x="1.5" y="0" fontSize="1.7">REF</text></g>
        </svg><span>{p.mode==='local'||p.mode==='audition'?'SYNTHETIC LANDSCAPE':p.pending?'PLAYING / DATA PENDING':p.mode==='explore'?'SELECTED LAND':'TEN-KOH 2 / ORBIT'}</span></div></div>
        <div className="v2-inspect-map-key"><span><i/>COASTLINE</span>{layers.equator&&<span className="v2-equator-key">— EQUATOR 0°</span>}{layers.orbit&&p.orbitPaths&&<><span><i/>PAST</span><span><i/>PREDICTED</span></>}{layers.coverage&&<span>GEOMETRIC MASK · APPROX.</span>}</div>
        <div className="v2-map-status">{utcTime(p.satelliteState?.timestamp)} · SGP4 / ESTIMATED</div>
        <div className="v2-inspect-coordinates"><span>{p.point?`${num(p.point.latitude,2)}° LAT`:'— LAT'}</span><span>{p.point?`${num(p.point.longitude,2)}° LON`:'— LON'}</span></div>
        <div className="v2-inspect-terrain"><span>EST. SEA <b>{num((1-(f.landFraction??(f.earthProfile==='ocean'?0:1)))*100,0)}%</b></span><div><i style={{width:`${(f.landFraction??(f.earthProfile==='ocean'?0:1))*100}%`}}/></div><span>EST. LAND <b>{num((f.landFraction??(f.earthProfile==='ocean'?0:1))*100,0)}%</b></span></div>
      </section>
      <InspectPanels {...p} diagnostics={diagnostics} site={site} onSite={setSite} inspection={inspection} />
    </section>
    <footer className="v2-inspect-footer"><button className="v2-play-button" type="button" onClick={p.onToggle} disabled={!p.ready&&!p.playing} aria-label={p.playing?'演奏を一時停止':'地球を聴く'}>{p.playing?<Pause size={20}/>:<Play size={20}/>}</button><span className="v2-eyebrow">{p.playing?'NOW PLAYING':p.ready?'READY':'CONNECTING'} · {p.listeningMode.toUpperCase()}</span>{p.onListeningMode&&<div className="v2-inspect-style" role="group" aria-label="音のスタイル">{(["ambient","groove"] as const).map(mode=><button key={mode} type="button" aria-pressed={p.listeningMode===mode} onClick={()=>p.onListeningMode?.(mode)}>{mode.toUpperCase()}</button>)}</div>}{p.tempo&&p.onTempo&&<details className="v2-inspect-tempo"><summary>{num(p.runtime?.bpm,0)} BPM · {p.tempo.mode.toUpperCase()}</summary><div><button type="button" aria-pressed={p.tempo.mode==='auto'} onClick={()=>p.onTempo?.({...p.tempo!,mode:p.tempo!.mode==='auto'?'manual':'auto'})}>{p.tempo.mode==='auto'?'AUTO / WIND':'MANUAL'}</button><label>手動BPM <input aria-label="手動BPM" type="range" min="80" max="150" value={p.tempo.manualBpm} disabled={p.tempo.mode!=='manual'} onChange={e=>p.onTempo?.({mode:'manual',manualBpm:Number(e.target.value)})}/><output>{p.tempo.manualBpm}</output></label></div></details>}<label className="v2-volume"><Volume2 size={16}/><span className="v2-sr-only">音量</span><input type="range" min="0" max="100" value={p.volume} style={{"--range-fill":`${p.volume}%`} as CSSProperties} onChange={e=>p.onVolume(Number(e.target.value))}/><output>{p.volume}</output></label><span className="v2-inspect-output"><Radio size={13}/>{num(diagnostics?.outputDb)} dBFS</span></footer>
  </main>;
}
