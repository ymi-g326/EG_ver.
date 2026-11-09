export type TerrainFeatures = { earthProfile: string; landProfile?: string; landFraction?: number; terrainRelief?: number | null; terrainElevation?: number | null; terrainRange?: number | null };
const clamp=(n:number,min=0,max=1)=>Math.min(max,Math.max(min,n));
export function deriveTerrainSound(f: TerrainFeatures) {
  const landFraction=Number.isFinite(f.landFraction) ? clamp(f.landFraction!) : f.earthProfile==='ocean'?0:1;
  const landProfile=['vegetated','arid','mixed'].includes(f.landProfile??'')? f.landProfile! : ['vegetated','arid','mixed'].includes(f.earthProfile)? f.earthProfile:'mixed';
  const relief=clamp(Number.isFinite(f.terrainRelief)? f.terrainRelief! : 0)*landFraction;
  const heightLift=Math.round(clamp((f.terrainElevation??0)/3500)*4*landFraction);
  return {landFraction,landProfile,oceanWeight:1-landFraction,landWeight:landFraction,coastal:landFraction>.08&&landFraction<.92,mixed:landFraction>0&&landFraction<1,relief,heightLift,
    leap:relief>.4?12:0, extraActivity:relief*.18};
}
export function terrainChord(shape:number[], relief:number) { return shape.map((n,i)=>n+(relief>.4&&i===1?12:0)); }
