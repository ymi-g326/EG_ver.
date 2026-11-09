"use client";

import type { ExploreReading } from "@/hooks/use-explore-earth";
import { useEffect, useRef, useState } from "react";
import { EARTH_SOUND_SOURCES, type AudioDiagnostics, type AudioFeatures } from "@/lib/audio-engine";
import { motifInstrument } from "@/lib/theme-voice";
import { deriveTerrainSound } from "@/lib/terrain-sound";
import type { TerrainData } from "@/lib/terrain-data";
import { summarizeWind, type WindReading } from "@/lib/wind-analysis";
import { deriveCloudSound } from "@/lib/cloud-sound";
import { resolveTempo, WIND_BPM_POINTS, type TempoSettings } from "@/lib/audio-tempo";

type Inputs = {
  position: { latitude: number; longitude: number; timestamp: number } | null;
  orbit: { source: string; epoch: string; fetchedAt: string; mode: "live" | "reference" } | null;
  orbitStatus: string;
  imageReady: boolean; imageFailed: boolean; imageDate: string; imageAnalyzedAt?: string;
  features: AudioFeatures;
  imageCloud: number;
  environment: { temperature: number | null; cloudCover: number | null; windSpeed: number | null;
    windDirection: number | null; waveHeight: number | null; oceanCurrent: number | null; isDay: number | null; sampledAt?: string; weatherModelTime?: string | null; weatherIntervalSeconds?: number | null; windUnit?: string | null };
  weather: { status: string; latitude: number | null; longitude: number | null; receivedAt: string | null };
};
const value = (n: number | null | undefined, unit = "", digits = 1) => n == null || !Number.isFinite(n) ? "欠測" : `${n.toFixed(digits)}${unit}`;
const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
const time = (v?: string | number | null) => {
  if (v == null) return "未取得";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}（日付のみ）`;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "不明" : `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;
};

