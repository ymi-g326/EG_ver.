"use client";

import { useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { AudioDiagnostics, AudioFeatures, AudioLayer, ListeningMode } from "@/lib/audio-engine";
import type { TempoRuntime } from "@/lib/audio-tempo";
import { orbitAgeHours, orbitElements, utcTime, type InspectEnvironment, type InspectOrbit, type InspectPosition } from "@/lib/inspect-data";
import { MISSION } from "@/lib/mission";
import { motifInstrument } from "@/lib/theme-voice";
import { deriveTerrainSound } from "@/lib/terrain-sound";
import { listeningScore } from "@/lib/listening-score";
import type { TerrainData } from "@/lib/terrain-data";
import { VOICE_COLORS } from "@/lib/voice-colors";
import OrbitReferencePanel from "@/components/orbit-reference-panel";
import { orbitDisplayScale, EARTH_DISPLAY_RADIUS_KM } from "@/lib/globe-atmosphere";
import type { ReferenceSite } from "@/lib/orbit-inspection";
import type { GeoPoint } from "@/lib/globe-geometry";
import type { useOrbitInspection } from "@/hooks/use-orbit-inspection";

export type InspectDataProps = {
  orbit?: InspectOrbit | null; satelliteState?: InspectPosition | null;
  environment?: InspectEnvironment | null; terrain?: TerrainData | null; imageCloud?: number | null;
};
type Props = InspectDataProps & {
  features: AudioFeatures; listeningMode: ListeningMode; runtime: TempoRuntime | null;
  diagnostics: AudioDiagnostics | null; playing: boolean; ready: boolean;
  levels: Record<AudioLayer, number>; mode: "live" | "explore" | "local" | "audition";
  observation?: string; pending?: boolean;
  site: ReferenceSite; onSite: (site: ReferenceSite) => void; point: GeoPoint | null;
  inspection: ReturnType<typeof useOrbitInspection>;
};
const tabs = ["ORBIT", "ENVIRONMENT", "MISSION", "SOUND"] as const;
type Tab = typeof tabs[number];
const num = (n: number | null | undefined, digits = 1) => n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits);
const layers: [AudioLayer, string][] = [["motif", "MELODY"], ["pad", "HARMONY"], ["bass", "LOW END"], ["pulse", "RHYTHM"]];
const missions = [
  ["LINEAR TRANSPONDER", "リニアトランスポンダの連続運用", "世界のアマチュア無線家による利用とデータ取得を目指す。"],
  ["SPACE ENTERTAINMENT", "イラスト・音楽・映像のダウンリンク", "芸術学部と制作したコンテンツを宇宙から届ける。EGの地上生成音楽とは別のミッション。"],
  ["MICROWAVE", "マイクロ波帯通信技術の実証", "CWビーコン通信による通信方法の確立と普及。"],
  ["HIGH-SPEED DOWNLINK", "高速データ転送の技術実証", "JAMSAT開発の通信機で4FSK・38.4 kbpsの通信を実証する計画。"],
  ["CAMERA", "カメラペイロードの実証", "台湾・成功大学が開発したカメラで撮影とダウンリンクを行う計画。"],
  ["MATERIALS", "先端宇宙材料の劣化観測", "ひずみセンサーなどのデータから宇宙環境による材料の劣化を調べる。"],
  ["LIULIN", "高エネルギー荷電粒子の観測", "荷電粒子計測器Liulinによるジオスペース観測。"],
];

function Row({ label, value, kind, children }: { label: string; value: ReactNode; kind: string; children?: ReactNode }) {
  return <details className="v2-inspect-datum"><summary><span>{label}<small>{kind}</small></span><strong>{value}</strong></summary><div>{children}</div></details>;
}

