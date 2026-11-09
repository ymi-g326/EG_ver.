"use client";
import { resolveTempo, type TempoInput, type TempoRuntime, type TempoSettings, type TempoProfile } from "@/lib/audio-tempo";
export default function TempoControls({ input, settings, onChange, ready, runtime, playing, synthetic=false, profile="original" }: {
  input: TempoInput; settings: TempoSettings; onChange: (next: TempoSettings) => void; ready: boolean;
  runtime: TempoRuntime | null; playing:boolean; synthetic?:boolean; profile?:TempoProfile;
}) {
  const tempo=resolveTempo(input,settings,runtime?.bpm,profile);
  const bpm=playing&&runtime?.mode===settings.mode?runtime.bpm:tempo.bpm;
  return <section className="tempo-control" aria-label="テンポ設定">
    <div className="tempo-heading"><span>BPM <output aria-label="現在のBPM">{ready||settings.mode==='manual'?bpm.toFixed(1):'—'}</output></span>
      <div className="tempo-switch" role="group" aria-label="テンポの決め方">
        <button type="button" aria-pressed={settings.mode==='auto'} onClick={()=>onChange({...settings,mode:'auto'})}>AUTO</button>
        <button type="button" aria-pressed={settings.mode==='manual'} onClick={()=>onChange({...settings,mode:'manual'})}>手動</button>
      </div></div>
    <label className="tempo-slider-label" htmlFor="manual-bpm">手動BPM <span>{settings.manualBpm}</span></label>
    <input id="manual-bpm" type="range" min="80" max="150" step="1" value={settings.manualBpm} disabled={settings.mode==='auto'} onChange={e=>onChange({...settings,manualBpm:Number(e.target.value)})} />
    <small>{synthetic?'合成試聴 · ':''}{settings.mode==='manual'?'80–150 BPM · 手動で固定':tempo.windAvailable?`風 ${tempo.wind!.toFixed(1)} m/s → 目標 ${tempo.bpm.toFixed(1)} BPM` : tempo.source==='held'?`風欠測 · ${tempo.bpm.toFixed(1)} BPMを維持`:'風待ち · 80 BPMで待機'}</small>
  </section>;
}