export default function DevAudioInspector({ inputs, settings, readDiagnostics, audition, exploration, groundSource, windReadings, terrain }: {
  exploration?: ExploreReading;
  terrain: {data:TerrainData|null;status:string;geography:{landFraction:number;coastal:boolean;extentDegrees:number;points:number}|null};
  windReadings: WindReading[];
  audition?: { label: string; features: AudioFeatures }; groundSource?: string;
  inputs: Inputs; settings: TempoSettings; readDiagnostics: () => AudioDiagnostics | null;
}) {
  const [open, setOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<AudioDiagnostics | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const refresh = () => setDiagnostics(readDiagnostics());
    const timer = window.setInterval(refresh, 200);
    return () => window.clearInterval(timer);
  }, [open, readDiagnostics]);
  const windSummary = summarizeWind(windReadings);
  const frame = diagnostics?.frame;
  const listening = !audition && diagnostics?.listeningMode !== undefined && diagnostics.listeningMode !== "original";
  const active = audition?.features ?? exploration?.features ?? inputs.features;
  const sky = deriveCloudSound(active);
  const profile = diagnostics?.listeningMode ?? "original";
  const tempo = resolveTempo(active, settings, diagnostics?.tempo.bpm, profile);
  const windMapping = WIND_BPM_POINTS.map(([wind]) => resolveTempo({wind}, {mode:"auto",manualBpm:80}, undefined, profile).bpm.toFixed(1)).join(" / ");
  const terrainSound = deriveTerrainSound(active);
  const events = diagnostics?.events ?? [];
  const source = EARTH_SOUND_SOURCES[frame?.profile ?? active.earthProfile];
  const close = () => dialogRef.current?.close();
  return <>
    <button className="dev-audio-trigger" type="button" onClick={() => {
      setDiagnostics(readDiagnostics()); setOpen(true); dialogRef.current?.showModal();
    }}>開発用 · データ → 音</button>
    <dialog className="dev-audio-inspector" ref={dialogRef} aria-labelledby="dev-audio-title"
      onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <header><div><span>DEVELOPMENT MONITOR</span><h2 id="dev-audio-title">取得データ → 音の変換 → 発音</h2></div>
        <button type="button" onClick={close} aria-label="音の開発モニターを閉じる">閉じる</button></header>
      <p className="dev-monitor-note">てんこう2からの直接受信は未接続。公開軌道・NASA画像・気象モデルを取得し、ブラウザで音を生成しています。</p>
      {exploration && !audition && <p className="dev-audition-warning">EXPLORE：{exploration.point.latitude.toFixed(3)}°, {exploration.point.longitude.toFixed(3)}° を演奏。気象モデル {time(exploration.weatherTime)}。01は衛星のLIVE側、02・03は選択地点の適用値・発音を表示します。</p>}
      {audition && <p className="dev-audition-warning">合成試聴中：{audition.label}。01の実環境データは現在の音へ適用せず、02・03に試聴の変換結果を表示します。</p>}
      <section><h3>01 · いま取得・参照しているもの</h3>
        <dl className="dev-inputs">
          <div><dt>軌道 / {inputs.orbit?.source ?? "取得待ち"}</dt><dd>{inputs.orbit ? `${inputs.orbit.mode === "reference" ? "保存済みTLE" : "公開TLE"} · 基準日時 ${time(inputs.orbit.epoch)}` : inputs.orbitStatus}<small>TLE取得処理の日時 {time(inputs.orbit?.fetchedAt)}</small></dd></div>
          <div><dt>位置 / 軌道から毎秒推定</dt><dd>{inputs.position ? `${inputs.position.latitude.toFixed(4)}°, ${inputs.position.longitude.toFixed(4)}°` : "位置未取得"}<small>計算日時 {time(inputs.position?.timestamp)}</small></dd></div>
          <div><dt>画像 / NASA GIBS</dt><dd>{inputs.imageFailed ? "画像取得に失敗" : inputs.imageReady ? `観測日 ${inputs.imageDate}` : "画像取得中"}<small>直下の解析日時 {time(inputs.imageAnalyzedAt)} · ライブ映像ではありません</small></dd></div>
          <div><dt>気象 / Open-Meteo</dt><dd>{inputs.weather.status}<small>適用中の気象地点 {value(inputs.weather.latitude, "°")} / {value(inputs.weather.longitude, "°")}<br />API応答受領 {time(inputs.weather.receivedAt)}（観測日時ではありません）</small></dd></div>
        </dl>
        <div className="dev-table-wrap"><table><thead><tr><th>入力値</th><th>現在値</th><th>音への用途</th></tr></thead><tbody>
          <tr><td>気温</td><td>{value(inputs.environment.temperature, "°C")}</td><td>取得・表示のみ。AUTOは風速に連動</td></tr>
          <tr><td>画像の明るさ / 彩度</td><td>{inputs.imageReady ? `${percent(inputs.features.brightness)} / ${percent(inputs.features.saturation)}` : "解析待ち"}</td><td>全体値。音の土台には雲候補を除いた地表値を使用</td></tr>
          <tr><td>模様 / 輪郭 / 変化量</td><td>{inputs.imageReady ? `${percent(inputs.features.variance)} / ${percent(inputs.features.edgeDensity)} / ${percent(inputs.features.delta)}` : "解析待ち"}</td><td>{listening ? "V2では解析値を記録。発音間隔はAMBIENT/GROOVEの編曲で決定" : "地表の模様・輪郭から旋律や打音の密度を決定。AUTOは風速に連動"}</td></tr>
          <tr><td>雲：画像推定 / 気象モデル</td><td>{inputs.imageReady ? percent(inputs.imageCloud) : "解析待ち"} / {value(inputs.environment.cloudCover, "%")}</td><td>混合値 {percent(inputs.features.cloud)} → 長短調・旋律・和音{listening ? "。V2の拍は音のスタイルで決定" : "。海では打音も変化"}</td></tr>
          <tr><td>画像の青さ / 緯度</td><td>{inputs.imageReady ? percent(inputs.features.blue) : "解析待ち"} / {inputs.position ? value(inputs.position.latitude, "°") : "未取得"}</td><td>{listening ? "海陸は地図で判定。V2の音の並びは小節から決定" : "海陸は地図で判定 / 緯度で音の並び"}</td></tr>
          <tr className="dev-unused"><td>昼夜</td><td>{inputs.environment.isDay === null ? "欠測" : inputs.environment.isDay ? "昼" : "夜"}</td><td>取得・表示のみ。長短調は雲量で決定</td></tr>
          <tr><td>風速</td><td>{value(inputs.environment.windSpeed, " m/s")}</td><td>AUTO / {profile.toUpperCase()}。0/3/6/10/15/20 m/s → {windMapping} BPM</td></tr>
          <tr className="dev-unused"><td>波高</td><td>{value(inputs.environment.waveHeight, " m")}</td><td>取得・表示のみ。発音処理では未使用</td></tr>
          <tr className="dev-unused"><td>風向 / 海流速度</td><td>{value(inputs.environment.windDirection, "°")} / {value(inputs.environment.oceanCurrent)}</td><td>取得のみ。発音処理では未使用</td></tr>
        </tbody></table></div>
      </section>
      <section aria-label="風速の取得履歴"><h3>01b · 風速の振れ幅・取得間隔</h3>
        <p className="dev-monitor-note">地表から10mの風速（m/s）。このページで受領した実環境データを最大512件記録します。同じ地点・同じモデル時刻の応答は重複計上せず、欠測を0にしません。再読込でリセットします。合成試聴中も実環境の風を記録します。</p>
        <dl className="dev-conversion">
          <div><dt>有効な記録数 / 取得した風速の範囲</dt><dd>{windSummary.count}件 / {value(windSummary.min, " m/s")} ～ {value(windSummary.max, " m/s")}</dd></div>
          <div><dt>中央値 / 90パーセンタイル</dt><dd>{value(windSummary.median, " m/s")} / {value(windSummary.p90, " m/s")}</dd></div>
          <div><dt>記録間隔の中央値 / モデルの刻み</dt><dd>{value(windSummary.gapMedian, "秒")} / {value(inputs.environment.weatherIntervalSeconds == null ? null : inputs.environment.weatherIntervalSeconds / 60, "分")}<small>記録間隔には地点の切替と通信時間が含まれます。同じ場所の風の変化周期ではありません。</small></dd></div>
          <div><dt>適用中の風 / モデル対象時刻</dt><dd>{value(inputs.environment.windSpeed, " m/s")} / {time(inputs.environment.weatherModelTime)}<small>API応答の受領時刻とは区別します。AUTOは風速で決定し、毎秒最大10 BPMで追従。欠測は直前の速さを維持、初回欠測は80 BPMで待機。</small></dd></div>
        </dl>
        <div className="dev-table-wrap"><table><thead><tr><th>風速帯（m/s）</th><th>記録数</th></tr></thead><tbody>{windSummary.bins.map(bin => <tr key={bin.from}><td>{bin.to === null ? `${bin.from}以上` : `${bin.from}以上～${bin.to}未満`}</td><td>{bin.count}</td></tr>)}</tbody></table></div>
        <button className="dev-audition-live" type="button" disabled={!windReadings.length} onClick={() => {
          const url = URL.createObjectURL(new Blob([JSON.stringify({ source: "Open-Meteo wind_speed_10m", unit: "m/s", summary: windSummary, readings: windReadings }, null, 2)], { type: "application/json" }));
          const link = document.createElement("a"); link.href = url; link.download = "earth-groove-wind-history.json"; link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}>風の記録を保存（JSON）</button>
      </section>
      <section><h3>01c · 地形と海岸の入力</h3>
        <dl className="dev-conversion"><div><dt>実環境の地形取得</dt><dd>{terrain.status}<small>{terrain.data?`${terrain.data.latitude}°, ${terrain.data.longitude}° · ${time(terrain.data.fetchedAt)}`:'有効な取得データがない場合、起伏の効果は中立です。'}</small></dd></div>
          <div><dt>実環境の標高 / 周辺9点の高低差</dt><dd>{value(terrain.data?.elevation,' m')} / {value(terrain.data?.range,' m')}</dd></div>
          <div><dt>実環境の海陸割合</dt><dd>{terrain.geography?`海 ${percent(1-terrain.geography.landFraction)} / 陸 ${percent(terrain.geography.landFraction)}`:'位置待ち'}</dd></div></dl>
        <p className="dev-monitor-note">標高：<a href="https://open-meteo.com/en/docs/elevation-api" target="_blank" rel="noreferrer">Copernicus DEM GLO-90 / Open-Meteo</a>。約1°の地点ごとに周辺0.8°の9点を参照します。海岸：簡略な世界地図の周辺6°・49点による海陸混在の概算。山頂や正確な岸線の判定ではありません。</p>
      </section>
      <section><h3>02 · エンジンが音に変えた値</h3>
        <p className="dev-monitor-note">{audition ? "合成条件 · 実環境の履歴は混合しません" : exploration ? "EXPLORE · 選択地点の画像・気象を使用" : `実環境 · 地表の判定：${groundSource ?? "画像待ち"}`}。海陸判定は縮尺1:1億1000万の地図による概算。画像の明るい無彩色を雲候補とし、雪・砂との誤判定があり得ます。</p>
        <dl className="dev-conversion">
          <div><dt>音のスタイル</dt><dd>{audition ? "V1 合成試聴" : diagnostics?.listeningMode?.toUpperCase() ?? "未作成"}<small>AMBIENT：連続した自然音と疎らな旋律。GROOVE：低音とブラシの拍を追加。</small></dd></div>
          <div><dt>テンポ</dt><dd>{settings.mode === "auto" ? "AUTO" : "手動"} · {diagnostics?.tempo.bpm.toFixed(1)??tempo.bpm.toFixed(1)} BPM<small>目標 {tempo.bpm.toFixed(1)} BPM / 風 {value(active.wind,' m/s')} / 手動設定 {tempo.manualBpm}<br />{tempo.source==='waiting'?'風待ち · 初期80 BPM':tempo.source==='held'?'風欠測 · 直前の速さを維持':settings.mode==='auto'?'毎秒最大10 BPMで追従':'手動で固定'}</small></dd></div>
          <div><dt>シンセの土台</dt><dd>{source.code} / {frame?.profile??active.earthProfile}<small>地表のシンセを維持。自然音は海陸割合で混合し、03に音源ごとの状態を表示。</small></dd></div>
          <div><dt>主旋律のテーマ</dt><dd>{frame?.motifInstrument??motifInstrument(active.earthProfile,active.motifStyle)}{(frame?.motifOnly??active.motifOnly)?' · 主旋律だけ':''}<small>森＝弦を弾く合成ハープ、海＝音程のある合成水滴・泡。葉・波の録音は別の層です。</small></dd></div>
          <div><dt>基準音 / 和音</dt><dd>{frame ? `MIDI ${frame.baseMidi} / ${frame.tonality === "major" ? "長調" : "短調"}` : "再生後に表示"}<small>適用雲量35%以下で長調、65%以上で短調。中間は直前の調を維持。晴れは上向きで短め、曇りは下向きで長めの旋律。</small></dd></div>
          <div><dt>フィルター / 余韻</dt><dd>{frame ? `${Math.round(frame.cutoffHz)} Hz / wet gain ${frame.reverbGain.toFixed(3)}` : "再生後に表示"}</dd></div>
          <div><dt>{listening ? "V2の発音間隔 / 入力" : "合間の音の発音しきい値 / 履歴"}</dt><dd>{listening ? `${diagnostics?.listeningMode === "ambient" ? "1小節に1〜2音" : "1小節に4音＋ブラシ2拍"} / 現在の地表値` : frame ? `${percent(frame.activity)} / ${frame.memoryCount}サンプル` : "再生後に表示"}<small>{listening ? "V2は現在の風景から演奏。4小節ごとに和音の根音を進めます" : audition ? "試聴の固定値1件のみ。実環境の記憶は使いません" : "毎拍の主旋律に加える音。直近最大160秒の実環境を混合"}</small></dd></div>
          <div><dt>地表 / 雲の役割</dt><dd>{active.earthProfile} · {listening ? "地表で音色、雲で長短調・音の長さ・余韻" : sky.sea ? "雲で長短調・旋律・打音を変化" : "地表音を保ち、雲で長短調・旋律・響きを変化"}<small>地表の明るさ {percent(sky.brightness)} / 彩度 {percent(sky.saturation)} / 輪郭 {percent(sky.edges)}<br />雲量 {percent(active.cloud)} / 濃淡 {percent(active.cloudTexture ?? 0)} / 縁 {percent(active.cloudEdges ?? 0)}</small></dd></div>
          <div><dt>起伏 / 海岸ミックスの適用値</dt><dd>起伏 {percent(frame?.terrainRelief??terrainSound.relief)} · 海 {percent(1-(frame?.landFraction??terrainSound.landFraction))} / 陸 {percent(frame?.landFraction??terrainSound.landFraction)}<small>地表の音色を保ち、起伏で旋律の跳躍と和音の配置を変化。波と {terrainSound.landProfile} の録音を割合で混合。</small></dd></div>
          <div><dt>最後に発音へ使った入力</dt><dd>{frame ? `${frame.source === "audition" ? "合成試聴" : frame.source === "explore" ? "EXPLORE 選択地点" : "実環境"} · 地表の明るさ ${percent(frame.brightness)} · 雲 ${percent(frame.cloud)}` : "再生後に表示"}<small>{frame ? `${time(frame.timestamp)} · ${frame.bpm.toFixed(1)} BPM` : ""}</small></dd></div>
        </dl>
      </section>
      <section><h3>03 · 実行中の発音と出力</h3>
        <p className="dev-monitor-note">自然音の音量 {Math.round((diagnostics?.natureLevel ?? .45) * 100)}% · スクラッチ {diagnostics?.scratch.ready ? "LIVE音声バッファ準備済み" : "合成音プレビュー"} · 保持した音 {diagnostics?.scratch.capturedSeconds.toFixed(2) ?? "0"}秒{diagnostics?.scratch.active ? " / 操作中" : ""}</p>
        <div className="dev-output"><span>AudioContext: {diagnostics?.contextState ?? "未作成"} · {diagnostics?.playing ? "再生中" : "停止中"}</span>
          <strong>出力 {diagnostics?.outputDb == null ? "—" : `${diagnostics.outputDb.toFixed(1)} dBFS`}</strong></div>
        <meter min="-100" max="0" value={diagnostics?.outputDb ?? -100} aria-label="ブラウザ内の音声出力レベル" />
        <p className="dev-monitor-note">マスター +{diagnostics?.masterBoostDb?.toFixed(0)??"—"} dB · ピーク {diagnostics?.outputPeakDb?.toFixed(1)??"—"} dBFS</p>
        <p className="dev-monitor-note">ブラウザ内の出力信号を計測。ログは再生時刻に到達した発音指示です。OSの音量やスピーカーの状態は含みません。</p>
        {diagnostics?.samples.map(sample=><p className="dev-sample-status" key={sample.profile}>自然音 {sample.profile}: 混合係数 {percent(sample.weight)} / 素材ゲイン {percent(sample.appliedGain)} / {sample.error?'読み込みエラー':sample.ready?'読み込み済み':'読み込み中'} / {sample.paused?'停止':'再生'}{(frame?.motifOnly??active.motifOnly)?' / 主旋律だけのため録音出力はミュート':''}</p>)}
        <ol className="dev-event-log" aria-label="発音ログ">
          {events.length === 0 ? <li>再生すると、4声の発音がここに流れます。</li> : events.slice(-12).reverse().map(event => <li key={event.id}>
            <time>{new Date(event.timestamp).toISOString().slice(11, 23)}</time><strong>{event.layer.toUpperCase()}</strong>
            <span>{event.instrument??event.profile} · {(event.frequencies.length ? event.frequencies.map(hz => `${hz.toFixed(1)} Hz`).join(" / ") : event.instrument === "NATURAL BED" ? "自然音の持続層" : "打音")}<small>基準音 / gain {event.level.toFixed(3)} · {event.bpm.toFixed(1)} BPM{event.duration == null ? "" : ` · 長さ ${event.duration.toFixed(2)}秒`}</small></span>
          </li>)}
        </ol>
      </section>
    </dialog>
  </>;
}