export default function InspectPanels(p: Props) {
  const [tab, setTab] = useState<Tab>("ORBIT");
  const id = useId();
  const f = p.features, orbit = p.orbit, position = p.satelliteState, env = p.environment;
  const elements = orbitElements(orbit);
  const synthetic = p.mode === "local" || p.mode === "audition";
  const known = p.ready || p.playing;
  const currentScore = p.listeningMode !== "original" && f.source !== "audition";
  const terrain = deriveTerrainSound(f);
  const age = orbitAgeHours(orbit?.epoch, position?.timestamp ?? NaN);
  const score = listeningScore(f, p.listeningMode === "ambient", 0);
  const frame = p.diagnostics?.frame;
  const keyboardTabs = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault(); setTab(tabs[next]);
    document.getElementById(`${id}-tab-${tabs[next]}`)?.focus();
  };
  return <section className="v2-inspect-console" aria-label="専門データビュー">
    <div className="v2-inspect-tabs" role="tablist" aria-label="調べる対象">{tabs.map((name, index) => <button key={name} type="button" role="tab" id={`${id}-tab-${name}`} aria-selected={tab === name} aria-controls={`${id}-panel`} tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)} onKeyDown={event => keyboardTabs(event, index)}>{name === "ENVIRONMENT" ? "ENV" : name}</button>)}</div>
    <div className="v2-inspect-panel" role="tabpanel" tabIndex={0} id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`}>
      {tab === "ORBIT" && <>
        <div className="v2-inspect-panel-title"><span>ORBIT PROPAGATION</span><b>TEN-KOH 2 · {MISSION.noradId}</b></div>
        <p className="v2-inspect-note">公開TLEからSGP4で推定。衛星から直接受信した位置ではありません。地図の過去線も計算による再現です。</p>
        <Row label="緯度 / 経度" value={`${num(position?.latitude, 3)}° / ${num(position?.longitude, 3)}°`} kind="軌道計算">衛星直下点の測地緯度・経度。正は北緯・東経。計算時刻：{utcTime(position?.timestamp)}。表示桁数は精度の保証ではありません。</Row>
        <Row label="高度" value={`${num(position?.altitude)} km`} kind="軌道計算">satellite.jsのeciToGeodeticによる基準楕円体からの高度。地面からの高さではありません。</Row>
        <Row label="3Dの高度比" value={`HEIGHT ×1 · R ×${num(orbitDisplayScale(position?.altitude), 4)}`} kind="球体表示モデル">3D地球は半径{EARTH_DISPLAY_RADIUS_KM} kmの球体近似。描画半径＝1＋計算高度/{EARTH_DISPLAY_RADIUS_KM}。500 kmなら約1.0785倍。高度は固定せず、軌道の各点の計算値を使います。地形の凹凸と地球の扁平率は描画していません。マーカーと線の太さは視認用です。</Row>
        <Row label="速度" value={`${num(position?.velocity, 3)} km/s`} kind="軌道計算">SGP4が返すTEME座標系の速度ベクトルの大きさ。地表に対する移動速度とは異なります。取得できない場合は欠測。</Row>
        <Row label="軌道傾斜角 / 離心率" value={`${num(elements?.inclination, 3)}° / ${num(elements?.eccentricity, 7)}`} kind="TLE平均要素">昇交点赤経：{num(elements?.ascendingNode, 3)}°、近地点引数：{num(elements?.argumentOfPerigee, 3)}°、平均近点角：{num(elements?.meanAnomaly, 3)}°。</Row>
        <Row label="平均周期" value={`${num(elements?.periodMinutes, 2)} min`} kind="TLEから算出">1440 ÷ 平均運動。平均運動：{num(elements?.meanMotion, 8)} rev/day。現在の軌道を実測して一周を計った値ではありません。</Row>
        <Row label="TLE元期からの経過" value={`${num(age)} h`} kind={orbit?.mode === "reference" ? "保存軌道" : "公開軌道"}>元期：{utcTime(orbit?.epoch)}<br/>取得：{utcTime(orbit?.fetchedAt)}<br/>提供元：{orbit?.source ?? "—"}。元期は位置計算の基準時刻です。7日を超える軌道は使用しません。</Row>
        <details className="v2-inspect-reference"><summary>TLE原文・計算条件</summary><pre>{orbit ? `${orbit.line1}\n${orbit.line2}` : "軌道未取得"}</pre><p>地図：正距円筒図法。地上軌跡：現在から−46〜＋94分、15秒刻み。軌道要素は時刻とともに古くなり、予測誤差は一定ではありません。</p><a href={`https://celestrak.org/NORAD/elements/gp.php?CATNR=${MISSION.noradId}&FORMAT=TLE`} target="_blank" rel="noreferrer">CelesTrak ↗</a> · <a href={`https://db.satnogs.org/api/tle/?norad_cat_id=${MISSION.noradId}`} target="_blank" rel="noreferrer">SatNOGS ↗</a></details>
        <OrbitReferencePanel site={p.site} onSite={p.onSite} point={p.point} inspection={p.inspection}/>
      </>}
      {tab === "ENVIRONMENT" && <>
        <div className="v2-inspect-panel-title"><span>ENVIRONMENT</span><b>{synthetic ? "SYNTHETIC" : p.mode === "explore" ? "SELECTED POINT" : "SATELLITE NADIR"}</b></div>
        {synthetic ? <p className="v2-inspect-note">合成条件の試聴中。実際の地点の観測値としては表示しません。</p> : <>
          <Row label="地表画像" value={p.observation ?? "—"} kind="公開観測画像">NASA GIBS / NOAA-20 VIIRS Corrected Reflectance True Color。アプリは全世界1440×720画素の画像を取得し、約6°四方を40×40点で解析します。撮影瞬間を示す時刻は取得していません。てんこう2のカメラ画像ではありません。<br/><a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noreferrer">NASA Worldview ↗</a></Row>
          <Row label="画像の雲候補" value={`${num(p.imageCloud == null ? null : p.imageCloud * 100, 0)} %`} kind="画像解析">明るく彩度の低い画素の割合。雪・氷・砂などを含む可能性があり、気象学的な雲量の測定値ではありません。</Row>
          <Row label="モデル雲量" value={`${num(env?.cloudCover, 0)} %`} kind="気象モデル">Open-Meteoのcloud_cover。対象時刻：{utcTime(env?.weatherModelTime)}。画像と同時刻のデータとは限りません。</Row>
          <Row label="地上10 mの風速 / 風向" value={`${num(env?.windSpeed)} m/s · ${num(env?.windDirection, 0)}°`} kind="気象モデル">wind_speed_10m / wind_direction_10m。衛星高度の風ではありません。風向は風が吹いてくる方位。API要求地点は演奏地点の緯度・経度を1°単位に丸めています。</Row>
          <Row label="地上2 mの気温" value={`${num(env?.temperature)} °C`} kind="気象モデル">temperature_2m。対象時刻：{utcTime(env?.weatherModelTime)}。</Row>
          <Row label="波高" value={`${num(env?.waveHeight)} m`} kind="海象モデル">Open-Meteo Marineのwave_height。対象時刻：{utcTime(env?.marineModelTime)}。現在の通常演奏では音に使用していません。</Row>
          <Row label="海流速度" value={`${num(env?.oceanCurrent)} ${env?.oceanCurrentUnit ?? "(unit —)"}`} kind="海象モデル">ocean_current_velocity。単位は提供元の応答をそのまま使用。対象時刻：{utcTime(env?.marineModelTime)}。現在の通常演奏では音に使用していません。</Row>
          <Row label="地表の昼夜" value={env?.isDay == null ? "—" : env.isDay === 1 ? "DAY" : "NIGHT"} kind="気象API">気象APIのis_day。衛星自身の日照・日陰を表す値ではありません。現在の通常演奏では音に使用していません。</Row>
          <Row label="標高 / 周辺高低差" value={`${num(f.terrainElevation, 0)} / ${num(f.terrainRange, 0)} m`} kind="地形データから算出">1°単位に丸めた地点を中心とする約0.8°四方の9点から計算。高低差は最大−最小。起伏指標＝clamp((高低差−150)/1850, 0, 1)。<br/>提供元：{p.terrain?.source ?? "—"}<br/>取得：{utcTime(p.terrain?.fetchedAt)}</Row>
          <Row label="海陸比率" value={`LAND ${num(terrain.landFraction * 100, 0)} %`} kind="地図から概算">粗い海岸線データを約6°四方の49点でサンプルした割合。精密な面積比ではありません。地表の楽器分類も画像の色による推定です。</Row>
          <p className="v2-inspect-note">気象対象：{utcTime(env?.weatherModelTime)}<br/>API取得：{utcTime(env?.sampledAt)}<br/>WEATHER {env?.availability?.weather ?? (env?.windSpeed == null ? "欠測 / 未取得" : "値あり")} · MARINE {env?.availability?.marine ?? (env?.waveHeight == null ? "欠測 / 未取得" : "値あり")}<br/><a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">Open-Meteo ↗</a></p>
        </>}
      </>}
      {tab === "MISSION" && <>
        <div className="v2-inspect-panel-title"><span>MISSION DOSSIER</span><b>TEN-KOH 2</b></div>
        <p className="v2-inspect-note">日本大学・奥山研究室の公開資料に記載された目的。各機器の現在の稼働状態や達成状況を受信する接続はありません。</p>
        {missions.map(([code, title, text]) => <details key={code} className="v2-inspect-mission"><summary><small>{code}</small><strong>{title}</strong></summary><p>{text}</p><span>現在の実施状況：未確認</span></details>)}
        <p className="v2-inspect-note">公開資料確認：2026-11-12<br/><a href={MISSION.satelliteWebsite} target="_blank" rel="noreferrer">奥山研究室・ミッション原典 ↗</a><br/><a href={MISSION.website} target="_blank" rel="noreferrer">N.U Cosmic Campus ↗</a></p>
      </>}
      {tab === "SOUND" && <>
        <div className="v2-inspect-panel-title"><span>INPUT → SOUND</span><b>{synthetic ? "SYNTHETIC" : "GROUND GENERATED"}</b></div>
        {!currentScore && <p className="v2-inspect-note">従来エンジンによる比較試聴中。通常のAMBIENT／GROOVEとは発音規則が異なります。実際の発音は下の記録で確認できます。</p>}
        <Row label="風 → テンポ" value={`${num(known ? f.wind : null)} m/s → ${num(p.runtime?.bpm, 0)} BPM`} kind={p.runtime?.mode === "manual" ? "手動指定" : p.runtime?.source === "held" || p.runtime?.source === "waiting" ? "風欠測" : "音楽用変換"}>AUTO：風速0 / 3 / 6 / 10 / 15 / 20 m/sを80 / 95 / 110 / 125 / 140 / 150 BPMへ区間補間。AMBIENTは全体を80–100へ縮小。GROOVEは80–150。目標：{num(p.runtime?.targetBpm, 0)} BPM。AUTOは最大10 BPM/秒で移行。風欠測時は直前値を維持し、初回は80。MANUALは風に連動しません。</Row>
        <Row label="音楽用雲指標 → 調性" value={`${num(known ? f.cloud : null, 2)} → ${known ? f.tonality.toUpperCase() : "—"}`} kind="音楽用変換">画像の雲候補率とモデル雲量を平均。モデル欠測時は画像のみ。0.35以下で長調、0.65以上で短調、その間は前の調性を保持。気象・感情の科学的分類ではなくEGの作曲ルールです。</Row>
        <Row label="地表 → 楽器" value={known ? motifInstrument(f.earthProfile, f.motifStyle) : "—"} kind={synthetic ? "合成条件" : "画像・地図から推定"}>植生はハープ、海は水滴・泡、乾燥地・その他の陸はFM系合成音。自然音の背景は事前録音素材で、現地からの生中継ではありません。</Row>
        {currentScore && <><Row label="模様 → 装飾" value={`${num(known ? frame?.activity ?? score.detail : null, 2)} → ${known ? frame?.ornamentNotesPerBar ?? score.ornamentSteps.length : "—"} notes/bar`} kind="音楽用変換">海：雲の質感×0.55＋雲の輪郭×0.45。陸：地表の輪郭×0.7＋地表のばらつき×0.3。GROOVEの追加装飾は最大4音/小節。AMBIENTとBREATH区間は装飾なし。</Row>
        <Row label="起伏 → 音域" value={known ? terrain.leap ? "+12 st (phrase)" : "FLOW" : "—"} kind="音楽用変換">海陸比率で重み付けした起伏が0.4を超えると、4小節に1度、メロディーを1オクターブ上げる。標高でも基準音を最大4半音上げます。</Row>
        <Row label="明るさ → 基準音" value={known ? `MIDI ${frame?.baseMidi ?? 40 + Math.round((f.groundBrightness ?? f.brightness) * 7) + terrain.heightLift}` : "—"} kind="音楽用変換">基準音＝40＋round(地表の明るさ×7)＋標高による上昇。和音の進行やメロディーの音程はこの基準から決めます。</Row>
        <Row label="彩度 → フィルター" value={`${num(known ? frame?.cutoffHz ?? 1400 + (f.groundSaturation ?? f.saturation) * 2100 : null, 0)} Hz`} kind="音楽用変換">ローパスの目標周波数＝1400＋地表の彩度×2100。音の明るさを変えます。</Row>
        <Row label="雲指標 → 残響" value={num(known ? frame?.reverbGain ?? .2 + f.cloud * .12 : null, 3)} kind="音楽用変換">残響ゲイン＝0.20＋音楽用雲指標×0.12。気象の測定値ではなく、エフェクトの音量設定です。</Row>
        <Row label="フレーズ / 基本音数" value={`${frame?.phrase?.toUpperCase() ?? score.phrase.toUpperCase()} · ${frame?.motifNotesPerBar ?? score.motifSteps.length}/bar`} kind="作曲上の構成">8小節でFLOW → LIFT → BREATH。GROOVEの基本メロディーは8音、最後の小節は4音。最後はキックとベースも間引きます。この周期は衛星の観測値ではありません。</Row></>}
        <div className="v2-inspect-voices" aria-label="4パートの発音">{layers.map(([layer, name]) => <div key={layer} style={{ "--voice-color": VOICE_COLORS[layer] } as CSSProperties}><span><i/>{name}</span><meter min="0" max="1" value={p.playing ? p.levels[layer] : 0} aria-label={`${name}の発音`}/><small>{p.playing ? layer === "pulse" && p.listeningMode === "ambient" ? "REST" : "ACTIVE" : "STANDBY"}</small></div>)}</div>
        <details className="v2-inspect-reference"><summary>直近の発音記録</summary><p>先読みで予約された音を含みます。停止中は直前の記録です。</p><ol className="v2-inspect-events">{p.diagnostics?.events.slice(-12).reverse().map(event => <li key={event.id}><span>{event.audioTime.toFixed(2)}s · {event.layer}</span><b>{event.instrument}</b><small>{event.frequencies.length ? event.frequencies.map(value => `${value.toFixed(1)} Hz`).join(" / ") : "noise / texture"}</small></li>)}</ol></details>
      </>}
    </div>
  </section>;
}
