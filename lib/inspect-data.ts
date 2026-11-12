export type InspectOrbit = {
  line1: string; line2: string; epoch: string; source: string;
  fetchedAt: string; mode: "live" | "reference";
};
export type InspectPosition = {
  latitude: number; longitude: number; altitude: number; velocity: number | null; timestamp: number;
};
export type InspectEnvironment = {
  temperature: number | null; cloudCover: number | null; windSpeed: number | null;
  windDirection?: number | null; waveHeight: number | null; oceanCurrent?: number | null;
  oceanCurrentUnit?: string | null; marineModelTime?: string | null;
  isDay: number | null; sampledAt?: string; weatherModelTime?: string | null;
  availability?: { weather: string; marine: string };
};

/** TLE mean elements; the period is derived from mean motion, not a measured lap time. */
export function orbitElements(orbit: InspectOrbit | null | undefined) {
  if (!orbit) return null;
  const line = orbit.line2;
  const inclination = Number(line.slice(8, 16));
  const ascendingNode = Number(line.slice(17, 25));
  const eccentricity = Number(`0.${line.slice(26, 33).trim()}`);
  const argumentOfPerigee = Number(line.slice(34, 42));
  const meanAnomaly = Number(line.slice(43, 51));
  const meanMotion = Number(line.slice(52, 63));
  if (line.length !== 69 || !line.startsWith("2 ") || ![inclination, ascendingNode, eccentricity, argumentOfPerigee, meanAnomaly, meanMotion].every(Number.isFinite)
      || inclination < 0 || inclination > 180 || eccentricity < 0 || eccentricity >= 1 || meanMotion <= 0) return null;
  return { inclination, ascendingNode, eccentricity, argumentOfPerigee, meanAnomaly, meanMotion, periodMinutes: 1440 / meanMotion };
}

export function utcTime(value: string | number | null | undefined) {
  if (value == null) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC") : "—";
}

export function orbitAgeHours(epoch: string | undefined, now: number) {
  if (!epoch) return null;
  const time = Date.parse(epoch);
  return Number.isFinite(time) && Number.isFinite(now) ? (now - time) / 3_600_000 : null;
}
