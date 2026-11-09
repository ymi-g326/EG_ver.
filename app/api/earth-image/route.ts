import { publicDataCors } from "@/lib/public-data-cors";
import { NextResponse } from "next/server";

function observationDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 2);
  return date.toISOString().slice(0, 10);
}

async function getData() {
  const date = observationDate();
  const params = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.1.1",
    LAYERS: "VIIRS_NOAA20_CorrectedReflectance_TrueColor",
    STYLES: "",
    FORMAT: "image/jpeg",
    TRANSPARENT: "false",
    HEIGHT: "720",
    WIDTH: "1440",
    SRS: "EPSG:4326",
    BBOX: "-180,-90,180,90",
    TIME: date,
  });

  try {
    const source = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${params}`;
    const response = await fetch(source, {
      signal: AbortSignal.timeout(12000),
      next: { revalidate: 21600 },
    });
    if (!response.ok) throw new Error(`NASA GIBS ${response.status}`);

    return new NextResponse(await response.arrayBuffer(), {
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
        "X-Earth-Observation-Date": date,
        "X-Earth-Imagery-Source": "NASA GIBS / VIIRS NOAA-20",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "EARTH IMAGERY UNAVAILABLE",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 },
    );
  }
}

export async function GET() { return publicDataCors(await getData()); }
