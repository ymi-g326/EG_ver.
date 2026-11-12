import type { GeoPoint } from "./globe-geometry";
export const mapPoint = (point: GeoPoint) => ({ x: (point.longitude + 180) / 3.6, y: (90 - point.latitude) / 1.8 });
export function geographicPath(points: GeoPoint[]) {
  let previous: GeoPoint | null = null;
  return points.map(point => {
    const p = mapPoint(point), pen = !previous || Math.abs(previous.longitude - point.longitude) > 180 ? "M" : "L";
    previous = point;
    return `${pen}${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  }).join(" ");
}
export function mapWindow(zoom: number, center: GeoPoint) {
  const scale = Math.max(1, Math.min(4, Number.isFinite(zoom) ? zoom : 1)), size = 100 / scale;
  const p = mapPoint(center);
  const x = Math.max(0, Math.min(100 - size, p.x - size / 2)), y = Math.max(0, Math.min(100 - size, p.y - size / 2));
  return { x, y, size, scale, center: { longitude: (x + size / 2) * 3.6 - 180, latitude: 90 - (y + size / 2) * 1.8 },
    longitudes: Array.from({ length: 7 }, (_, i) => (x + size * i / 6) * 3.6 - 180),
    latitudes: Array.from({ length: 5 }, (_, i) => 90 - (y + size * i / 4) * 1.8),
  };
}
