"use client";

import { useState, type FormEvent } from "react";
import type { ReferenceSite } from "@/lib/orbit-inspection";
import { validReferenceSite } from "@/lib/orbit-inspection";
import { utcTime } from "@/lib/inspect-data";
import type { GeoPoint } from "@/lib/globe-geometry";
import type { useOrbitInspection } from "@/hooks/use-orbit-inspection";

type Props = {
  site: ReferenceSite; onSite: (site: ReferenceSite) => void; point: GeoPoint | null;
  inspection: ReturnType<typeof useOrbitInspection>;
};
const num = (v: number | undefined, digits = 1) => v == null || !Number.isFinite(v) ? "—" : v.toFixed(digits);
export default function OrbitReferencePanel({ site, onSite, point, inspection }: Props) {
  const [error, setError] = useState("");
  const { look, now, prediction } = inspection;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = ["latitude", "longitude", "heightKm", "minimumElevation"].map(key => String(form.get(key) ?? "").trim());
    const candidate = { latitude: Number(values[0]), longitude: Number(values[1]), heightKm: Number(values[2]), minimumElevation: Number(values[3]) };
    if (values.some(v => !v) || !validReferenceSite(candidate)) { setError("参照地点と仰角マスクの範囲を確認してください。"); return; }
    setError(""); onSite(candidate);
  };
  const above = look != null && look.elevation >= site.minimumElevation;
  const azimuth = (look?.azimuth ?? 0) * Math.PI / 180;
  const radius = 42 * (90 - Math.max(0, look?.elevation ?? 0)) / 90;
  const passes = prediction?.passes.filter(pass => now != null && pass.los >= now) ?? [];
  return <section className="v2-reference-site" aria-label="参照地点からの見え方と通過予測">
    <h2>REFERENCE SITE <span>{above ? "ABOVE MASK" : look ? "BELOW MASK" : "NO ORBIT"}</span></h2>
    <p className="v2-inspect-note">参照地点からの幾何学的な見え方。初期座標は例です。地上局との接続・通信可否を表すものではありません。入力座標はこの端末で計算します。</p>
    <form key={`${site.latitude}:${site.longitude}:${site.heightKm}:${site.minimumElevation}`} onSubmit={submit} className="v2-reference-form">
      <label>緯度 °<input name="latitude" type="number" step="any" min="-90" max="90" required defaultValue={site.latitude}/></label>
      <label>経度 °<input name="longitude" type="number" step="any" min="-180" max="180" required defaultValue={site.longitude}/></label>
      <label>楕円体高 km<input name="heightKm" type="number" step="any" min="-0.5" max="10" required defaultValue={site.heightKm}/></label>
      <label>仰角マスク °<input name="minimumElevation" type="number" step="1" min="0" max="85" required defaultValue={site.minimumElevation}/></label>
      <button type="submit">参照地点を適用</button><button type="button" disabled={!point} onClick={() => { if (point) { setError(""); onSite({ ...site, ...point, heightKm: 0 }); } }}>演奏地点を使う</button>
    </form>
    {error && <p role="alert" className="v2-inspect-note">{error}</p>}
    <div className="v2-look-angle-view">
      <svg viewBox="0 0 100 100" role="img" aria-label="参照地点の天空図。上が北、右が東、中央が天頂。">
        {[14,28,42].map(r => <circle key={r} cx="50" cy="50" r={r} className="v2-sky-grid"/>)}
        <path d="M8 50H92M50 8V92" className="v2-sky-grid"/>
        <circle cx="50" cy="50" r={42*(90-site.minimumElevation)/90} className="v2-sky-mask"/>
        <text x="50" y="6">N</text><text x="97" y="52">E</text><text x="50" y="99">S</text><text x="3" y="52">W</text>
        {look && look.elevation >= 0 && <circle cx={50+Math.sin(azimuth)*radius} cy={50-Math.cos(azimuth)*radius} r="2" className="v2-sky-satellite"/>}
      </svg>
      <dl><div><dt>AZIMUTH</dt><dd>{num(look?.azimuth)}°</dd></div><div><dt>ELEVATION</dt><dd>{num(look?.elevation)}°</dd></div><div><dt>SLANT RANGE</dt><dd>{num(look?.rangeKm)} km</dd></div></dl>
    </div>
    <h3>NEXT PASSES · UTC</h3>
    {passes.map(pass => <details key={pass.aos} className="v2-inspect-pass"><summary><span>{now != null && pass.aos <= now ? "進行中" : utcTime(pass.aos).slice(5,19)}<small>MAX EL {pass.maxElevation.toFixed(1)}°</small></span></summary><dl><dt>AOS / マスク上昇</dt><dd>{utcTime(pass.aos)} · AZ {pass.azimuthAtAos.toFixed(1)}°</dd><dt>MAX EL / 最大仰角時刻</dt><dd>{utcTime(pass.maxAt)}</dd><dt>LOS / マスク下降</dt><dd>{utcTime(pass.los)} · AZ {pass.azimuthAtLos.toFixed(1)}°</dd></dl></details>)}
    {!passes.length && <p className="v2-inspect-note">{prediction ? "探索範囲内に完結する通過はありません。" : "有効な軌道の取得を待っています。"}</p>}
    <p className="v2-inspect-note">予測基準：{utcTime(prediction?.generatedAt)}<br/>探索上限：{utcTime(prediction?.until)}<br/>最大24時間先、TLEの有効期間内。30秒刻みで探索し、交差を約0.5秒、最大仰角を約1秒の区間まで絞ります。これは計算の刻みで、予測精度の保証ではありません。地形遮蔽・大気屈折・アンテナ・電波条件・日照条件は含みません。</p>
  </section>;
}
