export type TerrainData = { latitude: number; longitude: number; elevation: number; range: number; relief: number; source: string; fetchedAt: string };
const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
const wrap=(x:number)=>((x+180)%360+360)%360-180;
/** Nine DEM points cover a regional 0.8° square around the canonical 1° cell. */
export function terrainGrid(latitude:number,longitude:number) {
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180) return null;
  const lat=Math.round(latitude), lon=wrap(Math.round(longitude));
  const points=[-.4,0,.4].flatMap(y=>[-.4,0,.4].map(x=>({latitude:clamp(lat+y,-90,90),longitude:wrap(lon+x)})));
  return {latitude:lat,longitude:lon,points};
}
export function analyzeElevation(elevations: unknown) {
  if(!Array.isArray(elevations)||elevations.length!==9||!elevations.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=-12000&&n<=10000)) return null;
  const range=Math.max(...elevations)-Math.min(...elevations);
  return {elevation:elevations[4] as number,range,relief:clamp((range-150)/1850,0,1)};
}
