"use client";
import { motifInstrument } from "@/lib/theme-voice";
import { useState } from "react";
import { AUDITION_PRESETS } from "@/lib/audition-presets";
import type { AuditionModifiers } from "@/lib/audition-modifiers";
import { resolveTempo, type TempoSettings } from "@/lib/audio-tempo";
export default function DevAudition({ selected, playing, settings, modifiers, onSelect, onTogglePlayback, onTempoChange, onModifiers }: {
  selected:string|null; playing:boolean; settings:TempoSettings; modifiers:AuditionModifiers;
  onSelect:(id:string|null)=>void; onTogglePlayback:()=>void; onTempoChange:(settings:TempoSettings)=>void;
  onModifiers:(modifiers:AuditionModifiers,reset?:boolean)=>void;
}) {
  const [open,setOpen]=useState(false);
  const preset=AUDITION_PRESETS.find(p=>p.id===selected);
  const tempo=resolveTempo({wind:modifiers.wind},settings);
  return <aside className="dev-audition" aria-label="開発用の固定条件試聴">
    {open&&<section id="dev-audition-panel">
      <header><strong>条件を変えて聴き比べる</strong><button type="button" aria-label="試聴パネルを閉じる" onClick={()=>setOpen(false)}>×</button></header>
      <p className="dev-audition-warning">合成条件の試聴です。衛星の実データではありません。</p>
      <p>① 晴れた森／晴れた海でテーマ音を比較。② 起伏・海岸、③ 風とBPMも変えられます。</p>
      <div className="dev-audition-presets" role="group" aria-label="試聴する風景">{AUDITION_PRESETS.map(p=><button key={p.id} type="button" aria-pressed={selected===p.id} onClick={()=>onSelect(p.id)}>{p.label}</button>)}</div>
      <p>{preset?preset.detail:'現在は実環境のデータで演奏します。'}</p>
      {preset&&<>
        <fieldset><legend>主旋律のテーマ音 · 試作</legend>
          <div className="dev-audition-presets" role="group" aria-label="主旋律の音色">
            <button type="button" aria-pressed={!modifiers.originalMotif} onClick={()=>onModifiers({...modifiers,originalMotif:false},true)}>テーマ音</button>
            <button type="button" aria-pressed={!!modifiers.originalMotif} onClick={()=>onModifiers({...modifiers,originalMotif:true},true)}>以前の音色</button></div>
          <p>{motifInstrument(preset.features.earthProfile,modifiers.originalMotif?'original':'themed')}</p>
          <div className="dev-audition-presets" role="group" aria-label="試聴する音の範囲">
            <button type="button" aria-pressed={!modifiers.motifOnly} onClick={()=>onModifiers({...modifiers,motifOnly:false},true)}>全体を聴く</button>
            <button type="button" aria-pressed={!!modifiers.motifOnly} onClick={()=>onModifiers({...modifiers,motifOnly:true},true)}>主旋律だけ</button></div>
          <small>森は弦を弾くハープ、海は水滴・泡を合成した音。同じBPM・雲量で以前の音色と比較できます。乾燥地・その他の陸地は従来の音です。</small>
        </fieldset>
        <button className="dev-audition-play" type="button" onClick={onTogglePlayback}>{playing?'試聴を一時停止':'試聴を再生'}</button>
        <fieldset><legend>山岳・起伏</legend><div className="dev-audition-presets" role="group" aria-label="試聴の起伏">
          <button type="button" aria-pressed={!modifiers.mountainous} onClick={()=>onModifiers({...modifiers,mountainous:false},true)}>平地</button>
          <button type="button" aria-pressed={modifiers.mountainous} onClick={()=>onModifiers({...modifiers,mountainous:true},true)}>山岳・起伏</button></div>
          <small>{modifiers.mountainous?'合成条件：標高1,800m・周辺標高差1,815m。音の跳躍と和音の広がりを追加。':'合成条件：標高100m・周辺標高差30m。'}海の割合が高いほど起伏の効果は弱まります。</small></fieldset>
        <fieldset><legend>海岸の混合</legend><div className="dev-audition-presets" role="group" aria-label="試聴の海陸混合">
          <button type="button" aria-pressed={modifiers.coastLandFraction===null} onClick={()=>onModifiers({...modifiers,coastLandFraction:null})}>元の地表</button>
          <button type="button" aria-pressed={modifiers.coastLandFraction!==null} onClick={()=>onModifiers({...modifiers,coastLandFraction:.5})}>海岸</button></div>
          {modifiers.coastLandFraction!==null&&<><label className="dev-audition-tempo" htmlFor="audition-coast">波と陸の割合 <output>波{Math.round((1-modifiers.coastLandFraction)*100)}% / 陸{Math.round(modifiers.coastLandFraction*100)}%</output></label>
            <input id="audition-coast" type="range" min="0" max="100" value={Math.round(modifiers.coastLandFraction*100)} onChange={e=>onModifiers({...modifiers,coastLandFraction:Number(e.target.value)/100})}/></>}
          <small>波と選択した陸地の自然音を混ぜます。「海」を選んだときの陸側は石の音です。</small></fieldset>
        <fieldset><legend>風とテンポ</legend><label className="dev-audition-tempo" htmlFor="audition-wind">合成風速 <output>{modifiers.wind.toFixed(1)} m/s</output></label>
          <input id="audition-wind" type="range" min="0" max="25" step=".1" value={modifiers.wind} onChange={e=>onModifiers({...modifiers,wind:Number(e.target.value)})}/>
          <div className="dev-audition-presets" role="group" aria-label="試聴のテンポモード"><button type="button" aria-pressed={settings.mode==='manual'} onClick={()=>onTempoChange({...settings,mode:'manual'})}>手動で固定</button><button type="button" aria-pressed={settings.mode==='auto'} onClick={()=>onTempoChange({...settings,mode:'auto'})}>風でAUTO</button></div>
          <label className="dev-audition-tempo" htmlFor="audition-bpm">手動BPM <output>{settings.manualBpm}</output></label>
          <input id="audition-bpm" type="range" min="80" max="150" value={settings.manualBpm} disabled={settings.mode==='auto'} onChange={e=>onTempoChange({...settings,manualBpm:Number(e.target.value)})}/>
          <small>{settings.mode==='auto'?`風から目標 ${tempo.bpm.toFixed(1)} BPMへ滑らかに追従`:`${settings.manualBpm} BPM固定。風による速さの違いは「風でAUTO」で試せます。`}</small></fieldset>
        <p>{preset.features.tonality==='major'?'長調（上向き・歯切れよく）':'短調（下向き・音をつないで）'}。起伏を変えると音の跳躍も変わります。</p>
      </>}
      <button className="dev-audition-live" type="button" aria-pressed={!selected} onClick={()=>onSelect(null)}>実環境に戻す</button>
      <small>地表で音色、雲で長短調、風でAUTOの速さ、起伏で音の跳躍、海陸割合で自然音の混合を決めます。地図と取得履歴は実環境の表示を続けます。</small>
    </section>}
    <button className="dev-audition-trigger" type="button" aria-expanded={open} aria-controls="dev-audition-panel" onClick={()=>setOpen(!open)}>{preset?`合成試聴中 · ${preset.label}`:'開発用 · 固定条件で試聴'}</button>
  </aside>;
}
