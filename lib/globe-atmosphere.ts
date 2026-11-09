import { projectGlobe, type GeoPoint } from "./globe-geometry";
export type OrbitalPoint = GeoPoint & { altitude?: number };
const EARTH_RADIUS_KM = 6371;
const RAD = Math.PI / 180;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** Orthographic orbit at its real geocentric radius; far-side points outside the limb remain visible. */
export function projectOrbit(point: OrbitalPoint, longitude: number, latitude: number, fallbackAltitude = 0) {
  const altitude = Number.isFinite(point.altitude) ? point.altitude! : fallbackAltitude;
  const scale = 1 + Math.max(0, Number.isFinite(altitude) ? altitude : 0) / EARTH_RADIUS_KM;
  const p = projectGlobe(point, longitude, latitude);
  return { x: p.x * scale, y: p.y * scale, z: p.z * scale,
    visible: p.z >= 0 || (p.x * p.x + p.y * p.y) * scale * scale > 1 };
}

/** Same bright / unsaturated proxy as the sound analysis, softened for a translucent image layer. */
export function cloudAlpha(r: number, g: number, b: number) {
  const max = Math.max(r,g,b)/255, min = Math.min(r,g,b)/255, light = (max+min)/2;
  const denominator = 1-Math.abs(2*light-1);
  const saturation = max===min || denominator<=0 ? 0 : (max-min)/denominator;
  return Math.round(255*clamp((light-.62)/.3)*clamp((.25-saturation)/.18));
}

/** Inverse of projectGlobe for the visible hemisphere. */
export function globeTextureSample(x: number, y: number, longitude: number, latitude: number) {
  const square=1-x*x-y*y;
  if(square<0)return null;
  const z=Math.sqrt(square), tilt=latitude*RAD;
  const lat=Math.asin(Math.max(-1,Math.min(1,z*Math.sin(tilt)-y*Math.cos(tilt))))/RAD;
  const lon=longitude+Math.atan2(x,z*Math.cos(tilt)+y*Math.sin(tilt))/RAD;
  return { u:((lon+180)/360%1+1)%1, v:clamp((90-lat)/180), depth:z };
}
