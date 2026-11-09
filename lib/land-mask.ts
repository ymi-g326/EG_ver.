import { feature } from "topojson-client";
import topology from "world-atlas/land-110m.json" with { type: "json" };

type Ring = [number, number][];
type Geometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
type LandFeature = { type: "Feature"; geometry: Geometry };
const land = feature(topology as never, topology.objects.land as never) as unknown as LandFeature | { type: "FeatureCollection"; features: LandFeature[] };
const polygons = (land.type === "FeatureCollection" ? land.features : [land]).flatMap(f => f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates);
// The Antarctic coastline wraps the globe. Close its date-line seam via the
// South Pole, rather than drawing a false horizontal edge across the continent.
function closePolarRing(ring: Ring): Ring {
  if (Math.max(...ring.map(p => p[1])) > -60) return ring;
  const closed: Ring = [];
  for (let i = 0; i < ring.length; i++) {
    const here = ring[i], next = ring[(i + 1) % ring.length];
    closed.push(here);
    if (Math.abs(next[0] - here[0]) > 180) {
      const side = here[0] > 0 ? 180 : -180;
      const unwrapped = next[0] + (side > 0 ? 360 : -360);
      const lat = here[1] + (next[1] - here[1]) * (side - here[0]) / (unwrapped - here[0]);
      closed.push([side, lat], [side, -90], [-side, -90], [-side, lat]);
    }
  }
  return closed;
}
function unwrapRing(ring: Ring): Ring {
  if (Math.max(...ring.map(p => p[1])) < -60) return closePolarRing(ring);
  const continuous: Ring = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    let x = ring[i][0];
    const previous = continuous[i - 1][0];
    while (x - previous > 180) x -= 360;
    while (x - previous < -180) x += 360;
    continuous.push([x, ring[i][1]]);
  }
  return continuous;
}
const bounded = polygons.map(rings => rings.map(unwrapRing)).map(rings => ({ rings, minX: Math.min(...rings[0].map(p => p[0])), maxX: Math.max(...rings[0].map(p => p[0])), minY: Math.min(...rings[0].map(p => p[1])), maxY: Math.max(...rings[0].map(p => p[1])) }));
function inRing(x: number, y: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Geographic mask only, independent of cloud/colour; 110m coastline is approximate. */
export function isLandAt(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90) return null;
  const x = ((longitude + 180) % 360 + 360) % 360 - 180;
  return [x, x - 360, x + 360].some(longitude => bounded.some(p => longitude >= p.minX && longitude <= p.maxX && latitude >= p.minY && latitude <= p.maxY
    && inRing(longitude, latitude, p.rings[0]) && !p.rings.slice(1).some(hole => inRing(longitude, latitude, hole))));
}

/** Regional sea/land mix across the same approximate 6° image read window. */
export function surfaceMixAt(latitude:number,longitude:number) {
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90) return null;
  let land=0,total=0;
  for(let y=-3;y<=3;y++) for(let x=-3;x<=3;x++) {
    const point=isLandAt(latitude+y,longitude+x);
    if(point!==null){total++;if(point)land++;}
  }
  const landFraction=land/total;
  return {landFraction,coastal:landFraction>.08&&landFraction<.92,extentDegrees:6,points:total};
}
