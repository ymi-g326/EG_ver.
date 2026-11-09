import type { AudioFeatures } from './audio-engine';
export type AuditionModifiers = {wind:number; mountainous:boolean; coastLandFraction:number|null; originalMotif?:boolean; motifOnly?:boolean};
export const DEFAULT_AUDITION_MODIFIERS: AuditionModifiers={wind:6,mountainous:false,coastLandFraction:null,originalMotif:false,motifOnly:false};
/** Synthetic controls only. The real map, weather and terrain history never use these. */
export function applyAuditionModifiers(features:AudioFeatures, modifiers:AuditionModifiers):AudioFeatures {
  const landProfile=features.earthProfile==='ocean'?'mixed':features.earthProfile;
  const landFraction=modifiers.coastLandFraction??(features.earthProfile==='ocean'?0:1);
  return {...features,motifStyle:modifiers.originalMotif?"original":"themed",motifOnly:!!modifiers.motifOnly,wind:modifiers.wind,landProfile,landFraction,
    terrainRelief:modifiers.mountainous ? .9 : 0,terrainElevation:modifiers.mountainous?1800:100,terrainRange:modifiers.mountainous?1815:30};
}
