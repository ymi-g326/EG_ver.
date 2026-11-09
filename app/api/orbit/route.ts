import { NextResponse } from "next/server";
import { MISSION } from "@/lib/mission";
import { parseOrbit, validateOrbit } from "@/lib/orbit";
import reference from "@/data/tenkoh2-reference.json";

const CELESTRAK_URL = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${MISSION.noradId}&FORMAT=TLE`;
const SATNOGS_URL = `https://db.satnogs.org/api/tle/?norad_cat_id=${MISSION.noradId}`;

export async function GET() {
  for (const source of ["CelesTrak", "SatNOGS"] as const) {
    try {
      const response = await fetch(source === "CelesTrak" ? CELESTRAK_URL : SATNOGS_URL, {
        headers: { "User-Agent": "EARTH-GROOVE-NUCC/0.1" },
        signal: AbortSignal.timeout(5000),
        next: { revalidate: 7200 },
      });
      if (!response.ok) throw new Error(`${source} unavailable`);
      let orbit;
      if (source === "CelesTrak") {
        orbit = parseOrbit(await response.text());
      } else {
        const items = await response.json() as { norad_cat_id: number; tle1: string; tle2: string }[];
        const item = items.find((entry) => entry.norad_cat_id === MISSION.noradId);
        if (!item) throw new Error("Ten-Koh 2 not found");
        orbit = validateOrbit(item.tle1, item.tle2);
      }
      return NextResponse.json({
        name: MISSION.englishName, noradId: MISSION.noradId,
        ...orbit, source, mode: "live", fetchedAt: new Date().toISOString(),
      }, { headers: { "Cache-Control": "public, s-maxage=300" } });
    } catch {
      // Try the next independent public source; never substitute another spacecraft.
    }
  }

  try {
    const orbit = validateOrbit(reference.line1, reference.line2);
    return NextResponse.json({
      name: MISSION.englishName, noradId: MISSION.noradId,
      ...orbit, source: reference.source, mode: "reference", fetchedAt: reference.fetchedAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "TEN-KOH 2 ORBIT UNAVAILABLE" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
