/** Reject missing, blank and out-of-range coordinates; zero is a valid location. */
export function parseCoordinates(params: URLSearchParams) {
  const rawLat = params.get("lat"), rawLon = params.get("lon");
  if (!rawLat?.trim() || !rawLon?.trim()) return null;
  const latitude = Number(rawLat), longitude = Number(rawLon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}
