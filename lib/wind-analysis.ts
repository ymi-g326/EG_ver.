/** Development measurements only: no artificial wind and no upper clipping. */
export type WindReading = {
  receivedAt: string; latitude: number; longitude: number; wind: number;
  modelTime: string | null; intervalSeconds: number | null;
};
export const MAX_WIND_READINGS = 512;
export function recordWind(readings: WindReading[], next: Omit<WindReading, "wind"> & { wind: number | null }): WindReading[] {
  if (next.wind === null || !Number.isFinite(next.wind) || next.wind < 0 ||
    !Number.isFinite(next.latitude) || !Number.isFinite(next.longitude) || !Number.isFinite(Date.parse(next.receivedAt))) return readings;
  // A repeated response for the same model step/grid is not a new independent reading.
  if (next.modelTime && readings.some(r => r.latitude === next.latitude && r.longitude === next.longitude && r.modelTime === next.modelTime)) return readings;
  return [...readings, { ...next, wind: next.wind }].slice(-MAX_WIND_READINGS);
}
export function summarizeWind(readings: WindReading[]) {
  const speeds = readings.map(r => r.wind).sort((a, b) => a - b);
  const quantile = (values: number[], p: number) => {
    if (!values.length) return null;
    const at = (values.length - 1) * p, lo = Math.floor(at);
    return values[lo] + (values[Math.ceil(at)] - values[lo]) * (at - lo);
  };
  const gaps = readings.slice(1).map((r, i) => (Date.parse(r.receivedAt) - Date.parse(readings[i].receivedAt)) / 1000)
    .filter(n => n > 0).sort((a, b) => a - b);
  return { count: speeds.length, min: quantile(speeds, 0), median: quantile(speeds, .5), p90: quantile(speeds, .9), max: quantile(speeds, 1),
    gapMedian: quantile(gaps, .5), modelIntervals: [...new Set(readings.map(r => r.intervalSeconds).filter(n => n !== null))],
    bins: [0,3,6,10,15,20].map((from, i, limits) => ({ from, to: limits[i+1] ?? null,
      count: speeds.filter(n => n >= from && (limits[i+1] === undefined || n < limits[i+1])).length })),
  };
}
