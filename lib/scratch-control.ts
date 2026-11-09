export const SCRATCH_RETURN_SECONDS = .68;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
/** Hand speed sets signed varispeed; inertia progressively hands playback back before resting. */
export function scratchControl(velocity:number,strength:number,held:boolean) {
  const v=Number.isFinite(velocity)?Math.max(-1,Math.min(1,velocity)):0;
  const s=Number.isFinite(strength)?clamp(strength):0;
  const phase=held?0:clamp((.5-s)/.4);
  const blend=phase*phase*(3-2*phase);
  return {rate:v*3.2*(1-blend)+blend,blend,
    musicGain:Math.sin(blend*Math.PI/2),scratchGain:Math.cos(blend*Math.PI/2)};
}
