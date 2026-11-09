import { NextRequest, NextResponse } from "next/server";

type WeatherData = {
  current?: { temperature_2m?: number | null; cloud_cover?: number | null; wind_speed_10m?: number | null;
    wind_direction_10m?: number | null; is_day?: number | null; time?: string; interval?: number };
  current_units?: { wind_speed_10m?: string };
};

function bounded(value: string | null, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : null;
}

export async function GET(request: NextRequest) {
  const lat = bounded(request.nextUrl.searchParams.get("lat"), -90, 90);
  const lon = bounded(request.nextUrl.searchParams.get("lon"), -180, 180);

  if (lat === null || lon === null) {
    return NextResponse.json({ error: "INVALID COORDINATES" }, { status: 400 });
  }

  const weatherParams = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,cloud_cover,wind_speed_10m,wind_direction_10m,is_day",
    wind_speed_unit: "ms",
    timezone: "GMT",
    forecast_days: "1",
  });
  const marineParams = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "wave_height,ocean_current_velocity",
    timezone: "GMT",
    forecast_days: "1",
  });

  const [weather, marine] = await Promise.allSettled([
    fetch(`https://api.open-meteo.com/v1/forecast?${weatherParams}`, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 600 },
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Weather ${response.status}`);
      return (await response.json()) as WeatherData;
    }),
    fetch(`https://marine-api.open-meteo.com/v1/marine?${marineParams}`, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 600 },
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Marine ${response.status}`);
      return (await response.json()) as { current?: Record<string, number | null> };
    }),
  ]);

  const currentWeather = weather.status === "fulfilled" ? weather.value.current : null;
  const currentMarine = marine.status === "fulfilled" ? marine.value.current : null;

  return NextResponse.json(
    {
      temperature: currentWeather?.temperature_2m ?? null,
      cloudCover: currentWeather?.cloud_cover ?? null,
      windSpeed: currentWeather?.wind_speed_10m ?? null,
      windDirection: currentWeather?.wind_direction_10m ?? null,
      weatherModelTime: currentWeather?.time ? `${currentWeather.time}Z` : null,
      weatherIntervalSeconds: currentWeather?.interval ?? null,
      windUnit: weather.status === "fulfilled" ? weather.value.current_units?.wind_speed_10m ?? null : null,
      isDay: currentWeather?.is_day ?? null,
      waveHeight: currentMarine?.wave_height ?? null,
      oceanCurrent: currentMarine?.ocean_current_velocity ?? null,
      sampledAt: new Date().toISOString(),
      source: "Open-Meteo",
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
      },
    },
  );
}
